import {backup,DatabaseSync} from 'node:sqlite';
import {mkdir,readdir,stat,unlink,chmod} from 'node:fs/promises';
import {resolve} from 'node:path';
import {randomUUID} from 'node:crypto';

export function createBackupService(ctx,{retention=7,intervalMs=86400000}={}){
  const directory=resolve(ctx.dataDir,'backups');let timer=null,running=null;
  const create=()=>{
    if(running)return running;
    running=(async()=>{
      await mkdir(directory,{recursive:true,mode:0o700});
      const filename='academy-'+new Date().toISOString().replace(/[^0-9T]/g,'')+'-'+randomUUID()+'.sqlite';
      const target=resolve(directory,filename);
      await backup(ctx.db,target);await chmod(target,0o600);
      const snapshot=new DatabaseSync(target,{readOnly:true});
      try{if(snapshot.prepare('PRAGMA quick_check').get().quick_check!=='ok')throw new Error('O backup do banco não passou na verificação.');}finally{snapshot.close();}
      const names=(await readdir(directory)).filter(name=>/^academy-[0-9T]+-[a-f0-9-]+\.sqlite$/.test(name)).sort().reverse();
      for(const name of names.slice(retention))await unlink(resolve(directory,name));
      return {filename,bytes:(await stat(target)).size};
    })();
    running.finally(()=>{running=null;}).catch(()=>{});return running;
  };
  const tick=async()=>{
    await mkdir(directory,{recursive:true,mode:0o700});
    const names=(await readdir(directory)).filter(name=>/^academy-[0-9T]+-[a-f0-9-]+\.sqlite$/.test(name)).sort().reverse();
    if(names.length&&Date.now()-(await stat(resolve(directory,names[0]))).mtimeMs<intervalMs)return;
    return create();
  };
  const start=()=>{if(timer)return;timer=setInterval(()=>void tick().catch(()=>console.error('Não foi possível concluir o backup diário da Academy.')),3600000);timer.unref();void tick().catch(()=>console.error('Não foi possível concluir o backup diário da Academy.'));};
  const stop=()=>{clearInterval(timer);timer=null;};
  return {create,tick,start,stop,drain:()=>running||Promise.resolve()};
}
