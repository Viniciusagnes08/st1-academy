import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,randomBytes} from 'node:crypto';
import {mkdtemp,rm} from 'node:fs/promises';
import {readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import pg from 'pg';
import {PDFDocument} from 'pdf-lib';
import {PostgresDatabase} from '../lib/postgres-db.mjs';
import {createContext} from '../lib/context.mjs';
import {exportProduction} from '../lib/production-transfer.mjs';
import {importSupabase} from '../lib/supabase-transfer.mjs';
import {hostingConfig} from '../lib/hosting.mjs';

const url=process.env.ACADEMY_PG_TEST_URL;
const schemaName=()=> 'academy_storage_'+randomUUID().replaceAll('-','');
async function adminConnection(){
  const target=new URL(url);
  assert.ok(['localhost','127.0.0.1','[::1]'].includes(target.hostname),'Os testes que encerram conexões exigem um PostgreSQL local separado.');
  const client=new pg.Client({connectionString:url,ssl:false});await client.connect();return client;
}

test('PostgreSQL guarda bytes e datas e desfaz somente a transação interna',{skip:!url},async()=>{
  const schema=schemaName(),admin=await adminConnection(),db=new PostgresDatabase({url,schema,ssl:false});
  try{
    db.exec('CREATE TABLE records(id TEXT PRIMARY KEY,bytes BLOB,at DATE); BEGIN IMMEDIATE;');
    const bytes=Buffer.from([0,1,255,34]),at=new Date('2026-10-12T14:00:00Z');
    db.prepare('INSERT INTO records VALUES(?,?,?)').run('kept',bytes,at);
    db.exec('BEGIN IMMEDIATE;');db.prepare('INSERT INTO records VALUES(?,?,?)').run('rolled-back',bytes,at);db.exec('ROLLBACK; COMMIT;');
    const row=db.prepare('SELECT * FROM records WHERE id=?').get('kept');assert.deepEqual(row,{id:'kept',bytes,at});
    assert.equal(db.prepare('SELECT count(*) n FROM records').get().n,1);
    const security=await admin.query('SELECT relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=$1 AND c.relname=$2',[schema,'records']);
    assert.equal(security.rows[0].relrowsecurity,true);
    assert.equal(Number((await admin.query("SELECT count(*) n FROM pg_namespace n JOIN LATERAL aclexplode(coalesce(n.nspacl,acldefault('n',n.nspowner))) a ON TRUE WHERE n.nspname=$1 AND a.grantee=0 AND a.privilege_type='USAGE'",[schema])).rows[0].n),0);
  }finally{db.close();await admin.query('DROP SCHEMA "'+schema+'" CASCADE');await admin.end();}
});

test('uma queda do banco não repete gravações nem continua uma transação fora do esquema privado',{skip:!url},async()=>{
  const schema=schemaName(),admin=await adminConnection(),db=new PostgresDatabase({url,schema,ssl:false});
  try{
    db.exec('CREATE TABLE records(id TEXT PRIMARY KEY); BEGIN IMMEDIATE;');db.prepare('INSERT INTO records VALUES(?)').run('uncommitted');
    const pid=db.prepare('SELECT pg_backend_pid() pid').get().pid;
    await admin.query('SELECT pg_terminate_backend($1)',[pid]);
    await new Promise(done=>setTimeout(done,100));
    assert.throws(()=>db.prepare('INSERT INTO records VALUES(?)').run('must-not-replay'),error=>error.code==='ACADEMY_CONNECTION_LOST');
    db.exec('ROLLBACK');
    assert.equal(db.prepare('SELECT count(*) n FROM records').get().n,0);
    assert.equal(db.prepare('SELECT current_schema() name').get().name,schema);
    db.prepare('INSERT INTO records VALUES(?)').run('after-reconnect');
    assert.deepEqual(db.prepare('SELECT id FROM records').all(),[{id:'after-reconnect'}]);
  }finally{db.close();await admin.query('DROP SCHEMA "'+schema+'" CASCADE');await admin.end();}
});

test('a cópia de produção migra para PostgreSQL com a mesma senha e arquivo; um destino usado é protegido',{skip:!url},async()=>{
  const schema=schemaName(),admin=await adminConnection(),root=await mkdtemp(resolve(tmpdir(),'academy-pg-transfer-'));
  const source=resolve(root,'source'),bundle=resolve(root,'export');
  let local,remote;
  try{
    local=await createContext({storage:'sqlite',dataDir:source,baseURL:'http://localhost:4175',testMode:true,includeLibrary:false,includeLearningFlows:false});
    const email='postgres-owner@example.test',password=randomBytes(24).toString('base64url');
    const invitation=local.createInvitation({name:'Gestor PostgreSQL',email,role:'admin'});
    const owner=await local.auth.api.signUpEmail({body:{name:'Gestor PostgreSQL',email,password},headers:new Headers({'x-academy-invite':new URL(invitation.url).searchParams.get('convite'),origin:local.baseURL})});
    const material=local.contents.create(owner.user.id,{title:'Material que permanece',summary:'Arquivo de estudo.',kind:'file',category:'processos',tracks:['pap'],audience:['seller'],status:'draft'});
    const pdf=await PDFDocument.create();pdf.addPage([200,200]);const bytes=Buffer.from(await pdf.save());
    local.contents.upload(owner.user.id,material.id,material.revision,encodeURIComponent('estudo.pdf'),bytes);
    const original=local.db.prepare("SELECT password FROM account WHERE userId=? AND providerId='credential'").get(owner.user.id).password;
    const exported=await exportProduction(source,bundle);
    const result=await importSupabase(exported.bundle,{url,schema,ssl:false,baseURL:'https://academy.example.test'});
    assert.equal(result.verified,true);assert.equal(result.originalFilesVerified,true);
    remote=await createContext({storage:'postgres',postgres:{url,schema,ssl:false},dataDir:resolve(root,'remote'),deployment:'production',baseURL:'https://academy.example.test',authSecret:readFileSync(resolve(exported.bundle,'.auth-secret'),'utf8'),testMode:false,includeLibrary:false,includeLearningFlows:false});
    assert.equal(remote.db.prepare("SELECT password FROM account WHERE userId=? AND providerId='credential'").get(owner.user.id).password,original);
    assert.deepEqual(remote.db.prepare('SELECT bytes FROM academy_content_asset').get().bytes,bytes);
    assert.equal((await remote.auth.api.signInEmail({body:{email,password},headers:new Headers({origin:remote.baseURL})})).user.id,owner.user.id);
    await assert.rejects(()=>importSupabase(exported.bundle,{url,schema,ssl:false,baseURL:remote.baseURL}),/não pode sobrescrevê/);
  }finally{local?.db.close();remote?.db.close();await admin.query('DROP SCHEMA "'+schema+'" CASCADE');await admin.end();assert.ok(root.startsWith(resolve(tmpdir(),'academy-pg-transfer-')));await rm(root,{recursive:true,force:true});}
});

test('publicação PostgreSQL exige segredo estável e conexão privada sem exigir disco pago',()=>{
  const env={RENDER:'true',RENDER_EXTERNAL_URL:'https://academy.example.test',ACADEMY_STORAGE:'postgres',DATABASE_URL:'postgresql://private.example.test/postgres',ACADEMY_AUTH_SECRET:'a'.repeat(48),ACADEMY_TEST_MODE:'0'};
  assert.equal(hostingConfig({},env).environment,'production-postgres');
  assert.throws(()=>hostingConfig({}, {...env,DATABASE_URL:''}),/variáveis privadas/);
  assert.throws(()=>hostingConfig({}, {...env,ACADEMY_AUTH_SECRET:'short'}),/variáveis privadas/);
  assert.throws(()=>new PostgresDatabase({url:env.DATABASE_URL,ssl:false}),/TLS/);
});
