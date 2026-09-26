import fs from 'node:fs';
import path from 'node:path';
import { inflateSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

const assert = (ok, message) => { if (!ok) throw new Error(message); };
const integer = (n, min = 1) => Number.isSafeInteger(n) && n >= min;
export function crc32(data) {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
export function inspectPng(bytes) {
  assert(bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')), 'Invalid PNG signature');
  let pos = 8, header, palette, transparency, ended = false;
  const compressed = [];
  while (pos < bytes.length) {
    assert(pos + 12 <= bytes.length, 'Truncated PNG chunk');
    const length = bytes.readUInt32BE(pos), end = pos + 12 + length;
    assert(end <= bytes.length, 'PNG chunk extends beyond file');
    const type = bytes.toString('ascii', pos + 4, pos + 8), data = bytes.subarray(pos + 8, pos + 8 + length);
    assert(crc32(bytes.subarray(pos + 4, pos + 8 + length)) === bytes.readUInt32BE(end - 4), 'PNG checksum mismatch: ' + type);
    if (type === 'IHDR') { assert(!header && pos === 8 && length === 13, 'Invalid PNG header'); header = data; }
    if (type === 'PLTE') palette = data;
    if (type === 'tRNS') transparency = data;
    if (type === 'IDAT') compressed.push(data);
    pos = end;
    if (type === 'IEND') { assert(length === 0, 'Invalid IEND'); ended = true; break; }
  }
  assert(header && ended && pos === bytes.length && compressed.length, 'Incomplete PNG');
  const width = header.readUInt32BE(0), height = header.readUInt32BE(4), depth = header[8], type = header[9];
  assert(width > 0 && height > 0 && width * height <= 4194304, 'PNG exceeds checker limit of 4,194,304 pixels');
  assert(header[10] === 0 && header[11] === 0 && header[12] === 0, 'Use a non-interlaced PNG export');
  const channels = ({ 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 })[type];
  assert(channels && (depth === 8 || (type === 3 && [1, 2, 4].includes(depth))), 'Unsupported PNG sample format; export 8-bit RGB/RGBA or indexed');
  if (type === 3) assert(palette && palette.length % 3 === 0, 'Indexed PNG palette missing');
  const stride = Math.ceil(width * channels * depth / 8), bpp = Math.max(1, Math.ceil(channels * depth / 8));
  const decoded = inflateSync(Buffer.concat(compressed), { maxOutputLength: (stride + 1) * height });
  assert(decoded.length === (stride + 1) * height, 'Incorrect PNG scanline length');
  let previous = Buffer.alloc(stride), visiblePixels = 0, transparentPixels = 0, intermediateAlphaPixels = 0;
  const colors = new Set();
  for (let y = 0; y < height; y++) {
    const filter = decoded[y * (stride + 1)], row = Buffer.from(decoded.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)));
    assert(filter <= 4, 'Unknown PNG filter');
    for (let x = 0; x < stride; x++) {
      const left = x >= bpp ? row[x - bpp] : 0, up = previous[x], ul = x >= bpp ? previous[x - bpp] : 0;
      let predictor = 0;
      if (filter === 1) predictor = left;
      if (filter === 2) predictor = up;
      if (filter === 3) predictor = Math.floor((left + up) / 2);
      if (filter === 4) { const p = left + up - ul, a = Math.abs(p - left), b = Math.abs(p - up), c = Math.abs(p - ul); predictor = a <= b && a <= c ? left : b <= c ? up : ul; }
      row[x] = (row[x] + predictor) & 255;
    }
    for (let x = 0; x < width; x++) {
      let r, g, b, a = 255;
      if (type === 3) {
        const index = (row[Math.floor(x * depth / 8)] >> (8 - depth - (x * depth % 8))) & ((1 << depth) - 1);
        assert(index * 3 + 2 < palette.length, 'PNG palette index out of bounds');
        [r, g, b] = palette.subarray(index * 3, index * 3 + 3); a = transparency?.[index] ?? 255;
      } else {
        const offset = x * channels;
        if (type === 0 || type === 4) { r = g = b = row[offset]; if (type === 4) a = row[offset + 1]; else if (transparency && r === transparency.readUInt16BE(0)) a = 0; }
        else { [r, g, b] = row.subarray(offset, offset + 3); if (type === 6) a = row[offset + 3]; else if (transparency && r === transparency.readUInt16BE(0) && g === transparency.readUInt16BE(2) && b === transparency.readUInt16BE(4)) a = 0; }
      }
      if (a === 0) transparentPixels++;
      else { visiblePixels++; colors.add([r, g, b, a].map(v => v.toString(16).padStart(2, '0')).join('')); if (a < 255) intermediateAlphaPixels++; }
    }
    previous = row;
  }
  return { width, height, visiblePixels, transparentPixels, intermediateAlphaPixels, visibleColorCount: colors.size };
}

export function inspectAseprite(bytes) {
  assert(bytes.length >= 128 && bytes.readUInt16LE(4) === 0xa5e0, 'Invalid Aseprite header');
  assert(bytes.readUInt32LE(0) === bytes.length, 'Aseprite file size mismatch');
  const frameCount = bytes.readUInt16LE(6), width = bytes.readUInt16LE(8), height = bytes.readUInt16LE(10);
  assert(frameCount > 0 && width > 0 && height > 0, 'Empty Aseprite source');
  let position = 128, layerChunks = 0, celChunks = 0;
  const durations = [];
  for (let frame = 0; frame < frameCount; frame++) {
    assert(position + 16 <= bytes.length && bytes.readUInt16LE(position + 4) === 0xf1fa, 'Invalid Aseprite frame');
    const size = bytes.readUInt32LE(position), end = position + size;
    assert(size >= 16 && end <= bytes.length, 'Truncated Aseprite frame');
    const oldCount = bytes.readUInt16LE(position + 6), newCount = bytes.readUInt32LE(position + 12), count = newCount || oldCount;
    durations.push(bytes.readUInt16LE(position + 8) || bytes.readUInt16LE(16));
    let chunk = position + 16;
    for (let i = 0; i < count; i++) {
      assert(chunk + 6 <= end, 'Truncated Aseprite chunk');
      const chunkSize = bytes.readUInt32LE(chunk), type = bytes.readUInt16LE(chunk + 4);
      assert(chunkSize >= 6 && chunk + chunkSize <= end, 'Invalid Aseprite chunk length');
      if (type === 0x2004) layerChunks++;
      if (type === 0x2005) celChunks++;
      chunk += chunkSize;
    }
    assert(chunk === end, 'Aseprite frame has unparsed bytes'); position = end;
  }
  assert(position === bytes.length && layerChunks > 0 && celChunks > 0, 'Source has missing layers/cels or trailing data');
  return { width, height, frameCount, durations, layerChunks, celChunks };
}

export function validateAssets(rootPath, { requireStyle = false } = {}) {
  const root = fs.realpathSync(rootPath), checks = [], assets = [];
  function resolveFile(name) {
    assert(typeof name === 'string' && name && !path.isAbsolute(name) && !name.includes('\\') && !name.split('/').includes('..'), 'Invalid asset path: ' + name);
    const full = fs.realpathSync(path.join(root, name)), relative = path.relative(root, full);
    assert(relative && relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative), 'Asset path escapes output folder');
    assert(fs.statSync(full).isFile() && fs.statSync(full).size > 0 && fs.statSync(full).size <= 33554432, 'Missing, empty or oversized file: ' + name);
    return full;
  }
  function check(name, fn) { try { fn(); checks.push({ name, passed: true }); } catch (error) { checks.push({ name, passed: false, error: error.message }); } }
  let manifest;
  check('manifest', () => {
    manifest = JSON.parse(fs.readFileSync(resolveFile('manifest.json'), 'utf8'));
    assert(manifest.version === 1 && Array.isArray(manifest.assets) && manifest.assets.length > 0, 'Expected manifest version 1 with assets');
    assert(new Set(manifest.assets.map(a => a.id)).size === manifest.assets.length, 'Duplicate asset IDs');
  });
  if (requireStyle || fs.readdirSync(root).includes('STYLE.md')) check('style guide', () => resolveFile('STYLE.md'));
  else checks.push({ name: 'style guide', passed: true, skipped: true, reason: 'Optional guide was not required or delivered.' });
  check('overview preview', () => { const info = inspectPng(fs.readFileSync(resolveFile('preview.png'))); assert(info.visiblePixels > 0, 'Overview preview is blank'); });
  if (Array.isArray(manifest?.assets)) for (const asset of manifest.assets) check('asset ' + asset.id, () => {
    assert(typeof asset.id === 'string' && /^[a-z0-9][a-z0-9_-]*$/.test(asset.id), 'Invalid asset ID');
    assert(integer(asset.width) && integer(asset.height) && integer(asset.frames), 'Asset width, height and frames must be positive integers');
    assert(typeof asset.source === 'string' && /\.aseprite$/i.test(asset.source), 'Editable .aseprite source required');
    const source = inspectAseprite(fs.readFileSync(resolveFile(asset.source)));
    assert(source.width === asset.width && source.height === asset.height && source.frameCount === asset.frames, 'Manifest dimensions/frame count differ from source');
    const sheet = inspectPng(fs.readFileSync(resolveFile(asset.sheet)));
    assert(sheet.visiblePixels > 0, 'Exported sheet is fully transparent');
    if (asset.paletteLimit !== undefined) assert(integer(asset.paletteLimit) && sheet.visibleColorCount <= asset.paletteLimit, 'Sheet exceeds the manifest palette limit (visible RGBA colors)');
    const metadata = JSON.parse(fs.readFileSync(resolveFile(asset.metadata), 'utf8'));
    const frames = Array.isArray(metadata.frames) ? metadata.frames : Object.values(metadata.frames ?? {});
    assert(frames.length === asset.frames, 'Export metadata frame count differs from source');
    assert(metadata.meta?.size?.w === sheet.width && metadata.meta?.size?.h === sheet.height, 'Sheet dimensions differ from export metadata');
    frames.forEach((frame, index) => {
      const r = frame.frame;
      assert(r && integer(r.x, 0) && integer(r.y, 0) && integer(r.w) && integer(r.h) && r.x + r.w <= sheet.width && r.y + r.h <= sheet.height, 'Frame rectangle outside the PNG sheet');
      assert(frame.sourceSize?.w === asset.width && frame.sourceSize?.h === asset.height, 'Frame source size differs from manifest');
      assert(integer(frame.duration) && frame.duration === source.durations[index], 'Frame timing differs from Aseprite source');
    });
    for (const tag of metadata.meta?.frameTags ?? []) assert(integer(tag.from, 0) && integer(tag.to, 0) && tag.from <= tag.to && tag.to < frames.length, 'Animation tag outside frame range');
    const preview = inspectPng(fs.readFileSync(resolveFile(asset.preview))); assert(preview.visiblePixels > 0, 'Asset preview is blank');
    assets.push({ id: asset.id, source, sheet, preview });
  });
  return { passed: checks.every(c => c.passed), checkedAt: new Date().toISOString(), checks, assets,
    scope: 'File structure, source frame headers and chunks, PNG pixels/checksums, dimensions, palette limits and export metadata. Does not judge visual quality or prove pixel equivalence between source and export.' };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2), requireStyle = args.includes('--require-style');
    const positional = args.filter(arg => arg !== '--require-style');
    if (positional.length > 1 || positional.some(arg => arg.startsWith('--'))) throw Error('Usage: validate-assets.mjs [output-directory] [--require-style]');
    const root = path.resolve(positional[0] || 'artifacts/pixel-art');
    const automated = validateAssets(root, { requireStyle }), output = path.join(root, 'validation.json');
    if (fs.existsSync(output) && fs.lstatSync(output).isSymbolicLink()) throw Error('Validation output cannot be a symlink');
    let previous = {};
    if (fs.existsSync(output)) previous = JSON.parse(fs.readFileSync(output, 'utf8'));
    const report = { ...previous, automated, visual: previous.visual ?? { status: 'not_recorded', inspected: [], findings: [], limitations: ['Visual inspection has not been recorded.'] } };
    fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify(automated, null, 2)); process.exitCode = automated.passed ? 0 : 1;
  } catch (error) { console.error('Asset check failed: ' + error.message); process.exitCode = 1; }
}
