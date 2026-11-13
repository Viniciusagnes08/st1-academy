import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,sep,basename} from 'node:path';
import {randomBytes} from 'node:crypto';
import {createApp} from '../server.mjs';
import {readProfile} from '../lib/access.mjs';
import {layoutLearningFlow} from '../public/assets/learning-flow-map.js';
import {completeOnboardingForTest} from './helpers/academy-fixtures.mjs';

test('Percursos conectados liberam somente os ramos concluídos, por canal e função',async t=>{
  const dataDir=await mkdtemp(resolve(tmpdir(),'st1-flow-')),baseURL='http://localhost:4259';
  const {app,ctx}=await createApp({dataDir,baseURL,testMode:true,includeLibrary:false,googleConfig:{clientId:'',clientSecret:''}});
  const server=await new Promise(done=>{const s=app.listen(4259,'127.0.0.1',()=>done(s));});
  const request=async(who,url,{method='GET',body}={})=>{const r=await fetch(baseURL+url,{method,headers:{Origin:baseURL,Connection:'close',...(who?{Cookie:who.cookie}:{}),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,data:await r.json()};};
  const signup=async(key,role,tracks=['pap'],sellerIds=[])=>{const inv=ctx.createInvitation({name:'QA Percurso '+key,email:key+'@flow.example',role,tracks,sellerIds});const r=await fetch(baseURL+'/api/auth/sign-up/email',{method:'POST',headers:{Origin:baseURL,'Content-Type':'application/json','x-academy-invite':new URL(inv.url).searchParams.get('convite'),Connection:'close'},body:JSON.stringify({name:'QA',email:key+'@flow.example',password:randomBytes(24).toString('base64url')})});assert.equal(r.status,200);const u=await r.json(),person={id:u.user.id,cookie:r.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ')};completeOnboardingForTest(ctx.db,person.id);return person};
  try{
    const admin=await signup('admin','admin'),seller=await signup('seller','seller'),pme=await signup('pme','seller',['pme']),supervisor=await signup('supervisor','supervisor',['pap'],[seller.id]);
    const m=title=>ctx.contents.create(admin.id,{title,summary:'Material de verificação.',body:'Estudo publicado para testar a sequência.',kind:'text',category:'processos',tracks:['pap'],audience:['seller','supervisor'],status:'published'});
    const a=m('Estudo inicial'),b=m('Produto PAP'),c=m('Processo PAP'),d=m('Prática complementar');
    const definition={trackId:'pap',title:'Jornada de verificação PAP',description:'Conhecer, estudar, praticar e certificar.',audience:['seller','supervisor'],status:'published',nodes:[{id:'inicio',kind:'start',title:'Comece por aqui'},{id:'a',kind:'material',title:'Estudo inicial',targetId:a.id},{id:'b',kind:'material',title:'Produto PAP',targetId:b.id},{id:'c',kind:'material',title:'Processo PAP',targetId:c.id},{id:'quiz',kind:'quiz',title:'Pratique os planos',targetId:'etapa-pap-0'},{id:'cert',kind:'certificate',title:'Certificação PAP',targetId:'pap'}],edges:[{from:'inicio',to:'a'},{from:'a',to:'b'},{from:'a',to:'c'},{from:'b',to:'quiz'},{from:'c',to:'quiz'},{from:'quiz',to:'cert'}]};
    const saved=ctx.learningFlows.save(readProfile(ctx.db,admin.id),null,definition),url='/api/learning-flows/'+saved.id;
    const map=async()=>{const r=await request(seller,url);assert.equal(r.status,200);return r.data;};
    const complete=async id=>{const detail=await request(seller,'/api/contents/'+id);assert.equal(detail.status,200);const r=await request(seller,'/api/contents/'+id+'/study',{method:'POST',body:{version:detail.data.study.version,completed:true}});assert.equal(r.status,200);};
    await t.test('autenticação, canal e supervisão delimitam o percurso',async()=>{
      assert.equal((await request(null,url)).status,401);assert.equal((await request(pme,url)).status,404);
      assert.equal((await request(supervisor,url+'?userId='+seller.id)).status,200);assert.equal((await request(supervisor,url+'?userId='+pme.id)).status,404);
      assert.equal((await request(seller,'/api/admin/learning-flows')).status,403);assert.equal((await request(seller,'/api/admin/learning-flows',{method:'POST',body:definition})).status,403);
    });
    await t.test('o mapa inteiro aparece; URL, download, conclusão e prova não pulam pré-requisitos',async()=>{
      const f=await map();assert.equal(f.schemaVersion,3);assert.equal(f.nodes.length,6);assert.equal(f.edges.length,6);assert.equal(f.nextNodeId,'a');assert.equal(f.nodes.find(n=>n.id==='quiz').locked,true);
      assert.equal((await request(seller,'/api/contents/'+b.id)).status,423);assert.equal((await request(seller,'/api/contents/'+b.id+'/file')).status,423);
      assert.equal((await request(seller,'/api/contents/'+b.id+'/study',{method:'POST',body:{version:'qualquer',completed:true}})).status,423);
      assert.equal((await request(seller,'/api/study',{method:'POST',body:{contentId:b.id}})).status,423);
      assert.equal((await request(seller,'/api/quizzes/etapa-pap-0/start',{method:'POST',body:{}})).status,423);
      assert.equal((await request(seller,'/api/attempts',{method:'POST',body:{trackId:'pap'}})).status,423);
      const library=await request(seller,'/api/contents');assert.equal(library.data.items.find(i=>i.id===b.id).flow.locked,true);
    });
    await t.test('concluir o pai libera os ramos; a junção exige os dois ramos',async()=>{
      await complete(a.id);let f=await map();assert.equal(f.nodes.find(n=>n.id==='b').status,'available');assert.equal(f.nodes.find(n=>n.id==='c').status,'available');
      await complete(b.id);f=await map();assert.equal(f.nodes.find(n=>n.id==='quiz').locked,true);assert.deepEqual(f.nodes.find(n=>n.id==='quiz').prerequisites.map(n=>n.id),['c']);
      await complete(c.id);f=await map();assert.equal(f.nodes.find(n=>n.id==='quiz').locked,false);assert.equal(f.nodes.find(n=>n.id==='cert').locked,true);
      assert.equal(ctx.db.prepare('SELECT COUNT(*) n FROM academy_xp WHERE user_id=?').get(seller.id).n,0);
      const start=await request(seller,'/api/quizzes/etapa-pap-0/start',{method:'POST',body:{}});assert.equal(start.status,201);
      const privateQuestions=JSON.parse(ctx.db.prepare('SELECT questions_private FROM academy_quiz_attempt WHERE id=?').get(start.data.id).questions_private),answers=Object.fromEntries(privateQuestions.map(q=>[q.id,q.answer]));
      const finish=await request(seller,'/api/quiz-attempts/'+start.data.id+'/finish',{method:'POST',body:{revision:start.data.revision,answers}});assert.equal(finish.status,200);assert.equal(finish.data.result.approved,true);
      f=await map();assert.equal(f.nodes.find(n=>n.id==='cert').locked,false);
    });
    await t.test('alternativa explícita pode aceitar um ramo; ciclo e canal incompatível são rejeitados',async()=>{
      const alternate=ctx.learningFlows.save(readProfile(ctx.db,admin.id),null,{...definition,title:'Prática alternativa PAP',nodes:definition.nodes.slice(0,4).concat({id:'d',kind:'material',title:'Prática complementar',targetId:d.id,requirement:'any'}),edges:definition.edges.slice(0,3).concat([{from:'b',to:'d'},{from:'c',to:'d'}])});
      assert.equal(ctx.learningFlows.get(readProfile(ctx.db,seller.id),alternate.id).nodes.find(n=>n.id==='d').locked,false);
      assert.throws(()=>ctx.learningFlows.save(readProfile(ctx.db,admin.id),null,{...definition,edges:definition.edges.concat({from:'cert',to:'a'})}),/ciclo/);
      assert.throws(()=>ctx.learningFlows.save(readProfile(ctx.db,admin.id),null,{...definition,trackId:'pme'}),/canal/);
    });
    await t.test('versão atual e publicação preservam evidência sem fabricar avanços',async()=>{
      const before=ctx.contents.detail(readProfile(ctx.db,admin.id),a.id);ctx.contents.update(admin.id,a.id,{...before,revision:before.revision,body:'Nova versão do procedimento.'});
      const f=await map();assert.equal(f.nodes.find(n=>n.id==='a').status,'available');assert.equal(f.nodes.find(n=>n.id==='b').locked,true);assert.equal(f.nodes.find(n=>n.id==='quiz').locked,true);
      const archive=await request(admin,'/api/admin/learning-flows/'+saved.id,{method:'DELETE',body:{revision:saved.revision}});assert.equal(archive.status,200);assert.equal((await request(seller,url)).status,404);
      const restore=await request(admin,'/api/admin/learning-flows/'+saved.id,{method:'PATCH',body:{...archive.data,status:'published'}});assert.equal(restore.status,200);
      assert.equal(ctx.db.prepare('SELECT COUNT(*) n FROM academy_material_study WHERE user_id=?').get(seller.id).n,3);
    });
    await t.test('Supervisor possui seu percurso próprio; recursos privados não vazam',async()=>{
      const sup=ctx.learningFlows.save(readProfile(ctx.db,admin.id),null,{trackId:'supervisor',title:'Jornada Supervisor',audience:['supervisor'],status:'published',nodes:[{id:'inicio',kind:'start',title:'Sua supervisão'},{id:'estudo',kind:'material',title:'Rotina de supervisão',targetId:a.id}],edges:[{from:'inicio',to:'estudo'}]});
      assert.equal((await request(seller,'/api/learning-flows/'+sup.id)).status,404);assert.equal((await request(supervisor,'/api/learning-flows/'+sup.id)).status,200);
      const secret=ctx.contents.create(admin.id,{title:'SEGREDO INTERNO',summary:'Corpo reservado',body:'CORPO_PRIVADO',kind:'text',category:'processos',tracks:['pap'],audience:[],status:'published'});
      const privateFlow=ctx.learningFlows.save(readProfile(ctx.db,admin.id),null,{...definition,title:'Futuro percurso PAP',nodes:[{id:'inicio',kind:'start',title:'Comece'},{id:'espera',kind:'material',title:'Etapa em preparação',targetId:secret.id}],edges:[{from:'inicio',to:'espera'}]});
      const value=await request(seller,'/api/learning-flows/'+privateFlow.id);assert.equal(value.data.nodes[1].targetId,null);assert.equal(value.data.nodes[1].resourceAvailable,false);assert(!JSON.stringify(value.data).includes('SEGREDO INTERNO'));assert(!JSON.stringify(value.data).includes('CORPO_PRIVADO'));
      const onlySellers=ctx.contents.create(admin.id,{title:'Material exclusivo de vendedores',body:'CORPO_EXCLUSIVO',kind:'text',category:'processos',tracks:['pap'],audience:['seller'],status:'published'});
      const sellerFlow=ctx.learningFlows.save(readProfile(ctx.db,admin.id),null,{trackId:'pap',title:'Percurso só de vendedores',audience:['seller'],status:'published',nodes:[{id:'inicio',kind:'start',title:'Ponto de partida'},{id:'estudo',kind:'material',title:'Estudo do vendedor',targetId:onlySellers.id}],edges:[{from:'inicio',to:'estudo'}]});
      const observed=await request(supervisor,'/api/learning-flows/'+sellerFlow.id+'?userId='+seller.id);assert.equal(observed.status,200);assert.equal(observed.data.nodes[1].resourceAvailable,true);assert.equal(observed.data.nodes[1].href,null);assert.equal((await request(supervisor,'/api/contents/'+onlySellers.id)).status,404);assert(!JSON.stringify(observed.data).includes('CORPO_EXCLUSIVO'));
    });
    await t.test('a disposição preserva direção, ramificação e caixas sem sobreposição',()=>{
      const layout=layoutLearningFlow(saved.nodes,saved.edges);const p=layout.positions;assert(p.get('b').x>p.get('a').x);assert(p.get('c').x===p.get('b').x);assert(p.get('b').y+p.get('b').height<p.get('c').y);assert(p.get('quiz').x>p.get('b').x);
      const largeNodes=Array.from({length:200},(_,i)=>({id:'n'+i})),largeEdges=largeNodes.slice(1).map((n,i)=>({from:'n'+i,to:n.id}));assert.equal(layoutLearningFlow(largeNodes,largeEdges).positions.size,200);
    });
    await t.test('os seis percursos iniciais são idempotentes e cada canal usa seus próprios materiais',()=>{
      for(const track of ctx.bank.tracks)for(const file of track.materials){const id='st1-'+file.replace(/\.pdf$/,'');if(ctx.db.prepare('SELECT 1 FROM academy_content WHERE id=?').get(id))continue;const tracks=ctx.bank.tracks.filter(t=>t.materials.includes(file)).map(t=>t.id);const created=ctx.contents.create(admin.id,{title:'Material '+file,summary:'Fonte do currículo.',kind:'text',body:'Conteúdo original de verificação.',category:'produtos',tracks,audience:['seller','supervisor'],status:'published'});ctx.db.prepare('UPDATE academy_content SET id=? WHERE id=?').run(id,created.id);}
      const before=ctx.db.prepare('SELECT COUNT(*) n FROM academy_material_study').get().n;ctx.learningFlows.seed(admin.id);const count=ctx.db.prepare('SELECT COUNT(*) n FROM academy_learning_flow').get().n;ctx.learningFlows.seed(admin.id);assert.equal(ctx.db.prepare('SELECT COUNT(*) n FROM academy_learning_flow').get().n,count);assert.equal(ctx.db.prepare('SELECT COUNT(*) n FROM academy_material_study').get().n,before);
      const canon=ctx.learningFlows.adminList(readProfile(ctx.db,admin.id)).filter(f=>f.id.startsWith('percurso-'));assert.equal(canon.length,ctx.bank.tracks.filter(track=>!track.trainingOnly).length+1);const pap=canon.find(f=>f.trackId==='pap');assert.deepEqual(pap.nodes.filter(n=>n.kind==='material').map(n=>n.targetId),['st1-catalogo-pap','st1-processo-pap']);assert.deepEqual(pap.edges.filter(e=>e.to==='pratica-0').map(e=>e.from),['estudo-0']);assert.deepEqual(pap.edges.filter(e=>e.to==='pratica-2').map(e=>e.from),['estudo-1']);assert.equal(canon.find(f=>f.trackId==='indoor').nodes.filter(n=>n.kind==='material').length,1);assert(canon.find(f=>f.trackId==='supervisor').audience.every(a=>a==='supervisor'));assert.equal(canon.find(f=>f.trackId==='bi').nodes.filter(n=>n.kind==='material').length,16);
    });
  }finally{await new Promise(done=>server.close(done));ctx.db.close();if(!resolve(dataDir).startsWith(resolve(tmpdir())+sep)||!basename(dataDir).startsWith('st1-flow-'))throw new Error('Pasta inesperada.');await rm(dataDir,{recursive:true,force:true});}
});
