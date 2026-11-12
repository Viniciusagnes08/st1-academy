// These fixtures isolate the existing grading/access/study contracts.
// Default curriculum and prerequisite enforcement are covered in learning-flows.test.mjs.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {randomBytes} from 'node:crypto';
import {createApp} from '../server.mjs';
import {completeOnboardingForTest} from './helpers/academy-fixtures.mjs';

test('Estudo declarado acompanha a conta, a versão e a visibilidade sem aprovar provas',async t=>{
  const dataDir=await mkdtemp(resolve(tmpdir(),'st1-material-study-')),baseURL='http://localhost:4201';
  let instance=await createApp({dataDir,baseURL,testMode:true,includeLearningFlows:false,googleConfig:{clientId:'',clientSecret:''}}),server;
  const listen=()=>new Promise(resolve=>{const s=instance.app.listen(4201,'127.0.0.1',()=>resolve(s));});server=await listen();
  const clients={};
  const request=async(who,path,{method='GET',body,headers={}}={})=>{
    const response=await fetch(baseURL+path,{method,headers:{Origin:baseURL,Connection:'close',...(who?{Cookie:who.cookie}:{}),...(body?{'Content-Type':'application/json'}:{}),...headers},...(body?{body:JSON.stringify(body)}:{})});
    return {status:response.status,data:await response.json()};
  };
  try{
    for(const [name,role,tracks,permissions] of [['admin','admin',['pap']],['seller','seller',['pap']],['peer','seller',['pap']],['supervisor','supervisor',['pap']],['digital','seller',['digital']],['restricted','seller',['pap'],['assessments']]]){
      const invite=instance.ctx.createInvitation({name:'Teste estudo '+name,email:name+'@study.example',role,tracks,permissions});
      const response=await fetch(baseURL+'/api/auth/sign-up/email',{method:'POST',headers:{Origin:baseURL,'Content-Type':'application/json','x-academy-invite':new URL(invite.url).searchParams.get('convite'),Connection:'close'},body:JSON.stringify({name:'Teste estudo',email:name+'@study.example',password:randomBytes(24).toString('base64url')})});
      assert.equal(response.status,200);const user=await response.json();clients[name]={id:user.user.id,cookie:response.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ')};completeOnboardingForTest(instance.ctx.db,user.user.id);
    }
    const pdfId='st1-catalogo-pap',path='/api/contents/'+pdfId,study=(await request(clients.seller,path)).data.study;
    await t.test('conclusão é explícita e privada; chegar à última página não conclui o estudo',async()=>{
      await request(clients.seller,path+'/progress',{method:'POST',body:{page:15,pages:15}});
      const progress=(await request(clients.seller,path+'/study')).data;assert.equal(progress.completed,false);assert.equal(progress.percent,99);
      const done=await request(clients.seller,path+'/study',{method:'POST',body:{version:study.version,completed:true,userId:'outra-conta'}});assert.equal(done.status,200);assert.equal(done.data.completed,true);assert.equal(done.data.percent,100);assert.ok(done.data.completedAt);
      for(const who of [clients.admin,clients.peer,clients.supervisor])assert.equal((await request(who,path+'/study')).data.completed,false);
      assert.equal((await request(clients.seller,'/api/reading')).data.reading,null);
      const list=(await request(clients.seller,'/api/contents')).data.items;assert.equal(list.find(i=>i.id===pdfId).study.completed,true);
      assert.equal(instance.ctx.db.prepare('SELECT count(*) n FROM academy_certificate').get().n,0);assert.equal(instance.ctx.db.prepare('SELECT count(*) n FROM academy_xp').get().n,0);
    });
    await t.test('sessão, publicação, trilha e origem protegem a gravação',async()=>{
      const body={version:study.version,completed:true};
      assert.equal((await request(null,path+'/study',{method:'POST',body})).status,401);
      for(const who of [clients.digital,clients.restricted])assert.equal((await request(who,path+'/study',{method:'POST',body})).status,404);
      assert.equal((await request(clients.seller,path+'/study',{method:'POST',body,headers:{Origin:'https://outra.example'}})).status,403);
      assert.equal((await request(clients.seller,path+'/study',{method:'POST',body:{version:study.version,completed:'true'}})).status,400);
      const draft=(await request(clients.admin,'/api/admin/contents',{method:'POST',body:{title:'Rascunho de estudo',kind:'text',body:'Conteúdo ainda em revisão.',tracks:['pap']}})).data;
      const key=(await request(clients.admin,'/api/contents/'+draft.id)).data.study.version;
      assert.equal((await request(clients.admin,'/api/contents/'+draft.id+'/study',{method:'POST',body:{version:key,completed:true}})).status,400);
    });
    await t.test('reabrir mantém conclusão e retomar desfaz apenas a declaração',async()=>{
      const old=(await request(clients.seller,path+'/study')).data.completedAt;
      const reopened=(await request(clients.seller,path+'/study/start',{method:'POST',body:{version:study.version}})).data;assert.equal(reopened.completedAt,old);
      await request(clients.seller,path+'/study',{method:'POST',body:{version:study.version,completed:false}});
      assert.equal((await request(clients.seller,'/api/reading')).data.reading.contentId,pdfId);
      await request(clients.seller,path+'/progress',{method:'POST',body:{page:2,pages:15}});
      assert.equal((await request(clients.seller,path+'/study')).data.percent,99);
      await request(clients.seller,path+'/study',{method:'POST',body:{version:study.version,completed:true}});
    });
    let text;
    await t.test('texto e links podem concluir; nova versão exige novo estudo, alteração de título preserva',async()=>{
      for(const kind of ['text','link']){
        const created=(await request(clients.admin,'/api/admin/contents',{method:'POST',body:{title:'Material '+kind,kind,body:kind==='text'?'Orientação inicial.':'',url:kind==='link'?'https://example.org/orientacao':'',tracks:['pap'],status:'published'}})).data;
        const url='/api/contents/'+created.id,version=(await request(clients.seller,url)).data.study.version;
        assert.equal((await request(clients.seller,url+'/study',{method:'POST',body:{version,completed:true}})).data.completed,true);
        const renamed=(await request(clients.admin,'/api/admin/contents/'+created.id,{method:'PATCH',body:{revision:created.revision,title:'Título revisado '+kind}})).data;
        assert.equal((await request(clients.seller,url+'/study')).data.completed,true);
        const changed=(await request(clients.admin,'/api/admin/contents/'+created.id,{method:'PATCH',body:{revision:renamed.revision,...(kind==='text'?{body:'Orientação atualizada.'}:{url:'https://example.org/nova-orientacao'})}})).data;
        assert.equal((await request(clients.seller,url+'/study')).data.completed,false);
        assert.equal((await request(clients.seller,url+'/study',{method:'POST',body:{version,completed:true}})).status,409);
        const current=(await request(clients.seller,url)).data.study;
        assert.equal((await request(clients.seller,url+'/study',{method:'POST',body:{version:current.version,completed:true}})).data.completed,true);
        text=changed;
      }
    });
    await t.test('conclusão persiste ao reiniciar e deixa de aparecer ao arquivar o material',async()=>{
      await new Promise(resolve=>server.close(resolve));instance.ctx.db.close();instance=await createApp({dataDir,baseURL,testMode:true,includeLearningFlows:false,googleConfig:{clientId:'',clientSecret:''}});server=await listen();
      assert.equal((await request(clients.seller,path+'/study')).data.completed,true);
      assert.equal((await request(clients.seller,'/api/contents/'+text.id+'/study')).data.completed,true);
      await request(clients.admin,'/api/admin/contents/'+text.id,{method:'PATCH',body:{revision:text.revision,status:'archived'}});
      assert.equal((await request(clients.seller,'/api/contents/'+text.id+'/study')).status,404);
      assert.equal((await request(clients.seller,'/api/contents')).data.items.some(i=>i.id===text.id),false);
      assert.equal(instance.ctx.db.prepare('SELECT count(*) n FROM academy_certificate').get().n,0);
    });
  }finally{await new Promise(resolve=>server.close(resolve));instance.ctx.db.close();await rm(dataDir,{recursive:true,force:true});}
});
