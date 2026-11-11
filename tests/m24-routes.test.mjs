import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {randomBytes} from 'node:crypto';
import {createApp} from '../server.mjs';
import {createOnboardingService} from '../lib/onboarding.mjs';

test('M24 desativado por configuração não cria tabelas nem entrega interface privada',async()=>{
  const dir=await mkdtemp(resolve(tmpdir(),'m24-off-'));
  const {app,ctx}=await createApp({dataDir:dir,testMode:true,includeLibrary:false,m24:{enabled:false}});
  const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
  try{
    const base='http://127.0.0.1:'+server.address().port;
    for(const path of ['/homologacao/m24','/homologacao/m24/app.js','/api/homologacao/m24'])assert.equal((await fetch(base+path)).status,404);
    assert.equal(ctx.db.prepare("SELECT count(*) n FROM sqlite_master WHERE type='table' AND name LIKE 'academy_m24_%'").get().n,0);
  }finally{await new Promise(r=>server.close(r));ctx.db.close();await rm(dir,{recursive:true,force:true});}
});
test('M24 valida identidade em todas as rotas e preserva dados existentes',async()=>{
  const dir=await mkdtemp(resolve(tmpdir(),'m24-http-')),baseURL='http://localhost:4297';
  const {app,ctx}=await createApp({dataDir:dir,baseURL,testMode:true,includeLibrary:false,m24:{enabled:true}});
  const server=app.listen(4297,'127.0.0.1');await new Promise(r=>server.once('listening',r));
  const request=async(cookie,path,method='GET',body,origin=baseURL)=>{
    const res=await fetch(baseURL+path,{method,headers:{Origin:origin,Connection:'close',...(cookie?{Cookie:cookie}:{}),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
    const raw=await res.text();let data;try{data=JSON.parse(raw);}catch{}return {status:res.status,raw,data,headers:res.headers};
  };
  const clients={};
  try{
    for(const [name,role] of [['owner-m24','admin'],['other-m24','admin'],['seller-m24','seller']]){
      const email=name+'@example.test',inv=ctx.createInvitation({name:'Conta de teste '+name,email,role,tracks:['pap']});
      const res=await fetch(baseURL+'/api/auth/sign-up/email',{method:'POST',headers:{Origin:baseURL,'Content-Type':'application/json','x-academy-invite':new URL(inv.url).searchParams.get('convite')},body:JSON.stringify({name:'Teste',email,password:randomBytes(24).toString('base64url')})});
      assert.equal(res.status,200);const cookie=res.headers.getSetCookie().map(c=>c.split(';')[0]).join('; '),id=ctx.db.prepare('SELECT id FROM user WHERE email=?').get(email).id;
      createOnboardingService(ctx.db,ctx.bank).save(id,{sector:'PAP',role:'Vendedor(a)',goal:'Supervisor(a)',dream:'Crescer na ST1',challenges:['Abordagem'],squad:'Equipe 1'});
      clients[name]={id,cookie};
    }
    const owner=clients['owner-m24'];
    const paths=['/homologacao/m24','/homologacao/m24/app.js','/homologacao/m24/style.css','/api/homologacao/m24','/api/homologacao/m24/sources','/api/homologacao/m24/export'];
    for(const path of paths){
      assert.equal((await request('',path)).status,401,path);
      assert.equal((await request(clients['seller-m24'].cookie,path)).status,404,path);
      for(const name of ['owner-m24','other-m24'])assert.equal((await request(clients[name].cookie,path)).status,200,path);
    }
    assert.equal((await request(owner.cookie,'/homologacao/m24')).headers.get('cache-control'),'no-store');
    assert.equal((await request(owner.cookie,'/api/me')).data.m24Homologation,true);
    assert.equal((await request(clients['other-m24'].cookie,'/api/me')).data.m24Homologation,true);
    assert.equal((await request(clients['seller-m24'].cookie,'/api/me')).data.m24Homologation,false);
    const url='/api/homologacao/m24/sources',body={title:'Manual da homologação',type:'manual_interno',reference:'https://example.test/manual',version:'v1'};
    assert.equal((await request(owner.cookie,url,'POST',body,'https://evil.example.test')).status,403);
    assert.equal((await request(clients['seller-m24'].cookie,url,'POST',body)).status,404);
    assert.equal((await request(owner.cookie,url,'POST',body)).status,201);
    const createdSource=(await request(owner.cookie,url)).data.items[0];
    assert.equal((await request(owner.cookie,url)).data.items.length,1);
    assert.equal((await request(owner.cookie,url,'POST',null)).status,400);
    const content=ctx.contents.create(owner.id,{title:'Material do piloto',kind:'text',body:'Exemplo de homologação',tracks:['pap'],audience:['seller'],status:'draft'});
    const contentPath='/api/homologacao/m24/contents/'+content.id;
    let ficha=(await request(owner.cookie,contentPath)).data;
    const metadata={revision:ficha.revision,contentRevision:ficha.contentRevision,curator:'Curadoria de teste',criticality:'normal',sourceIds:[createdSource.id],nextReviewOn:'2099-01-01'};
    const saved=await request(owner.cookie,contentPath,'PUT',metadata);assert.equal(saved.status,200);ficha=saved.data;
    const requested=await request(owner.cookie,contentPath+'/reviews','POST',{action:'request',revision:ficha.revision,contentRevision:ficha.contentRevision,requestKey:crypto.randomUUID(),reason:'Solicitar conferência da fonte'});assert.equal(requested.status,200);ficha=requested.data;
    const approved=await request(owner.cookie,contentPath+'/reviews','POST',{action:'approve',revision:ficha.revision,contentRevision:ficha.contentRevision,requestKey:crypto.randomUUID(),reason:'Fonte conferida',selfReviewReason:'Piloto de responsável único'});assert.equal(approved.status,200);assert.equal(approved.data.effectiveState,'approved');
    assert.equal(ctx.contents.detail({user_id:owner.id,role:'admin',enabled:1},content.id,true).status,'draft');
    assert.equal((await request(clients['other-m24'].cookie,contentPath)).status,200);
    assert.equal((await request(clients['seller-m24'].cookie,contentPath)).status,404);
    assert.equal((await request(clients['seller-m24'].cookie,contentPath,'PUT',metadata)).status,404);
    assert.equal((await request(clients['seller-m24'].cookie,contentPath+'/reviews','POST',{action:'approve'})).status,404);
    ctx.db.prepare('UPDATE academy_member SET enabled=0 WHERE user_id=?').run(owner.id);
    assert.equal((await request(owner.cookie,'/api/homologacao/m24')).status,403);
  }finally{await new Promise(r=>server.close(r));ctx.db.close();await rm(dir,{recursive:true,force:true});}
});
