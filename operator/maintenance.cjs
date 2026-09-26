'use strict';
const fs=require('node:fs'),path=require('node:path');
const BUILD_FOLDERS=['source','build','build-runtime','downloads','mcp-source','build-cache','build-gopath','test-runtime'];
function inside(root,child){const r=path.relative(root,child);return r&&r!=='..'&&!r.startsWith('..'+path.sep)&&!path.isAbsolute(r);}
function checkedChild(root,target){
  const parent=fs.realpathSync(root),absolute=path.resolve(target);
  if(!inside(parent,absolute))throw Error('Cleanup target is outside its expected parent: '+absolute);
  if(fs.lstatSync(absolute).isSymbolicLink())throw Error('Cleanup root cannot be a symlink: '+absolute);
  const real=fs.realpathSync(absolute);
  if(real!==absolute||!inside(parent,real))throw Error('Cleanup target resolves elsewhere: '+absolute);
  return real;
}
function removeOwnedTree(root,target){
  const checked=checkedChild(root,target);
  // Go module cache directories are deliberately read-only. Change only owned
  // directories under this already-verified target; never follow child symlinks.
  function writable(folder){
    const s=fs.lstatSync(folder);if(s.isSymbolicLink()||!s.isDirectory())return;
    if(typeof process.getuid==='function'&&s.uid!==process.getuid())throw Error('Cleanup encountered another owner: '+folder);
    fs.chmodSync(folder,s.mode|0o700);
    for(const entry of fs.readdirSync(folder))writable(path.join(folder,entry));
  }
  writable(checked);fs.rmSync(checked,{recursive:true,force:false});
}
function stageBuildFolders(base){
  const root=fs.realpathSync(base),q=fs.mkdtempSync(path.join(root,'.cleanup-'));
  const moved=[];
  try {
    for(const name of BUILD_FOLDERS){const source=path.join(root,name);if(!fs.existsSync(source))continue;
      checkedChild(root,source);const destination=path.join(q,name);fs.renameSync(source,destination);moved.push({name,source,destination});
    }
  }catch(e){for(const item of moved.reverse())fs.renameSync(item.destination,item.source);fs.rmdirSync(q);throw e;}
  return {root,q,moved};
}
function restoreStaged(stage){
  checkedChild(stage.root,stage.q);
  for(const item of stage.moved){if(fs.existsSync(item.source))throw Error('Cannot restore over a new file: '+item.source);fs.renameSync(item.destination,item.source);}
  fs.rmdirSync(stage.q);
}
module.exports={BUILD_FOLDERS,checkedChild,removeOwnedTree,stageBuildFolders,restoreStaged};
