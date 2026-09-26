'use strict';
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {execFileSync}=require('node:child_process');
if(process.platform!=='linux'||process.getuid()===0)throw Error('Run as the ordinary Linux worker user.');
const uid=process.getuid(),env={...process.env,XDG_RUNTIME_DIR:'/run/user/'+uid,DBUS_SESSION_BUS_ADDRESS:'unix:path=/run/user/'+uid+'/bus'};
const service='identitymd-worker.service';
const logs=execFileSync('journalctl',['--user','-u',service,'-n','12','--no-pager','-o','cat'],{encoding:'utf8',env}).trim().split('\n');
const last=logs.at(-1)||'';
const at=Date.parse(last.slice(0,24));
if(!/alive .* · idle · /.test(last)||!Number.isFinite(at)||Date.now()-at>35000) {
  console.log('NOT RESTARTED: the latest service line is not a fresh idle heartbeat. Retry after the worker is idle.');
  console.log(last);process.exitCode=2;
} else {
  const tool=JSON.parse(fs.readFileSync(path.join(os.homedir(),'.identitymd/tools.json'))).find(t=>t.id==='pixelart');
  if(!tool)throw Error('Register the Aseprite tool first.');
  execFileSync(path.join(os.homedir(),'.npm-global/bin/imd'),['service','restart'],{stdio:'inherit',env,timeout:20000});
  setTimeout(()=>{
    try {
      console.log(execFileSync('systemctl',['--user','show',service,'--property=ActiveState,SubState,MainPID,UnitFileState'],{encoding:'utf8',env}));
      console.log(execFileSync('journalctl',['--user','-u',service,'-n','12','--no-pager','-o','cat'],{encoding:'utf8',env}));
    }catch(e){console.error(e.message);process.exitCode=1;}
  },3500);
}
