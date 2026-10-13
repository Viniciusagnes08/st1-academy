import {parentPort,workerData} from 'node:worker_threads';
import pg from 'pg';
import {encodeValue,decodeValue} from './postgres-codec.mjs';
const control=new Int32Array(workerData.shared,0,4),bytes=new Uint8Array(workerData.shared,16);
pg.types.setTypeParser(20,value=>{const parsed=Number(value);if(!Number.isSafeInteger(parsed))throw new Error('O banco retornou um inteiro fora do intervalo seguro.');return parsed;});
let client=null,inTransaction=false,transactionLost=false;
async function connect(){
  if(client)return client;
  const connection=new pg.Client({...workerData.connection,connectionTimeoutMillis:10000,application_name:'ST1 Academy'});
  connection.on('error',()=>{if(client===connection){client=null;transactionLost=inTransaction;inTransaction=false;}void connection.end().catch(()=>{});});
  try{
    await connection.connect();
    await connection.query('SET search_path TO "'+workerData.schema+'",pg_catalog; SET statement_timeout=15000;');
    client=connection;return connection;
  }catch(error){void connection.end().catch(()=>{});throw error;}
}
const complete=(value,error=false)=>{
  let encoded=Buffer.from(JSON.stringify(encodeValue(value)));
  if(encoded.length>bytes.length){error=true;encoded=Buffer.from(JSON.stringify({message:'A consulta ultrapassou o limite de transferência da Academy.',code:'ACADEMY_RESULT_LIMIT'}));}
  bytes.set(encoded);Atomics.store(control,1,encoded.length);Atomics.store(control,2,error?1:0);Atomics.store(control,0,2);Atomics.notify(control,0);
};
parentPort.on('message',async()=>{
  try{
    const request=decodeValue(JSON.parse(Buffer.from(bytes.subarray(0,Atomics.load(control,1))).toString()));
    if(request.op==='close'){if(client)await client.end();client=null;complete({closed:true});return;}
    if(transactionLost){transactionLost=false;throw Object.assign(new Error('A transação foi interrompida.'),{code:'ACADEMY_CONNECTION_LOST'});}
    const connection=await connect();
    const raw=await connection.query(request.sql,request.params||[]),result=Array.isArray(raw)?raw.at(-1):raw;
    if(/^\s*BEGIN\b/i.test(request.sql))inTransaction=true;
    if(/^\s*(?:COMMIT\b|ROLLBACK(?!\s+TO)\b)/i.test(request.sql))inTransaction=false;
    complete({rows:result.rows||[],changes:result.rowCount||0,columns:result.fields?.map(field=>({name:field.name}))||[]});
  }catch(error){
    const lost=error.code==='ACADEMY_CONNECTION_LOST'||/^08|^ECONN|^EPIPE|^57P0/.test(error.code||'')||/connection.*(?:terminated|closed)|client.*(?:closed|not queryable)/i.test(error.message);
    if(lost&&client){const connection=client;client=null;void connection.end().catch(()=>{});}
    if(lost){inTransaction=false;transactionLost=false;}
    complete({message:lost?'A conexão com o banco foi interrompida. Tente novamente.':error.message,code:lost?'ACADEMY_CONNECTION_LOST':error.code||'ACADEMY_POSTGRES',detail:lost?null:error.detail||null},true);
  }
});
