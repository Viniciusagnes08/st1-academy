import {randomUUID,createHash} from 'node:crypto';

export const uploadChunkBytes=1024*1024;
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
export const uploadSchema=`CREATE TABLE IF NOT EXISTS academy_upload(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES user(id),target TEXT NOT NULL,headers_json TEXT NOT NULL,total_bytes INTEGER NOT NULL,sha256 TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'open',result_json TEXT,expires_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS academy_upload_part(upload_id TEXT NOT NULL REFERENCES academy_upload(id) ON DELETE CASCADE,part INTEGER NOT NULL,bytes BLOB NOT NULL,sha256 TEXT NOT NULL,PRIMARY KEY(upload_id,part));
    CREATE INDEX IF NOT EXISTS academy_upload_expiry_idx ON academy_upload(expires_at);`;
export function createUploadService(db,{authorize,prepare,clock=Date.now}){
  const transaction=work=>{db.exec('BEGIN IMMEDIATE');try{const result=work();db.exec('COMMIT');return result;}catch(error){db.exec('ROLLBACK');throw error;}};
  const atomic=work=>{
    if(db.engine==='postgres')return transaction(work);
    // SQLite's nested transactions use savepoints. Scope this compatibility
    // wrapper to the synchronous final commit and restore the original method.
    const original=db.exec,stack=[];
    db.exec=function(sql){
      if(/^BEGIN(?: IMMEDIATE)?$/i.test(sql)){const name='upload_'+randomUUID().replaceAll('-','');const value=original.call(this,'SAVEPOINT '+name);stack.push(name);return value;}
      if(/^(COMMIT|ROLLBACK)$/i.test(sql)&&stack.length){const name=stack.pop();return original.call(this,sql==='ROLLBACK'?'ROLLBACK TO SAVEPOINT '+name+'; RELEASE SAVEPOINT '+name:'RELEASE SAVEPOINT '+name);}
      return original.call(this,sql);
    };
    try{return transaction(work);}finally{db.exec=original;}
  };
  const row=(viewer,id)=>{
    const record=db.prepare('SELECT * FROM academy_upload WHERE id=? AND user_id=?').get(id,viewer.user_id);
    if(!record||record.expires_at<=new Date(clock()).toISOString())throw fail('Envio não encontrado ou expirado. Selecione o arquivo novamente.',404);
    authorize(viewer,record.target);return record;
  };
  const create=(viewer,input)=>{
    if(typeof input?.target!=='string'||input.target.length>180)throw fail('Destino de arquivo inválido.');
    authorize(viewer,input.target);
    if(!Number.isInteger(input.size)||input.size<1||input.size>26*1024*1024||!/^[a-f0-9]{64}$/.test(input.sha256||''))throw fail('Arquivo inválido ou maior que o limite permitido.');
    const allowed=['content-type','x-file-name','x-content-revision','x-profile-revision'];
    if(!input.headers||Array.isArray(input.headers)||Object.entries(input.headers).some(([key,value])=>!allowed.includes(key)||typeof value!=='string'||value.length>800||/[\r\n]/.test(value)))throw fail('Dados do arquivo inválidos.');
    return transaction(()=>{
      if(db.engine==='postgres')db.prepare("SELECT pg_advisory_xact_lock(hashtext('academy_upload_budget'))").get();
      db.prepare('DELETE FROM academy_upload WHERE expires_at<=?').run(new Date(clock()).toISOString());
      const active=db.prepare("SELECT count(*) AS n,coalesce(sum(total_bytes),0) AS bytes FROM academy_upload WHERE status='open'").get();
      if(active.bytes+input.size>100*1024*1024||db.prepare("SELECT count(*) AS n FROM academy_upload WHERE user_id=? AND status='open'").get(viewer.user_id).n>=2)throw fail('Há outros arquivos em envio. Aguarde a conclusão e tente novamente.',429);
      const id=randomUUID(),expiresAt=new Date(clock()+30*60*1000).toISOString();
      db.prepare('INSERT INTO academy_upload(id,user_id,target,headers_json,total_bytes,sha256,expires_at) VALUES(?,?,?,?,?,?,?)').run(id,viewer.user_id,input.target,JSON.stringify(input.headers),input.size,input.sha256,expiresAt);
      return {id,chunkBytes:uploadChunkBytes,chunks:Math.ceil(input.size/uploadChunkBytes),expiresAt};
    });
  };
  const part=(viewer,id,index,bytes)=>transaction(()=>{
    const record=row(viewer,id),count=Math.ceil(record.total_bytes/uploadChunkBytes);
    if(record.status!=='open')throw fail('Este envio já foi concluído.',409);
    if(!Number.isInteger(index)||index<0||index>=count||!Buffer.isBuffer(bytes)||bytes.length!==Math.min(uploadChunkBytes,record.total_bytes-index*uploadChunkBytes))throw fail('Parte de arquivo inválida.');
    const hash=digest(bytes),existing=db.prepare('SELECT sha256 FROM academy_upload_part WHERE upload_id=? AND part=?').get(id,index);
    if(existing){if(existing.sha256!==hash)throw fail('Uma parte diferente já foi recebida. Selecione o arquivo novamente.',409);return {received:index};}
    db.prepare('INSERT INTO academy_upload_part(upload_id,part,bytes,sha256) VALUES(?,?,?,?)').run(id,index,bytes,hash);return {received:index};
  });
  const complete=async(viewer,id)=>{
    const record=row(viewer,id);if(record.status==='complete')return JSON.parse(record.result_json);
    const parts=db.prepare('SELECT part,bytes FROM academy_upload_part WHERE upload_id=? ORDER BY part').all(id);
    if(parts.length!==Math.ceil(record.total_bytes/uploadChunkBytes)||parts.some((part,index)=>part.part!==index))throw fail('O arquivo ainda não foi recebido por completo.',409);
    const bytes=Buffer.concat(parts.map(part=>Buffer.from(part.bytes)));
    if(bytes.length!==record.total_bytes||digest(bytes)!==record.sha256)throw fail('O arquivo recebido não passou pela verificação. Selecione-o novamente.',409);
    const commit=await prepare(viewer,record.target,JSON.parse(record.headers_json),bytes);
    return atomic(()=>{
      const current=db.prepare('SELECT * FROM academy_upload WHERE id=? AND user_id=?'+(db.engine==='postgres'?' FOR UPDATE':'')).get(id,viewer.user_id);
      if(!current)throw fail('Envio não encontrado ou expirado.',404);
      if(current.status==='complete')return JSON.parse(current.result_json);
      row(viewer,id);const result=commit();
      if(result?.then)throw new Error('A gravação final do arquivo precisa ser atômica.');
      db.prepare("UPDATE academy_upload SET status='complete',result_json=? WHERE id=?").run(JSON.stringify(result),id);
      db.prepare('DELETE FROM academy_upload_part WHERE upload_id=?').run(id);return result;
    });
  };
  return {create,part,complete};
}

// Explicit writes keep large private responses streamed. Never put these
// files in a public CDN cache or expose an unauthenticated asset URL.
export function sendBinary(res,source){
  const bytes=Buffer.from(source);
  if(bytes.length<=3*1024*1024)return res.send(bytes);
  for(let start=0;start<bytes.length;start+=256*1024)res.write(bytes.subarray(start,start+256*1024));
  return res.end();
}
