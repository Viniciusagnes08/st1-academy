import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {runtimeSchemaGuard} from '../lib/runtime-schema.mjs';
import {createServerlessHandler} from '../lib/serverless-handler.mjs';
import {hostingConfig} from '../lib/hosting.mjs';

test('Vercel exige PostgreSQL, origem HTTPS e credencial de servidor',()=>{
  const env={VERCEL:'1',ACADEMY_BASE_URL:'https://academy.example.test',ACADEMY_STORAGE:'postgres',DATABASE_URL:'postgresql://qa@localhost/qa',ACADEMY_AUTH_SECRET:'isolated-qa-key-at-least-thirty-two-characters'};
  assert.equal(hostingConfig({},env).serverless,true);
  assert.equal(hostingConfig({},env).production,true);
  assert.equal(hostingConfig({},{...env,VERCEL:undefined,NETLIFY:'true'}).serverless,true);
  assert.equal(hostingConfig({serverless:true},{...env,VERCEL:undefined}).serverless,true);
  assert.throws(()=>hostingConfig({storage:'sqlite'},{...env,VERCEL:undefined,NETLIFY:'true'}),/PostgreSQL/);
  assert.throws(()=>hostingConfig({storage:'sqlite'},env),/PostgreSQL/);
  assert.throws(()=>hostingConfig({baseURL:'http://localhost:4177'},env),/HTTPS/);
  assert.throws(()=>hostingConfig({},{...env,DATABASE_URL:''}),/DATABASE_URL/);
});

test('inicialização confere esquema existente sem DDL e libera transações depois',()=>{
  const calls=[],original={exec:sql=>{calls.push(sql);return original;},prepare:sql=>({get:()=>{calls.push(sql);return {present:1};},run:()=>{calls.push(sql);return {changes:1};}})};
  const guard=runtimeSchemaGuard(original,{tables:[{name:'academy_content',columns:['id','scope']}],indexes:['content_idx'],functions:['academy_map_version']});
  guard.db.exec('CREATE TABLE IF NOT EXISTS academy_content(id TEXT); CREATE INDEX IF NOT EXISTS content_idx ON academy_content(id);');
  assert.deepEqual(guard.db.prepare('PRAGMA table_info(academy_content)').all(),[{name:'id'},{name:'scope'}]);
  guard.db.function('academy_map_version');assert.deepEqual(calls,[]);
  assert.throws(()=>guard.db.exec('CREATE TABLE IF NOT EXISTS missing(id TEXT)'),/Atualize o esquema/);
  assert.throws(()=>guard.db.exec('ALTER TABLE academy_content ADD COLUMN private TEXT'),/Atualize o esquema/);
  assert.throws(()=>guard.db.function('unknown_function'),/Atualize o esquema/);
  assert.equal(guard.db.prepare('INSERT OR IGNORE INTO academy_game_rules(id,rules_json) VALUES(1,?)').run('{}').changes,0);
  assert.deepEqual(calls,['SELECT 1 FROM academy_game_rules WHERE id=1']);
  guard.finish();guard.db.exec('BEGIN IMMEDIATE');guard.db.exec('COMMIT');
  assert.deepEqual(calls.slice(-2),['BEGIN IMMEDIATE','COMMIT']);
});

test('requisições concorrentes não compartilham a transação e inicializam uma só aplicação',async()=>{
  let active=null,created=0;const seen=[];
  const handler=createServerlessHandler({createApp:async()=>{
    created++;
    return {app:async(req,res)=>{
      const id=req.url.slice(1);assert.equal(active,null);active=id;
      await new Promise(done=>setTimeout(done,id==='first'?45:5));
      assert.equal(active,id);seen.push(id);active=null;res.end(id);
    }};
  }});
  const server=createServer(handler);await new Promise(done=>server.listen(0,'127.0.0.1',done));
  try{
    const base='http://127.0.0.1:'+server.address().port;
    const responses=await Promise.all(['/first','/second','/third'].map(async path=>(await fetch(base+path)).text()));
    assert.deepEqual(responses,['first','second','third']);assert.equal(created,1);assert.equal(seen.length,3);
  }finally{await new Promise(done=>server.close(done));}
});

test('falha de inicialização é recuperável sem divulgar configurações privadas',async()=>{
  let calls=0;
  const handler=createServerlessHandler({createApp:async()=>{calls++;if(calls===1)throw new Error('Isolated startup failure');return {app:(_,res)=>res.end('ready')};}});
  const server=createServer(handler);await new Promise(done=>server.listen(0,'127.0.0.1',done));
  try{
    const url='http://127.0.0.1:'+server.address().port;
    const failed=await fetch(url);assert.equal(failed.status,503);assert.equal(failed.headers.get('cache-control'),'no-store');assert.doesNotMatch(await failed.text(),/Isolated/);
    assert.equal(await (await fetch(url)).text(),'ready');assert.equal(calls,2);
  }finally{await new Promise(done=>server.close(done));}
});
