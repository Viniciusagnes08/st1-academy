// The current repository uses one synchronous PostgreSQL connection and
// synchronous transaction scopes. Serialising handlers within one process
// prevents another invocation joining an authentication transaction while an
// async auth hook or PDF is running. Vercel may scale independent instances.
export function createServerlessHandler({createApp,options={}}){
  let application=null,queue=Promise.resolve();
  const load=()=>{
    if(!application)application=Promise.resolve().then(()=>createApp(options)).catch(error=>{application=null;throw error;});
    return application;
  };
  return async(req,res)=>{
    let release;
    const previous=queue;
    queue=new Promise(done=>{release=done;});
    await previous;
    try{
      if(res.destroyed)return;
      const {app}=await load();
      await new Promise((done,reject)=>{
        const originalEnd=res.end;
        let ended=false;
        res.end=function(...args){
          try{return originalEnd.apply(this,args);}
          finally{if(!ended){ended=true;res.end=originalEnd;done();}}
        };
        // Keep ownership until the application itself ends its response. A
        // disconnected browser must not release an in-flight PDF/auth hook.
        try{app(req,res,error=>error?reject(error):res.status(404).end());}
        catch(error){reject(error);}
      });
    }catch(error){
      console.error('Falha na inicialização da Academy:',error.message);
      if(!res.headersSent&&!res.destroyed){res.statusCode=503;res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store');res.setHeader('Retry-After','10');res.end(JSON.stringify({message:'Não foi possível iniciar a Academy. Tente novamente em instantes.'}));}
    }finally{release();}
  };
}
