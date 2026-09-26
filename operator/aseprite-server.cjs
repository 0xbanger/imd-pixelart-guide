'use strict';
// IMD launcher for the unchanged, separately built mattt/aseprite-mcp.
// The complete MCP process and its Aseprite children run in a Linux namespace.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawn, execFileSync } = require('node:child_process');

function inside(parent, child) {
  const rel = path.relative(parent, child);
  return rel !== '' && rel !== '..' && !rel.startsWith('..' + path.sep) && !path.isAbsolute(rel);
}

function argumentsFor(config, work) {
  const root = fs.realpathSync(work);
  const bin = fs.realpathSync(config.asepriteDirectory);
  const mcp = fs.realpathSync(config.mcpExecutable);
  if (!config.workspaceRoots.some(p => inside(fs.realpathSync(p), root))) {
    throw Error('The working directory must be an assignment below an operator-approved workspace root.');
  }
  if (!fs.statSync(root).isDirectory() || !fs.statSync(mcp).isFile()) throw Error('Invalid workspace or MCP executable.');
  fs.accessSync(path.join(bin, 'aseprite'), fs.constants.X_OK);
  const args = [
    '--unshare-all', '--die-with-parent', '--new-session', '--cap-drop', 'ALL',
    '--ro-bind', '/usr', '/usr', '--symlink', 'usr/bin', '/bin',
    '--symlink', 'usr/lib', '/lib', '--symlink', 'usr/lib64', '/lib64',
    '--proc', '/proc', '--dev', '/dev', '--tmpfs', '/tmp',
    '--dir', '/etc', '--ro-bind-try', '/etc/ld.so.cache', '/etc/ld.so.cache',
    '--ro-bind', bin, '/opt/aseprite', '--ro-bind', mcp, '/opt/aseprite-mcp',
    '--bind', root, root
  ];
  // IMD pinned inputs and repository metadata can be read, never edited by Lua.
  for (const name of ['.git', '.imd', '.agents', '.codex', '.github']) {
    const candidate = path.join(root, name);
    if (fs.existsSync(candidate)) {
      if (fs.lstatSync(candidate).isSymbolicLink()) throw Error('Protected workspace entry is a symlink: ' + name);
      args.push('--ro-bind', candidate, candidate);
    }
  }
  args.push('--clearenv', '--setenv', 'HOME', '/tmp/aseprite-home',
    '--setenv', 'XDG_CONFIG_HOME', '/tmp/aseprite-home/config',
    '--setenv', 'PATH', '/usr/bin:/bin', '--setenv', 'LANG', 'C.UTF-8',
    '--dir', '/tmp/aseprite-home', '--chdir', root,
    '--', '/opt/aseprite-mcp', '--workspace', root, '--aseprite', '/opt/aseprite/aseprite',
    '--timeout', '90s', '--max-image-bytes', '16777216');
  return args;
}

module.exports = { inside, argumentsFor };
if (require.main === module) {
  try {
    if (process.platform !== 'linux' || process.getuid() === 0) throw Error('Run this launcher as a non-root Linux worker.');
    const config = JSON.parse(fs.readFileSync(path.join(__dirname, 'operator-config.json'), 'utf8'));
    if (process.argv.includes('--probe')) {
      const executable = path.join(fs.realpathSync(config.asepriteDirectory), 'aseprite');
      const version = execFileSync(executable, ['--version'], { encoding: 'utf8', timeout: 10000,
        env: { HOME: os.tmpdir(), PATH: '/usr/bin:/bin' }, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
      fs.accessSync(config.mcpExecutable, fs.constants.X_OK);
      fs.accessSync('/usr/bin/bwrap', fs.constants.X_OK);
      console.log(version + '; MCP and isolation launcher installed. Run the smoke check before advertising.');
    } else {
      const args = argumentsFor(config, process.cwd());
      const child = spawn('/usr/bin/bwrap', args, { stdio: 'inherit', env: { PATH: '/usr/bin:/bin' } });
      for (const signal of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(signal, () => child.kill(signal));
      child.on('error', () => { console.error('Could not start the isolated Aseprite tool.'); process.exitCode = 1; });
      child.on('exit', (code, signal) => { process.exitCode = code ?? (signal ? 1 : 0); });
    }
  } catch (error) { console.error('Aseprite launcher: ' + error.message); process.exitCode = 1; }
}
