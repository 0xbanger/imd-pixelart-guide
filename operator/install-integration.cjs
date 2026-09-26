'use strict';
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
if(process.platform!=='linux'||process.getuid()===0)throw Error('Run as the ordinary Linux worker user.');
process.umask(0o077);
const base=path.join(os.homedir(),'imd-tools/aseprite-1.3.18.6');
const packageRoot=path.resolve(__dirname,'..');
const configFile=path.join(base,'operator-config.json');
fs.mkdirSync(base,{recursive:true});
const integration=path.join(base,'integration');
if(path.resolve(packageRoot)!==path.resolve(integration)) {
  for(const name of ['operator','lib'])fs.cpSync(path.join(packageRoot,name),path.join(integration,name),{recursive:true});
}
for(const name of ['LICENSE','NOTICE'])fs.copyFileSync(path.join(packageRoot,name),path.join(integration,name));
const launcher=path.join(base,'aseprite-server.cjs');
if(fs.existsSync(launcher))fs.copyFileSync(launcher,launcher+'.before-'+Date.now());
fs.copyFileSync(path.join(packageRoot,'operator/aseprite-server.cjs'),launcher);
if(!fs.existsSync(configFile))fs.writeFileSync(configFile,JSON.stringify({
  asepriteDirectory:path.join(base,'build/bin'),mcpExecutable:path.join(base,'aseprite-mcp'),
  workspaceRoots:[path.join(os.homedir(),'.identitymd/work'),path.join(os.homedir(),'imd-smoke-test')]
},null,2)+'\n',{mode:0o600,flag:'wx'});
for(const folder of ['.identitymd/work','imd-smoke-test'])fs.mkdirSync(path.join(os.homedir(),folder),{recursive:true});
console.log('Integration files installed: '+base);
console.log('Existing operator configuration preserved. Run the live MCP check before registration.');
console.log('IMD tools and service were not changed.');
