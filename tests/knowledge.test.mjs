// These fixtures isolate the existing grading/access/study contracts.
// Default curriculum and prerequisite enforcement are covered in learning-flows.test.mjs.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {randomBytes,createHash} from 'node:crypto';
import {createApp} from '../server.mjs';
import {knowledgeManifest,importKnowledgeLibrary} from '../lib/knowledge.mjs';

test('A Central de Conhecimento mantém PDFs originais, categorias e acesso privado dentro da Academy',async t=>{
  const dataDir=await mkdtemp(resolve(tmpdir(),'st1-knowledge-')),baseURL='http://localhost:4191';
  let instance=await createApp({dataDir,baseURL,testMode:true,includeLearningFlows:false}),server;
  const listen=()=>new Promise(resolve=>{const value=instance.app.listen(4191,'127.0.0.1',()=>resolve(value));});server=await listen();
  const clients={};
  const request=async(client,path,{method='GET',body}={})=>{const response=await fetch(baseURL+path,{method,headers:{Origin:baseURL,Connection:'close',...(client?.cookie?{Cookie:client.cookie}:{}),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});if(client&&response.headers.getSetCookie().length)client.cookie=response.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ');const bytes=Buffer.from(await response.arrayBuffer());let data;try{data=JSON.parse(bytes.toString());}catch{}return {status:response.status,data,bytes};};
  try{
  for(const [name,role,tracks,permissions] of [['admin','admin',['pap']],['pap','seller',['pap']],['digital','seller',['digital']],['super','supervisor',['pap']],['noMaterials','seller',['pap'],['assessments','conquests']]]){
    clients[name]={};const invite=instance.ctx.createInvitation({name:'Teste biblioteca '+name,email:name+'@knowledge.example',role,tracks,permissions}),token=new URL(invite.url).searchParams.get('convite');
    const response=await fetch(baseURL+'/api/auth/sign-up/email',{method:'POST',headers:{Origin:baseURL,'Content-Type':'application/json','x-academy-invite':token},body:JSON.stringify({name:'Teste',email:name+'@knowledge.example',password:randomBytes(24).toString('base64url')})});assert.equal(response.status,200,JSON.stringify(await response.clone().json()));clients[name].cookie=response.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ');
  }
    await t.test('os sete originais são publicados com índice, capa e categorias reais',async()=>{
      const result=await request(clients.admin,'/api/contents');assert.equal(result.data.items.length,7);assert.equal(result.data.items.filter(i=>i.category==='produtos').length,5);assert.equal(result.data.items.filter(i=>i.category==='processos').length,2);
      for(const original of knowledgeManifest){const detail=await request(clients.admin,'/api/contents/'+original.id);assert.equal(detail.data.asset.sha256,original.sha256);assert.deepEqual(detail.data.sections,original.sections);const pdf=await request(clients.admin,'/api/contents/'+original.id+'/file');assert.equal(createHash('sha256').update(pdf.bytes).digest('hex'),original.sha256);assert.equal((await request(clients.admin,'/api/contents/'+original.id+'/cover')).status,200);}
      assert.ok(result.data.items.some(i=>i.dahmas));
    });
    await t.test('arquivos e capas exigem sessão, material e trilha liberados',async()=>{
      const id='st1-catalogo-pap';for(const suffix of ['/file','/cover']){assert.equal((await request(null,'/api/contents/'+id+suffix)).status,401);assert.equal((await request(clients.digital,'/api/contents/'+id+suffix)).status,404);assert.equal((await request(clients.noMaterials,'/api/contents/'+id+suffix)).status,404);assert.equal((await request(clients.pap,'/api/contents/'+id+suffix)).status,200);assert.equal((await request(clients.super,'/api/contents/'+id+suffix)).status,200);}
      assert.equal((await request(clients.pap,'/api/contents')).data.items.length,2);assert.equal((await request(null,'/content/library/files/catalogo-pap.pdf')).status,404);
    });
    await t.test('livros, cursos e treinamentos aceitam cadastro interno com controle de categoria',async()=>{
      for(const category of ['livros','cursos','treinamentos']){const response=await request(clients.admin,'/api/admin/contents',{method:'POST',body:{title:'Material de teste '+category,category,kind:'text',body:'Conteúdo fictício somente neste teste isolado.',tracks:['pap'],status:'published'}});assert.equal(response.status,201);assert.equal(response.data.category,category);}
      assert.equal((await request(clients.admin,'/api/admin/contents',{method:'POST',body:{title:'Categoria inválida',category:'inexistente',kind:'text',tracks:['pap']}})).status,400);
      assert.equal((await request(clients.pap,'/api/admin/contents',{method:'POST',body:{title:'Sem autorização',category:'livros',kind:'text',tracks:['pap']}})).status,403);
    });
    await t.test('módulos têm nome e descrição configuráveis por Admin e seguem a visibilidade da conta',async()=>{
      const modules=(await request(clients.admin,'/api/admin/modules')).data.items;assert.equal(modules.length,5);assert.equal((await request(clients.pap,'/api/modules')).data.items.length,1);assert.equal((await request(clients.noMaterials,'/api/modules')).status,403);assert.equal((await request(clients.pap,'/api/admin/modules',{method:'POST',body:{title:'Não autorizado',tracks:['pap']}})).status,403);
      const module=modules.find(m=>m.id==='vendas-pap');assert.equal((await request(clients.admin,'/api/admin/modules/'+module.id,{method:'PATCH',body:{revision:module.revision,description:'Descrição personalizada pelo Admin.'}})).status,200);assert.equal((await request(clients.pap,'/api/modules')).data.items[0].description,'Descrição personalizada pelo Admin.');assert.equal((await request(clients.admin,'/api/admin/modules/'+module.id,{method:'PATCH',body:{revision:module.revision,title:'Edição antiga'}})).status,409);
      const custom=(await request(clients.admin,'/api/admin/modules',{method:'POST',body:{title:'Leitura | PAP',description:'Módulo fictício desta validação.',tracks:['pap'],audience:['seller']}})).data;const material=(await request(clients.admin,'/api/admin/contents/st1-catalogo-pap')).data;assert.equal((await request(clients.admin,'/api/admin/contents/'+material.id,{method:'PATCH',body:{revision:material.revision,modules:['vendas-pap',custom.id]}})).status,200);assert.ok((await request(clients.pap,'/api/contents/'+material.id)).data.modules.includes(custom.id));assert.equal((await request(clients.super,'/api/modules')).data.items.some(m=>m.id===custom.id),false);
    });
    await t.test('a retomada salva a página da própria conta e não concede aprovação por leitura',async()=>{
      const path='/api/contents/st1-catalogo-pap/progress';assert.equal((await request(null,'/api/reading')).status,401);assert.equal((await request(clients.noMaterials,'/api/reading')).status,403);assert.equal((await request(clients.digital,path,{method:'POST',body:{page:2,pages:15}})).status,404);assert.equal((await request(clients.pap,path,{method:'POST',body:{page:2,pages:14}})).status,400);assert.equal((await request(clients.pap,path,{method:'POST',body:{page:16,pages:15}})).status,400);
      assert.equal((await request(clients.pap,path,{method:'POST',body:{page:8,pages:15,userId:'outra-conta'}})).status,200);assert.equal((await request(clients.admin,'/api/reading')).data.reading,null);assert.equal((await request(clients.pap,'/api/reading')).data.reading.page,8);assert.equal((await request(clients.pap,path+'/dismiss',{method:'POST',body:{}})).status,200);assert.equal((await request(clients.pap,'/api/reading')).data.reading,null);await request(clients.pap,path,{method:'POST',body:{page:15,pages:15}});assert.equal((await request(clients.pap,'/api/reading')).data.reading.page,15);assert.equal(instance.ctx.db.prepare('SELECT count(*) n FROM academy_certificate').get().n,0);
    });
    await t.test('trocar um PDF por imagem invalida a retomada antiga e preserva a entrada da Academy',async()=>{
      const created=(await request(clients.admin,'/api/admin/contents',{method:'POST',body:{title:'Arquivo de teste substituível',kind:'file',tracks:['pap']}})).data;
      const upload=async(revision,name,bytes)=>{const response=await fetch(baseURL+'/api/admin/contents/'+created.id+'/file',{method:'POST',headers:{Origin:baseURL,Connection:'close',Cookie:clients.admin.cookie,'Content-Type':'application/octet-stream','x-file-name':encodeURIComponent(name),'x-content-revision':String(revision)},body:bytes});assert.equal(response.status,201);return response.json();};
      const pdf=(await request(clients.admin,'/api/contents/st1-catalogo-pap/file')).bytes;
      const uploaded=await upload(created.revision,'material.pdf',pdf);
      const published=(await request(clients.admin,'/api/admin/contents/'+created.id,{method:'PATCH',body:{revision:uploaded.revision,status:'published'}})).data;
      assert.equal((await request(clients.pap,'/api/contents/'+created.id+'/progress',{method:'POST',body:{page:2,pages:15}})).status,200);
      assert.equal((await request(clients.pap,'/api/reading')).data.reading.contentId,created.id);
      const cover=(await request(clients.admin,'/api/contents/st1-catalogo-pap/cover')).bytes;
      await upload(published.revision,'material.webp',cover);
      const reading=await request(clients.pap,'/api/reading');assert.equal(reading.status,200);assert.equal(reading.data.reading.contentId,'st1-catalogo-pap');
    });
    await t.test('reiniciar não duplica materiais, não desfaz edição nem republica conteúdo arquivado',async()=>{
      const id='st1-catalogo-pap',detail=(await request(clients.admin,'/api/admin/contents/'+id)).data;assert.equal((await request(clients.admin,'/api/admin/contents/'+id,{method:'PATCH',body:{revision:detail.revision,title:'Catálogo PAP revisado pelo Admin',status:'archived'}})).status,200);
      const before=instance.ctx.db.prepare('SELECT count(*) n FROM academy_content').get().n;assert.equal(importKnowledgeLibrary(instance.ctx.db,instance.ctx.db.prepare("SELECT user_id FROM academy_member WHERE role='admin'").get().user_id,instance.ctx.access.audit).created,0);
      await new Promise(resolve=>server.close(resolve));instance.ctx.db.close();instance=await createApp({dataDir,baseURL,testMode:true,includeLearningFlows:false});server=await listen();assert.equal(instance.ctx.db.prepare('SELECT count(*) n FROM academy_content').get().n,before);assert.equal((await request(clients.pap,'/api/contents/'+id+'/file')).status,404);assert.equal((await request(clients.admin,'/api/admin/contents/'+id)).data.title,'Catálogo PAP revisado pelo Admin');assert.equal((await request(clients.admin,'/api/admin/modules/vendas-pap')).data.description,'Descrição personalizada pelo Admin.');assert.equal((await request(clients.pap,'/api/reading')).data.reading,null);assert.equal(instance.ctx.db.prepare('SELECT count(*) n FROM academy_certificate').get().n,0);
    });
  }finally{await new Promise(resolve=>server.close(resolve));instance.ctx.db.close();await rm(dataDir,{recursive:true,force:true});}
});
