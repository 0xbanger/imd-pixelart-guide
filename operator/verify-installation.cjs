'use strict';
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),cp=require('node:child_process');
const {removeOwnedTree}=require('./maintenance.cjs');
const base=process.env.ASEPRITE_OPERATOR_DIR||path.join(os.homedir(),'imd-tools/aseprite-1.3.18.6');
function verify(){
  if(process.platform!=='linux'||process.getuid()===0)throw Error('Verify as the ordinary Linux worker user.');
  const client=fs.mkdtempSync(path.join(fs.realpathSync(base),'.verify-client-'));
  try {
    console.log('Installing a temporary verification client; it will be removed after the check.');
    cp.execFileSync('npm',['install','--prefix',client,'--save-exact','--ignore-scripts','--no-audit','--no-fund','@modelcontextprotocol/sdk@1.30.1'],
      {encoding:'utf8',timeout:180000,env:{...process.env,npm_config_cache:path.join(client,'npm-cache'),npm_config_update_notifier:'false'}});
    const result=cp.execFileSync(process.execPath,[path.join(base,'integration/operator/check-runtime.cjs')],
      {encoding:'utf8',timeout:180000,env:{...process.env,PIXELART_VERIFY_CLIENT:client}});
    const report=JSON.parse(fs.readFileSync(path.join(base,'live-mcp-report.json'),'utf8'));
    if(!report.ok)throw Error('Live MCP verification failed.');
    console.log('PASS: saved/reopened animation, PNG/metadata exports, image response and workspace isolation.');
    return report;
  }finally{removeOwnedTree(base,client);}
}
module.exports={verify};
if(require.main===module){try{verify();}catch(e){console.error(e.message);process.exitCode=1;}}
