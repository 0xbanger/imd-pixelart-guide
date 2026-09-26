'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {execFileSync}=require('node:child_process');
const crypto=require('node:crypto');
if(process.platform!=='linux'||process.getuid()===0)throw Error('Run as the ordinary Linux worker user.');
process.umask(0o077);
const home=os.homedir(),base=path.join(home,'imd-tools/aseprite-1.3.18.6');
const checked=JSON.parse(fs.readFileSync(path.join(base,'live-mcp-report.json'),'utf8'));
if(!checked.ok)throw Error('A successful live MCP smoke check is required.');
const installed=JSON.parse(fs.readFileSync(path.join(base,'operator-config.json'),'utf8'));
const files={launcher:path.join(base,'aseprite-server.cjs'),config:path.join(base,'operator-config.json'),mcp:installed.mcpExecutable,engine:path.join(installed.asepriteDirectory,'aseprite')};
for(const [name,file] of Object.entries(files)) {
  const current=crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  if(checked.fingerprint?.[name]!==current)throw Error('Tool/configuration changed since the smoke check: '+name+'. Rerun it before registration.');
}
const launcher=path.join(base,'aseprite-server.cjs');
execFileSync(process.execPath,[launcher,'--probe'],{stdio:'inherit',timeout:15000});
const file=path.join(home,'.identitymd/tools.json');
const original=fs.existsSync(file)?fs.readFileSync(file):Buffer.from('[]\n');
const before=JSON.parse(original);
if(before.some(t=>t.id==='pixelart'))throw Error('pixelart is already configured. Inspect it before replacing anything.');
const legacy=before.find(t=>t.id==='aseprite');
if(legacy&&(!legacy.args?.includes(launcher)||legacy.command!==process.execPath))throw Error('An unrelated aseprite tool exists; do not replace it automatically.');
const backup=file+'.before-pixelart-'+Date.now();fs.writeFileSync(backup,original,{mode:0o600,flag:'wx'});
const args=['tools','add','pixelart','--command',process.execPath,'--arg',launcher,
  '--env','HOME','--env','PATH','--probe',launcher,'--probe=--probe',
  '--enable','execute_lua','--enable','inspect_export'];
try {
  execFileSync(path.join(home,'.npm-global/bin/imd'),args,{stdio:'inherit',timeout:30000});
  if(legacy)execFileSync(path.join(home,'.npm-global/bin/imd'),['tools','remove','aseprite'],{stdio:'inherit',timeout:30000});
  const after=JSON.parse(fs.readFileSync(file,'utf8'));
  for(const previous of before.filter(t=>t!==legacy))if(JSON.stringify(previous)!==JSON.stringify(after.find(t=>t.id===previous.id)))throw Error('Unrelated tool changed: '+previous.id);
  const tool=after.find(t=>t.id==='pixelart');
  if(tool?.command!==process.execPath||!tool.args?.includes(launcher)||tool.enabledTools?.length!==2||after.some(t=>t.id==='aseprite'))throw Error('Unexpected pixelart registration.');
  console.log('PIXELART REGISTERED. Existing tools preserved. Backup: '+backup);
  console.log('Restart IMD when idle to advertise the tool. Catalog/request integration is separate.');
} catch(e) {fs.writeFileSync(file,original,{mode:0o600});throw Error('Registration failed; prior tools restored. '+e.message);}
