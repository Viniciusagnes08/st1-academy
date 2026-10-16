import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,randomBytes} from 'node:crypto';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import pg from 'pg';
import {createContext} from '../lib/context.mjs';
import {createApp} from '../server.mjs';
import {createServerlessHandler} from '../lib/serverless-handler.mjs';
import {createServer} from 'node:http';

const url=process.env.ACADEMY_PG_TEST_URL;
test('entrada serverless preserva o banco PostgreSQL preparado e o acesso original',{skip:!url},async()=>{
  const target=new URL(url);assert.ok(['localhost','127.0.0.1','[::1]'].includes(target.hostname),'QA exige PostgreSQL local isolado.');
  const directory=await mkdtemp(resolve(tmpdir(),'academy-serverless-')),schema='academy_serverless_'+randomUUID().replaceAll('-','');
  const admin=new pg.Client({connectionString:url,ssl:false});await admin.connect();
  const originalVercel=process.env.VERCEL;
  const options={dataDir:directory,baseURL:'https://academy.example.test',deployment:'production',storage:'postgres',authSecret:'isolated-serverless-qa-key-with-at-least-32-characters',postgres:{url,schema,ssl:false},testMode:false,includeLibrary:false,includeLearningFlows:false,googleConfig:{clientId:'',clientSecret:''}};
  let original,application,server;
  try{
    delete process.env.VERCEL;
    original=await createContext(options);
    const password=randomBytes(24).toString('base64url'),email='admin@serverless.example';
    const invitation=original.createInvitation({name:'Admin da conferência',email,role:'admin'});
    const enrolled=await original.auth.api.signUpEmail({body:{name:'Admin da conferência',email,password},headers:new Headers({origin:options.baseURL,'x-academy-invite':new URL(invitation.url).searchParams.get('convite')})});
    const item=original.contents.create(enrolled.user.id,{title:'Material preservado',kind:'text',body:'O conteúdo permanece na migração.',tracks:['pap'],audience:['seller'],status:'published'});
    const hash=original.db.prepare("SELECT password FROM account WHERE providerId='credential' AND userId=?").get(enrolled.user.id).password;
    const before=original.db.schemaSnapshot();original.db.close();original=null;
    process.env.VERCEL='1';
    application=await createApp(options);
    assert.equal(application.ctx.runtime.serverless,true);
    assert.deepEqual(application.ctx.db.schemaSnapshot(),before);
    assert.equal(application.ctx.db.prepare("SELECT password FROM account WHERE providerId='credential' AND userId=?").get(enrolled.user.id).password,hash);
    const handler=createServerlessHandler({createApp:async()=>application});
    server=createServer(handler);await new Promise(done=>server.listen(0,'127.0.0.1',done));
    const local='http://127.0.0.1:'+server.address().port;
    const request=(path,init={})=>fetch(local+path,{...init,headers:{origin:options.baseURL,Connection:'close',...init.headers}});
    assert.equal((await request('/api/library')).status,401);
    const login=await request('/api/auth/sign-in/email',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password})});
    assert.equal(login.status,200);const cookie=login.headers.getSetCookie().map(value=>value.split(';')[0]).join('; ');
    const bootstrap=await request('/api/bootstrap',{headers:{Cookie:cookie}});assert.equal(bootstrap.status,200);assert.equal((await bootstrap.json()).user.role,'admin');
    const library=await request('/api/library',{headers:{Cookie:cookie}});assert.equal(library.status,200);assert.ok((await library.json()).items.some(record=>record.id===item.id));
    const saved=await request('/api/admin/contents/'+item.id,{method:'PATCH',headers:{Cookie:cookie,'Content-Type':'application/json'},body:JSON.stringify({revision:item.revision,summary:'Atualização após a inicialização.'})});
    assert.equal(saved.status,200);assert.equal((await saved.json()).summary,'Atualização após a inicialização.');
  }finally{
    if(server)await new Promise(done=>server.close(done));application?.ctx.db.close();original?.db.close();
    if(originalVercel===undefined)delete process.env.VERCEL;else process.env.VERCEL=originalVercel;
    assert.match(schema,/^academy_serverless_[a-f0-9]{32}$/);await admin.query('DROP SCHEMA "'+schema+'" CASCADE');await admin.end();
    assert.equal(resolve(directory,'..'),resolve(tmpdir()));await rm(directory,{recursive:true,force:true});
  }
});
