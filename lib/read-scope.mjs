import {serialize,deserialize} from 'node:v8';
import {encodeValue} from './postgres-codec.mjs';

// Reuse deterministic reads only inside one synchronous response. Nothing is
// retained between requests, and every write invalidates the current scope.
export function createReadScope({maxBytes=8*1024*1024,maxEntryBytes=1024*1024,maxEntries=512}={}){
  let scope=null;
  const run=work=>{
    if(scope)return work();
    scope={entries:new Map(),bytes:0};
    try{return work();}finally{scope=null;}
  };
  const execute=(request,perform)=>{
    if(!scope)return perform();
    const sql=String(request.sql||'');
    const deterministic=/^\s*SELECT\b/i.test(sql)&&!(/;|\b(?:random|nextval|setval|set_config|gen_random_uuid|gen_random_bytes|now|clock_timestamp|statement_timestamp|transaction_timestamp|current_timestamp|current_date|current_time|pg_\w+)\b|\bFOR\s+(?:UPDATE|SHARE)\b/i.test(sql));
    if(!deterministic){scope.entries.clear();scope.bytes=0;return perform();}
    const key=JSON.stringify(encodeValue([sql,request.params||[]]));
    const cached=scope.entries.get(key);
    if(cached)return deserialize(cached);
    const result=perform();
    // File responses can be large. Their bytes have no repeated projection work.
    const binary=(result.rows||[]).some(row=>Object.values(row).some(value=>Buffer.isBuffer(value)||ArrayBuffer.isView(value)));
    if(!binary&&scope.entries.size<maxEntries){
      const stored=serialize(result);
      if(stored.length<=maxEntryBytes&&scope.bytes+stored.length<=maxBytes){scope.entries.set(key,stored);scope.bytes+=stored.length;}
    }
    return result;
  };
  return {run,execute};
}
