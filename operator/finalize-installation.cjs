'use strict';
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),cp=require('node:child_process');
const {checkedChild,removeOwnedTree,stageBuildFolders,restoreStaged}=require('./maintenance.cjs');
const {verify}=require('./verify-installation.cjs');
function finalize(){
  if(process.platform!=='linux'||process.getuid()===0)throw Error('Finalize as the ordinary Linux worker user.');
  const home=fs.realpathSync(os.homedir()),parent=fs.realpathSync(path.join(home,'imd-tools'));
  const base=checkedChild(parent,path.join(parent,'aseprite-1.3.18.6'));
  const processes=cp.execFileSync('ps',['-u',String(process.getuid()),'-o','comm='],{encoding:'utf8'}).trim().split('\n');
  if(processes.some(n=>/^(aseprite|aseprite-mcp|go|compile|link|cc1plus|ninja|cmake)$/.test(n.trim())))throw Error('An Aseprite or build process is active. Finish it before cleanup.');
  const file=path.join(base,'operator-config.json'),original=fs.readFileSync(file);
  const config=JSON.parse(original),oldBin=path.join(base,'build/bin'),runtime=path.join(base,'runtime/aseprite');
  let relocated=false;
  if(fs.realpathSync(config.asepriteDirectory)===oldBin){
    checkedChild(base,oldBin);
    if(fs.existsSync(runtime))throw Error('Runtime destination already exists; inspect it rather than overwrite it.');
    fs.mkdirSync(path.dirname(runtime),{recursive:true});checkedChild(base,path.dirname(runtime));
    fs.cpSync(oldBin,runtime,{recursive:true,dereference:false});
    for(const name of ['EULA.txt','LICENSE.txt'])if(fs.existsSync(path.join(base,'source',name)))fs.copyFileSync(path.join(base,'source',name),path.join(runtime,name));
    config.asepriteDirectory=runtime;
    fs.writeFileSync(file+'.before-runtime-'+Date.now(),original,{mode:0o600,flag:'wx'});
    fs.writeFileSync(file+'.tmp',JSON.stringify(config,null,2)+'\n',{mode:0o600});fs.renameSync(file+'.tmp',file);relocated=true;
  }else if(fs.realpathSync(config.asepriteDirectory)!==runtime)throw Error('Custom installation: automatic cleanup supports only this installer\'s own runtime paths.');
  checkedChild(base,runtime);
  try{verify();}catch(e){if(relocated)fs.writeFileSync(file,original,{mode:0o600});throw e;}
  console.log('Runtime works at its permanent location. Staging build folders out of their original paths.');
  const stage=stageBuildFolders(base);
  try{verify();}catch(e){restoreStaged(stage);if(relocated)fs.writeFileSync(file,original,{mode:0o600});throw Error('Build folders restored; nothing deleted. '+e.message);}
  const bytes=Number(cp.execFileSync('du',['-s','--block-size=1',stage.q],{encoding:'utf8'}).split(/\s/)[0]);
  removeOwnedTree(base,stage.q);
  const report={ok:true,finishedAt:new Date().toISOString(),runtime,removedBuildFolders:stage.moved.map(x=>x.name),reclaimedAllocatedBytes:bytes,
    retained:'Application and data, MCP binary, launcher/configuration, installation checks and reports. Shared system libraries and unrelated user caches were not removed.'};
  fs.writeFileSync(path.join(base,'cleanup-report.json'),JSON.stringify(report,null,2)+'\n',{mode:0o600});
  console.log(JSON.stringify(report,null,2));return report;
}
module.exports={finalize};
if(require.main===module){try{finalize();}catch(e){console.error('FINALIZE STOPPED: '+e.message);process.exitCode=1;}}
