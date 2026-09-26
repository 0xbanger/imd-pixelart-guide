'use strict';
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const {pathToFileURL} = require('node:url');
const {createRequire} = require('node:module');
const base = process.env.ASEPRITE_OPERATOR_DIR || path.join(os.homedir(), 'imd-tools/aseprite-1.3.18.6');
const req = createRequire(path.join(process.env.PIXELART_VERIFY_CLIENT || path.join(base, 'test-runtime'), 'package.json'));
const {Client} = req('@modelcontextprotocol/sdk/client/index.js');
const {StdioClientTransport} = req('@modelcontextprotocol/sdk/client/stdio.js');
const client = new Client({name:'imd-aseprite-live-check',version:'1.0.0'});
const text = result => result.content.filter(x=>x.type==='text').map(x=>x.text).join('\n');
async function call(name,args) {
  const result = await client.callTool({name,arguments:args},undefined,{timeout:110000});
  if(result.isError) throw Error(name+': '+text(result));
  return result;
}
(async()=>{
  const parent=path.join(os.homedir(),'imd-smoke-test'); fs.mkdirSync(parent,{recursive:true});
  const work=fs.mkdtempSync(path.join(parent,'pixel-art-smoke-'));
  const canary=path.join(base,'smoke-canary.txt'); fs.writeFileSync(canary,'harmless isolation test\n',{mode:0o600});
  fs.mkdirSync(path.join(work,'.imd')); fs.writeFileSync(path.join(work,'.imd/guard.txt'),'pinned fixture\n');
  fs.symlinkSync(canary,path.join(work,'outside-link'));
  await client.connect(new StdioClientTransport({command:'/usr/bin/node',args:[path.join(base,'aseprite-server.cjs')],cwd:work,
    env:{HOME:os.homedir(),PATH:'/usr/bin:/bin'},stderr:'inherit'}),{timeout:30000});
  const names=(await client.listTools()).tools.map(t=>t.name).sort();
  assert.deepEqual(names,['execute_lua','inspect_export']);
  const security=await call('execute_lua',{script:`
local root=assert(app.params.aseprite_mcp_workspace)
assert(io.open(${JSON.stringify(canary)},'r')==nil,'Outside file readable')
assert(io.open(root..'/outside-link','r')==nil,'Symlink escaped workspace')
assert(io.open(root..'/.imd/guard.txt','w')==nil,'Pinned input writable')
local f=assert(io.open(root..'/ordinary.txt','w'));f:write('allowed');f:close()
local r=assert(io.open('/proc/net/route','r'));local routes=r:read('*a');r:close()
assert(not routes:find('eth') and not routes:find('veth'),'Network interface exposed')
print('Outside file and symlink denied; pinned input read-only; workspace writable; private network namespace.')
`});
  const created=await call('execute_lua',{script:`
local root=assert(app.params.aseprite_mcp_workspace)
local out=root..'/artifacts/pixel-art'
for _,d in ipairs({'sources','exports','previews'}) do app.fs.makeAllDirectories(out..'/'..d) end
local s=Sprite(32,32,ColorMode.RGB);s.layers[1].name='body'
local detail=s:newLayer();detail.name='light'
for i=2,4 do s:newEmptyFrame() end
for i=1,4 do
  s.frames[i].duration=0.1+i*0.02
  local body=Image(32,32,ColorMode.RGB);body:clear()
  for y=8,23 do for x=8,23 do body:drawPixel(x,y,app.pixelColor.rgba(40,130,115,255)) end end
  s:newCel(s.layers[1],i,body,Point(0,0))
  local glow=Image(32,32,ColorMode.RGB);glow:clear()
  glow:drawPixel(10+i,10,app.pixelColor.rgba(230,210,120,255))
  s:newCel(detail,i,glow,Point(0,0))
end
local tag=s:newTag(1,4);tag.name='idle';tag.aniDir=AniDir.FORWARD
s:saveAs(out..'/sources/check.aseprite');s:close()
s=assert(app.open(out..'/sources/check.aseprite'))
assert(s.width==32 and #s.frames==4 and #s.layers==2 and #s.tags==1)
app.activeSprite=s
app.command.ExportSpriteSheet{ui=false,type=SpriteSheetType.HORIZONTAL,
 textureFilename=out..'/exports/check.png',dataFilename=out..'/exports/check.json',
 dataFormat=SpriteSheetDataFormat.JSON_ARRAY,listTags=true,listLayers=true,listSlices=true,
 trimSprite=false,trim=false,mergeDuplicates=false}
local preview=Image(32*4*4,32*4,ColorMode.RGB);preview:clear()
for frame=1,4 do
 local im=Image(32,32,ColorMode.RGB);im:clear();im:drawSprite(s,frame)
 for y=0,31 do for x=0,31 do local c=im:getPixel(x,y)
  for dy=0,3 do for dx=0,3 do preview:drawPixel((frame-1)*128+x*4+dx,y*4+dy,c) end end
 end end
end
preview:saveAs(out..'/preview.png');preview:saveAs(out..'/previews/check-4x.png')
print('Saved and reopened source; exported sheet, metadata and contact sheet.');s:close()
`});
  const manifest={version:1,assets:[{id:'check',width:32,height:32,frames:4,paletteLimit:2,
    source:'sources/check.aseprite',sheet:'exports/check.png',metadata:'exports/check.json',preview:'previews/check-4x.png'}]};
  const out=path.join(work,'artifacts/pixel-art');
  fs.writeFileSync(path.join(out,'manifest.json'),JSON.stringify(manifest,null,2));
  fs.writeFileSync(path.join(out,'STYLE.md'),'Technical fixture: two layers, two visible colors, four timed frames. Not an artistic evaluation.\n');
  const image=await call('inspect_export',{path:'artifacts/pixel-art/preview.png'});
  assert(image.content.some(c=>c.type==='image'&&c.mimeType==='image/png'));
  const rejected=await client.callTool({name:'inspect_export',arguments:{path:'outside-link'}});
  assert(rejected.isError,'Out-of-workspace inspection should be refused');
  const {validateAssets}=await import(pathToFileURL(path.join(base,'integration/lib/validate-assets.mjs')));
  const validated=validateAssets(out);assert(validated.passed,JSON.stringify(validated));
  assert.equal(fs.readFileSync(path.join(work,'.imd/guard.txt'),'utf8'),'pinned fixture\n');
  assert.equal(fs.readFileSync(canary,'utf8'),'harmless isolation test\n');
  const fingerprint={};
  const installed=JSON.parse(fs.readFileSync(path.join(base,'operator-config.json'),'utf8'));
  const files={launcher:path.join(base,'aseprite-server.cjs'),config:path.join(base,'operator-config.json'),mcp:installed.mcpExecutable,engine:path.join(installed.asepriteDirectory,'aseprite')};
  for(const [name,file] of Object.entries(files))fingerprint[name]=crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  const report={ok:true,work,tools:names,fingerprint,isolation:text(security),exports:text(created),imageBlocks:image.content.filter(c=>c.type==='image').length,validation:validated};
  fs.writeFileSync(path.join(base,'live-mcp-report.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify(report,null,2));
})().catch(e=>{console.error('LIVE MCP CHECK FAILED: '+e.message);process.exitCode=1;}).finally(()=>client.close().catch(()=>{}));
