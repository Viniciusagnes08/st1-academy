import {Worker} from 'node:worker_threads';
import {randomUUID} from 'node:crypto';
import {encodeValue,decodeValue} from './postgres-codec.mjs';
import {postgresSql,postgresDdl,splitSql} from './postgres-sql.mjs';
import {waitForPostgresResponse} from './postgres-channel.mjs';
import {createReadScope} from './read-scope.mjs';

export class PostgresDatabase{
  #worker;#shared;#control;#bytes;#closed=false;#transactions=[];#reads=createReadScope();
  constructor({url,schema='academy',ssl=true,timeout=20000,runtimeOnly=false}={}){
    if(!/^[a-z][a-z0-9_]{0,62}$/.test(schema))throw new Error('Esquema de banco inválido.');
    const parsed=new URL(url);if(!['postgres:','postgresql:'].includes(parsed.protocol))throw new Error('Use uma conexão PostgreSQL para a Academy.');
    if(!ssl&&!['localhost','127.0.0.1','[::1]'].includes(parsed.hostname))throw new Error('A conexão externa exige TLS com validação do certificado.');
    for(const key of ['ssl','sslmode','sslcert','sslkey','sslrootcert'])parsed.searchParams.delete(key);
    this.schema=schema;this.engine='postgres';this.timeout=timeout;
    this.#shared=new SharedArrayBuffer(64*1024*1024+16);this.#control=new Int32Array(this.#shared,0,4);this.#bytes=new Uint8Array(this.#shared,16);
    this.#worker=new Worker(new URL('./postgres-worker.mjs',import.meta.url),{execArgv:[],workerData:{shared:this.#shared,schema,connection:{connectionString:parsed.href,ssl:ssl?{...(typeof ssl==='object'?ssl:{}),rejectUnauthorized:true}:false}}});this.#worker.on('error',()=>{});this.#worker.unref();
    try{
      if(!this.#call({sql:'SELECT 1 FROM pg_namespace WHERE nspname=$1',params:[schema]}).rows.length){if(runtimeOnly)throw new Error('Prepare o esquema da Academy antes de publicar.');this.#call({sql:'CREATE SCHEMA "'+schema+'"'});}
      if(!runtimeOnly){this.#call({sql:'REVOKE ALL ON SCHEMA "'+schema+'" FROM PUBLIC'});this.#bootstrap();}
    }catch(error){this.#closed=true;void this.#worker.terminate();throw error;}
  }
  #call(request){
    if(this.#closed)throw new Error('A conexão de banco foi encerrada.');
    return this.#reads.execute(request,()=>this.#exchange(request));
  }
  #exchange(request){
    const encoded=Buffer.from(JSON.stringify(encodeValue(request)));
    if(encoded.length>this.#bytes.length)throw new Error('A operação ultrapassou o limite de transferência da Academy.');
    this.#bytes.set(encoded);Atomics.store(this.#control,1,encoded.length);Atomics.store(this.#control,2,0);Atomics.store(this.#control,0,1);this.#worker.postMessage('query');
    try{waitForPostgresResponse(this.#control,this.timeout);}catch(error){this.#closed=true;void this.#worker.terminate();throw error;}
    const value=decodeValue(JSON.parse(Buffer.from(this.#bytes.subarray(0,Atomics.load(this.#control,1))).toString()));
    if(Atomics.load(this.#control,2)){
      if(value.code==='ACADEMY_CONNECTION_LOST')this.#transactions=[];
      throw Object.assign(new Error(value.message),{code:value.code,detail:value.detail});
    }
    return value;
  }
  #bootstrap(){
    this.#call({sql:`CREATE TABLE IF NOT EXISTS _academy_registry(name TEXT PRIMARY KEY,type TEXT NOT NULL,sql TEXT NOT NULL);
      ALTER TABLE _academy_registry ENABLE ROW LEVEL SECURITY;
      CREATE OR REPLACE VIEW _academy_schema AS SELECT name,type,sql FROM _academy_registry;
      CREATE OR REPLACE FUNCTION pragma_table_info(table_name TEXT) RETURNS TABLE(cid INTEGER,name TEXT,type TEXT,"notnull" INTEGER,dflt_value TEXT,pk INTEGER) LANGUAGE SQL STABLE AS $f$
        SELECT c.ordinal_position::INTEGER-1,c.column_name::TEXT,
          CASE c.udt_name WHEN 'int8' THEN 'INTEGER' WHEN 'bytea' THEN 'BLOB' WHEN 'float8' THEN 'REAL' WHEN 'timestamptz' THEN 'DATE' ELSE upper(c.udt_name) END,
          CASE WHEN c.is_nullable='NO' THEN 1 ELSE 0 END,c.column_default::TEXT,
          CASE WHEN EXISTS(SELECT 1 FROM information_schema.table_constraints tc JOIN information_schema.key_column_usage k ON tc.constraint_name=k.constraint_name AND tc.constraint_schema=k.constraint_schema WHERE tc.table_schema=c.table_schema AND tc.table_name=c.table_name AND tc.constraint_type='PRIMARY KEY' AND k.column_name=c.column_name) THEN 1 ELSE 0 END
        FROM information_schema.columns c WHERE c.table_schema=current_schema() AND c.table_name=$1 AND c.column_name<>'_academy_rowid' ORDER BY c.ordinal_position $f$;
      CREATE OR REPLACE FUNCTION json_each(input TEXT) RETURNS TABLE(value TEXT) LANGUAGE SQL IMMUTABLE AS $f$ SELECT jsonb_array_elements_text(input::jsonb) $f$;
      CREATE OR REPLACE FUNCTION json_extract(input TEXT,path TEXT) RETURNS TEXT LANGUAGE SQL IMMUTABLE AS $f$ SELECT input::jsonb #>> string_to_array(substr(path,3),'.') $f$;
      CREATE OR REPLACE FUNCTION min(a BIGINT,b BIGINT) RETURNS BIGINT LANGUAGE SQL IMMUTABLE AS $f$ SELECT least(a,b) $f$;
      CREATE OR REPLACE FUNCTION max(a BIGINT,b BIGINT) RETURNS BIGINT LANGUAGE SQL IMMUTABLE AS $f$ SELECT greatest(a,b) $f$;
      REVOKE ALL ON ALL TABLES IN SCHEMA "${this.schema}" FROM PUBLIC;`});
  }
  #execute(source,args=[]){
    let trimmed=source.trim().replace(/;$/,'');
    if(/^PRAGMA\s+(journal_mode|foreign_keys|busy_timeout)\s*=/i.test(trimmed))return {rows:[],columns:[],changes:0};
    const info=trimmed.match(/^PRAGMA\s+table_info\s*\(\s*["']?([a-zA-Z0-9_]+)["']?\s*\)$/i);
    if(info)return this.#call({sql:'SELECT * FROM pragma_table_info($1)',params:[info[1]]});
    if(/pragma_index_list/i.test(trimmed)&&/pragma_index_info/i.test(trimmed))return this.#call({sql:`SELECT t.relname AS "tableName",i.relname AS "indexName",a.attname AS "columnName",d.indisunique::INTEGER AS "isUnique",(d.indpred IS NOT NULL)::INTEGER AS "isPartial",(k.ordinality-1)::INTEGER AS "columnPosition"
      FROM pg_class t JOIN pg_namespace n ON n.oid=t.relnamespace JOIN pg_index d ON d.indrelid=t.oid JOIN pg_class i ON i.oid=d.indexrelid JOIN LATERAL unnest(d.indkey) WITH ORDINALITY k(number,ordinality) ON TRUE LEFT JOIN pg_attribute a ON a.attrelid=t.oid AND a.attnum=k.number
      WHERE n.nspname=$1 AND t.relkind='r' AND k.ordinality<=d.indnkeyatts`,params:[this.schema]});
    if(/^PRAGMA\s+index_list/i.test(trimmed))return {rows:[],columns:[{name:'origin'}],changes:0};
    const bareInsert=trimmed.match(/^INSERT(?: OR IGNORE)?\s+INTO\s+"?([a-zA-Z0-9_]+)"?\s+VALUES\b/i);
    if(bareInsert){
      const columns=this.#call({sql:'SELECT name FROM pragma_table_info($1)',params:[bareInsert[1]]}).rows.map(column=>'"'+column.name+'"').join(',');
      trimmed=trimmed.replace(/\s+VALUES\b/i,'('+columns+') VALUES');
    }
    if(/^BEGIN(?:\s+(?:IMMEDIATE|DEFERRED|EXCLUSIVE))?$/i.test(trimmed)){
      const savepoint=this.#transactions.length?'academy_'+randomUUID().replaceAll('-',''):null;
      const result=this.#call({sql:savepoint?'SAVEPOINT '+savepoint:'BEGIN'});this.#transactions.push(savepoint);return result;
    }
    if(/^(COMMIT|ROLLBACK)$/i.test(trimmed)&&this.#transactions.length){
      const savepoint=this.#transactions.pop();return this.#call({sql:savepoint?(/ROLLBACK/i.test(trimmed)?'ROLLBACK TO SAVEPOINT '+savepoint+'; RELEASE SAVEPOINT '+savepoint:'RELEASE SAVEPOINT '+savepoint):trimmed});
    }
    const table=trimmed.match(/^CREATE TABLE(?: IF NOT EXISTS)?\s+["']?([a-zA-Z0-9_]+)["']?/i);
    if(table){
      const result=this.#call({sql:postgresDdl(trimmed)});
      this.#call({sql:'INSERT INTO _academy_registry(name,type,sql) VALUES($1,$2,$3) ON CONFLICT(name) DO NOTHING',params:[table[1],'table',trimmed]});
      this.#call({sql:'ALTER TABLE "'+table[1]+'" ENABLE ROW LEVEL SECURITY'});return result;
    }
    const index=trimmed.match(/^CREATE(?: UNIQUE)? INDEX(?: IF NOT EXISTS)?\s+["']?([a-zA-Z0-9_]+)["']?/i);
    const alter=trimmed.match(/^ALTER TABLE\s+"?([a-zA-Z0-9_]+)"?\s+RENAME TO\s+"?([a-zA-Z0-9_]+)"?/i);
    const drop=trimmed.match(/^DROP TABLE(?: IF EXISTS)?\s+"?([a-zA-Z0-9_]+)"?/i);
    const request=/^ALTER TABLE/i.test(trimmed)?{sql:postgresDdl(trimmed)}:postgresSql(trimmed,args),result=this.#call(request);
    if(index)this.#call({sql:'INSERT INTO _academy_registry(name,type,sql) VALUES($1,$2,$3) ON CONFLICT(name) DO NOTHING',params:[index[1],'index',trimmed]});
    if(alter)this.#call({sql:'UPDATE _academy_registry SET name=$1 WHERE name=$2',params:[alter[2],alter[1]]});
    if(drop)this.#call({sql:'DELETE FROM _academy_registry WHERE name=$1',params:[drop[1]]});
    return result;
  }
  exec(source){for(const statement of splitSql(source))this.#execute(statement);return this;}
  schemaSnapshot(){
    const tables=this.#call({sql:'SELECT table_name AS name,jsonb_agg(column_name ORDER BY ordinal_position) AS columns FROM information_schema.columns WHERE table_schema=$1 GROUP BY table_name ORDER BY table_name',params:[this.schema]}).rows;
    const indexes=this.#call({sql:'SELECT indexname AS name FROM pg_indexes WHERE schemaname=$1 ORDER BY indexname',params:[this.schema]}).rows.map(row=>row.name);
    const functions=this.#call({sql:'SELECT p.proname AS name FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname=$1 ORDER BY p.proname',params:[this.schema]}).rows.map(row=>row.name);
    return {tables,indexes,functions};
  }
  withReadScope(work){return this.#reads.run(work);}
  prepare(sql){
    const execute=(...args)=>this.#execute(sql,args);
    return {reader:/^\s*(SELECT|WITH|PRAGMA)\b|\bRETURNING\b/i.test(sql),all:(...args)=>execute(...args).rows,get:(...args)=>execute(...args).rows[0],run:(...args)=>{const result=execute(...args);return {changes:result.changes,lastInsertRowid:0};},iterate:function*(...args){yield*execute(...args).rows;},columns:()=>[]};
  }
  // Kysely's SQLite-compatible repository dialect preserves existing auth hashes,
  // timestamps and invitation contracts while PostgreSQL owns the actual tables.
  aggregate(){throw new Error('Agregações JavaScript não são registradas no PostgreSQL.');}
  function(name){
    if(name==='academy_map_version')this.#call({sql:`CREATE OR REPLACE FUNCTION academy_map_version(kind TEXT,body TEXT,url TEXT,sha TEXT) RETURNS TEXT LANGUAGE SQL IMMUTABLE AS $f$ SELECT kind||':'||CASE WHEN kind='file' THEN coalesce(sha,'pending') ELSE encode(sha256(convert_to(CASE WHEN kind='text' THEN body ELSE url END,'UTF8')),'hex') END $f$`});
    else if(name==='academy_map_search')this.#call({sql:`CREATE OR REPLACE FUNCTION academy_map_search(value TEXT) RETURNS TEXT LANGUAGE SQL IMMUTABLE AS $f$ SELECT lower(regexp_replace(normalize(coalesce(value,''),NFD),U&'[\\0300-\\036F]','','g')) $f$`});
    else throw new Error('Função de banco não cadastrada.');
  }
  close(){if(this.#closed)return;try{this.#call({op:'close'});}finally{this.#closed=true;void this.#worker.terminate();}}
}
