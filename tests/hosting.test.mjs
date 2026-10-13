import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {existsSync,readFileSync,writeFileSync,appendFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {randomBytes,createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {createContext,projectRoot} from '../lib/context.mjs';
import {createApp} from '../server.mjs';
import {hostingConfig} from '../lib/hosting.mjs';
import {exportProduction,validateProductionBundle,stageProductionBundle,applyStagedProduction} from '../lib/production-transfer.mjs';
import {createBackupService} from '../lib/storage-backup.mjs';

const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const addOwner=async ctx=>{
  const email='hosting-owner@example.test',password=randomBytes(24).toString('base64url');
  const invitation=ctx.createInvitation({name:'Gestor da publicação',email,role:'admin'});
  const result=await ctx.auth.api.signUpEmail({body:{name:'Gestor da publicação',email,password},headers:new Headers({'x-academy-invite':new URL(invitation.url).searchParams.get('convite'),origin:ctx.baseURL})});
  return {id:result.user.id,email,password};
};

test('a publicação exige HTTPS e disco privado e não reaproveita o modo de teste',()=>{
  const dataDir=resolve(tmpdir(),'academy-production-config');
  const env={RENDER:'true',RENDER_EXTERNAL_URL:'https://academy.example.test',ACADEMY_DATA_DIR:dataDir,ACADEMY_TEST_MODE:'0',ACADEMY_TRUST_PROXY:'1'};
  const config=hostingConfig({},env,projectRoot);
  assert.equal(config.environment,'production-persistent');assert.equal(config.baseURL,env.RENDER_EXTERNAL_URL);assert.equal(config.host,'0.0.0.0');assert.equal(config.port,10000);
  assert.throws(()=>hostingConfig({}, {...env,ACADEMY_DATA_DIR:''},projectRoot),/disco persistente/);
  assert.throws(()=>hostingConfig({}, {...env,ACADEMY_BASE_URL:'http://academy.example.test'},projectRoot),/HTTPS/);
  assert.throws(()=>hostingConfig({}, {...env,ACADEMY_TEST_MODE:'1'},projectRoot),/separado/);
  assert.throws(()=>hostingConfig({}, {...env,ACADEMY_DATA_DIR:resolve(projectRoot,'public','data')},projectRoot),/pasta pública/);
  assert.throws(()=>hostingConfig({}, {...env,ACADEMY_TRUST_PROXY:'true'},projectRoot),/proxy/);
  assert.throws(()=>hostingConfig({}, {...env,ACADEMY_BASE_URL:'https://academy.example.test/login'},projectRoot),/origem/);
  assert.throws(()=>hostingConfig({}, {...env,PORT:'NaN'},projectRoot),/porta/);
  assert.equal(hostingConfig({}, {},projectRoot).environment,'local-persistent');
});

test('saúde de produção bloqueia tráfego antes de preservar o gestor; cookies HTTPS são seguros',async()=>{
  const dataDir=await mkdtemp(resolve(tmpdir(),'academy-production-health-'));
  const {app,ctx}=await createApp({dataDir,baseURL:'https://academy.example.test',deployment:'production',testMode:false,includeLibrary:false,includeLearningFlows:false,proxyHops:1});
  app.get('/fixture-ip',(req,res)=>res.json({ip:req.ip,authIp:req.headers['x-academy-client-ip']}));
  const server=await new Promise(done=>{const server=app.listen(0,'127.0.0.1',()=>done(server));});
  const url='http://127.0.0.1:'+server.address().port;
  try{
    let response=await fetch(url+'/healthz');assert.equal(response.status,503);assert.equal((await response.json()).status,'preparing');
    assert.equal((await fetch(url+'/api/auth-settings')).status,503);
    const owner=await addOwner(ctx);
    response=await fetch(url+'/healthz');assert.equal(response.status,200);const health=await response.json();assert.deepEqual(Object.keys(health).sort(),['environment','status','version']);assert.equal(health.environment,'production-persistent');
    response=await fetch(url+'/fixture-ip',{headers:{'x-forwarded-for':'198.51.100.1, 198.51.100.2','x-academy-client-ip':'malicious-value'}});assert.deepEqual(await response.json(),{ip:'198.51.100.2',authIp:'198.51.100.2'});
    const login=await ctx.auth.api.signInEmail({body:{email:owner.email,password:owner.password},headers:new Headers({origin:ctx.baseURL}),asResponse:true});
    assert.equal(login.status,200);assert.ok(login.headers.getSetCookie().some(c=>/Secure/.test(c)&&/HttpOnly/.test(c)&&/__Secure-/.test(c)));
    app.locals.shuttingDown=true;assert.equal((await fetch(url+'/healthz')).status,503);
  }finally{await new Promise(done=>server.close(done));ctx.db.close();await rm(dataDir,{recursive:true,force:true});}
});

test('transferência preserva conta, senha, conteúdo e chave; avaliações de teste ficam somente no piloto',async()=>{
  const root=await mkdtemp(resolve(tmpdir(),'academy-transfer-'));
  const source=resolve(root,'source'),output=resolve(root,'output'),destination=resolve(root,'production');
  const ctx=await createContext({dataDir:source,baseURL:'http://localhost:4175',testMode:true,includeLibrary:false,includeLearningFlows:false});
  let production;
  try{
    const owner=await addOwner(ctx),now=new Date().toISOString();
    const material=ctx.contents.create(owner.id,{title:'Material real do time',summary:'Conteúdo que precisa ser preservado.',kind:'text',body:'Estudo criado pela gestão.',category:'processos',tracks:['pap'],audience:['seller','supervisor'],status:'published'});
    ctx.db.prepare('INSERT INTO academy_attempt(id,user_id,track_id,version,questions_private,started_at) VALUES(?,?,?,?,?,?)').run('pilot-attempt',owner.id,'pap','pilot','[]',now);
    ctx.db.prepare('INSERT INTO academy_certificate(id,user_id,attempt_id,track_id,version,name,score,issued_at) VALUES(?,?,?,?,?,?,?,?)').run('pilot-certificate',owner.id,'pilot-attempt','pap','pilot','Gestor da publicação',100,now);
    const sourceSecret=readFileSync(resolve(source,'.auth-secret'));
    const originalPassword=ctx.db.prepare("SELECT password FROM account WHERE providerId='credential' AND userId=?").get(owner.id).password;
    const result=await exportProduction(source,output);
    assert.equal(result.manifest.excludedPilotRecords.academy_attempt,1);assert.equal(result.manifest.excludedPilotRecords.academy_certificate,1);
    assert.equal(ctx.db.prepare('SELECT count(*) n FROM academy_attempt').get().n,1);
    assert.equal(ctx.db.prepare("SELECT value FROM academy_settings WHERE key='environment'").get().value,'test');
    assert.equal(hash(readFileSync(resolve(result.bundle,'.auth-secret'))),hash(sourceSecret));
    assert.equal(validateProductionBundle(result.bundle).environment,'production');
    assert.throws(()=>stageProductionBundle(result.bundle,source),/teste.*intacto/);
    stageProductionBundle(result.bundle,destination);assert.equal(applyStagedProduction(destination),true);assert.equal(applyStagedProduction(destination),false);
    production=await createContext({dataDir:destination,baseURL:'https://academy.example.test',deployment:'production',testMode:false,includeLibrary:false,includeLearningFlows:false});
    assert.equal(production.db.prepare('SELECT count(*) n FROM academy_attempt').get().n,0);assert.equal(production.db.prepare('SELECT count(*) n FROM academy_certificate').get().n,0);
    assert.equal(production.db.prepare('SELECT body FROM academy_content WHERE id=?').get(material.id).body,'Estudo criado pela gestão.');
    assert.equal(production.db.prepare("SELECT password FROM account WHERE providerId='credential' AND userId=?").get(owner.id).password,originalPassword);
    const login=await production.auth.api.signInEmail({body:{email:owner.email,password:owner.password},headers:new Headers({origin:production.baseURL})});assert.equal(login.user.id,owner.id);
    assert.throws(()=>stageProductionBundle(result.bundle,destination),/já tem dados/);
    await assert.rejects(()=>exportProduction(source,output),/pasta nova/);
  }finally{production?.db.close();ctx.db.close();await rm(root,{recursive:true,force:true});}
});

test('pacote adulterado é recusado antes de escrever no destino',async()=>{
  const root=await mkdtemp(resolve(tmpdir(),'academy-transfer-integrity-'));
  const ctx=await createContext({dataDir:resolve(root,'source'),baseURL:'http://localhost:4175',testMode:true,includeLibrary:false,includeLearningFlows:false});
  try{
    await addOwner(ctx);const {bundle}=await exportProduction(ctx.dataDir,resolve(root,'output'));
    appendFileSync(resolve(bundle,'academy.sqlite'),'alterado');
    assert.throws(()=>stageProductionBundle(bundle,resolve(root,'destination')),/alterado/);assert.equal(existsSync(resolve(root,'destination')),false);
  }finally{ctx.db.close();await rm(root,{recursive:true,force:true});}
});

test('backup lê o WAL aberto e preserva os registros; manutenção respeita a retenção configurada',async()=>{
  const dataDir=await mkdtemp(resolve(tmpdir(),'academy-backup-'));
  const ctx=await createContext({dataDir,baseURL:'http://localhost:4175',testMode:true,includeLibrary:false,includeLearningFlows:false});
  try{
    const owner=await addOwner(ctx),service=createBackupService(ctx,{retention:2,intervalMs:1000});
    const first=await service.create();assert.ok(first.bytes>0);
    ctx.db.prepare('UPDATE user SET name=? WHERE id=?').run('Nome preservado no WAL',owner.id);
    const second=await service.create(),copy=new DatabaseSync(resolve(dataDir,'backups',second.filename),{readOnly:true});
    try{assert.equal(copy.prepare('SELECT name FROM user WHERE id=?').get(owner.id).name,'Nome preservado no WAL');assert.equal(copy.prepare('PRAGMA quick_check').get().quick_check,'ok');}finally{copy.close();}
    const unrelated=resolve(dataDir,'backups','arquivo-do-gestor.txt');writeFileSync(unrelated,'preservar');
    await service.create();assert.equal(existsSync(resolve(dataDir,'backups',first.filename)),false);assert.equal(readFileSync(unrelated,'utf8'),'preservar');
    assert.equal(await service.tick(),undefined);await service.drain();service.stop();
  }finally{ctx.db.close();await rm(dataDir,{recursive:true,force:true});}
});
