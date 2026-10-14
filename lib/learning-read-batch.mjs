// Lazy, synchronous projections for one read operation. They are never shared
// between requests; write handlers use the uncached services. Authorisation
// stays in each service, including role, version and prerequisite checks.
export function createReadBatch(){
  let current=null;
  const run=work=>{
    if(current)return work();
    current=new Map();
    try{const result=work();if(result?.then)throw new Error('O lote de leitura precisa ser síncrono.');return result;}
    finally{current=null;}
  };
  const get=(key,load)=>{if(!current)return load();if(!current.has(key))current.set(key,load());return current.get(key);};
  return {run,get,active:()=>current!==null};
}

export function withLearningReadBatch(ctx,work){
  const projection=()=>ctx.contents.withReadBatch(()=>ctx.readings.withReadBatch(()=>ctx.game.withReadBatch(work)));
  return ctx.db.withReadScope?ctx.db.withReadScope(projection):projection();
}
