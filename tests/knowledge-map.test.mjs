import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,sep,basename} from 'node:path';
import {randomBytes} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {createApp} from '../server.mjs';
import {readProfile} from '../lib/access.mjs';
import {materialVersion} from '../lib/readings.mjs';
import {gradePractice} from '../lib/quizzes.mjs';
import {completeOnboardingForTest} from './helpers/academy-fixtures.mjs';

test('Mapa expansível projeta conteúdo e evidência, com paginação e escopo privado',async t=>{
  const dataDir=await mkdtemp(resolve(tmpdir(),'st1-map-')),baseURL='http://localhost:4256';
  const fixedTime=Date.now();
  const {app,ctx}=await createApp({dataDir,baseURL,testMode:true,includeLibrary:false,clock:()=>fixedTime,googleConfig:{clientId:'',clientSecret:''}});
  const server=await new Promise(done=>{const s=app.listen(4256,'127.0.0.1',()=>done(s));});
  const request=async(who,url,{method='GET',body}={})=>{
    const r=await fetch(baseURL+url,{method,headers:{Origin:baseURL,Connection:'close',...(who?{Cookie:who.cookie}:{}),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
    const text=await r.text();let data;try{data=JSON.parse(text);}catch{}return {status:r.status,data,text};
  };
  const signup=async(key,role,permissions,sellerIds=[])=>{
    const invite=ctx.createInvitation({name:'QA Mapa '+key,email:key+'@map.example',role,tracks:['pap'],permissions,sellerIds});
    const r=await fetch(baseURL+'/api/auth/sign-up/email',{method:'POST',headers:{Origin:baseURL,'Content-Type':'application/json','x-academy-invite':new URL(invite.url).searchParams.get('convite'),Connection:'close'},body:JSON.stringify({name:'QA',email:key+'@map.example',password:randomBytes(24).toString('base64url')})});
    assert.equal(r.status,200);const u=await r.json(),person={id:u.user.id,cookie:r.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ')};completeOnboardingForTest(ctx.db,person.id);return person;
  };
  try{
    const admin=await signup('admin','admin'),seller=await signup('seller','seller'),reader=await signup('reader','seller',['materials']),outsider=await signup('outsider','seller'),supervisor=await signup('supervisor','supervisor',undefined,[seller.id]);
    const module=ctx.modules.create(admin.id,{title:'Gestão e processos',description:'Rotinas da equipe.',tracks:['pap']});
    const privateModule=ctx.modules.create(admin.id,{title:'Curadoria privada',description:'Somente Admins.',tracks:['pap'],audience:[]});
    const material=(title,modules,audience=['seller','supervisor'])=>ctx.contents.create(admin.id,{title,summary:'Estudo publicado de QA.',body:'Corpo integral reservado ao leitor.',kind:'text',category:'processos',tracks:title==='Pesquisa de Mercado'?['pap','digital']:['pap'],modules,audience,status:'published'});
    const first=material('POP de Gestão',[module.id]),second=material('Pesquisa de Mercado',[module.id]),secret=material('Segredo de curadoria',[module.id],[]),orphan=material('Conteúdo ainda sem módulo',[]);
    await t.test('a API exige sessão e separa o mapa pessoal do acompanhamento autorizado',async()=>{
      assert.equal((await request(null,'/api/knowledge-map')).status,401);
      assert.equal((await request(seller,'/api/knowledge-map?userId='+outsider.id)).status,404);
      assert.equal((await request(supervisor,'/api/knowledge-map?userId='+seller.id)).status,200);
      assert.equal((await request(supervisor,'/api/knowledge-map?userId='+outsider.id)).status,404);
      assert.equal((await request(reader,'/api/knowledge-map')).status,200);
      assert.equal((await request(reader,'/api/knowledge-map')).data.scope.assessments,false);
    });
    await t.test('módulos e publicações entram automaticamente sem copiar o grafo nem revelar curadoria',async()=>{
      const r=await request(seller,'/api/knowledge-map');assert.equal(r.data.schemaVersion,2);assert.equal(r.data.summary.total,3);
      assert(r.data.items.some(n=>n.id===module.id&&n.total===2));assert(r.data.items.some(n=>n.id==='~unassigned'));
      assert(!r.text.includes('Segredo de curadoria'));assert(!r.text.includes('Curadoria privada'));assert(!r.text.includes('Corpo integral reservado'));
      const page=await request(seller,'/api/knowledge-map/module/'+module.id);assert.equal(page.data.total,2);assert(page.data.items.every(n=>n.status==='not_started'));
      assert.deepEqual(page.data.items.find(n=>n.id===second.id).tracks,['pap']);
      assert.equal((await request(seller,'/api/knowledge-map/module/'+privateModule.id)).status,404);
      const target=await request(admin,'/api/knowledge-map/module/'+module.id+'?userId='+seller.id);assert.equal(target.data.total,2);assert(!target.text.includes(secret.title));
      const empty=await request(admin,'/api/knowledge-map?status=empty');assert(empty.data.items.some(n=>n.id===privateModule.id&&n.status==='empty'));
    });
    await t.test('conclusão se aplica à versão atual e não fabrica nota, XP ou certificado',async()=>{
      ctx.readings.complete(readProfile(ctx.db,seller.id),first.id,{version:materialVersion(first),completed:true});
      assert.equal((await request(seller,'/api/knowledge-map')).data.summary.studied,1);
      assert.equal((await request(admin,'/api/knowledge-map')).data.summary.studied,0);
      const updated=ctx.contents.update(admin.id,first.id,{revision:first.revision,title:'POP de Gestão revisado'});
      assert.equal((await request(seller,'/api/knowledge-map')).data.summary.studied,1);
      ctx.contents.update(admin.id,first.id,{revision:updated.revision,body:'Nova versão do procedimento.'});
      assert.equal((await request(seller,'/api/knowledge-map')).data.summary.studied,0);
      assert.equal(ctx.db.prepare('SELECT count(*) n FROM academy_certificate').get().n,0);
      assert.equal(ctx.game.me(readProfile(ctx.db,seller.id)).xp,0);
    });
    await t.test('busca ignora acentos e os filtros não alteram as permissões de um ramo',async()=>{
      const found=await request(seller,'/api/knowledge-map?q=gestao');assert(found.data.items.some(n=>n.id===module.id));
      const nested=await request(seller,'/api/knowledge-map/module/'+module.id+'?q=mercado');assert.equal(nested.data.total,1);assert.equal(nested.data.items[0].id,second.id);
      assert.equal((await request(seller,'/api/knowledge-map/module/'+module.id+'?track=digital')).data.total,0);
      for(const query of ['limit=1000','cursor=-1','status=inventado','q=a&q=b'])assert.equal((await request(seller,'/api/knowledge-map?'+query)).status,400);
      assert.equal((await request(seller,'/api/knowledge-map/assessment/digital')).status,404);
    });
    const plans=ctx.bank.tracks.find(v=>v.id==='pap').questions.filter(q=>q.topic==='Planos');
    const newQuiz=ids=>ctx.game.quizzes.save(admin.id,null,{title:'Prática do mapa QA',description:'Perguntas em ambiente isolado.',tracks:['pap'],audience:['seller'],status:'published',durationSeconds:60,questionIds:ids});
    const answer=async(quiz,wrongId)=>{
      const opened=(await request(seller,'/api/quizzes/'+quiz.id+'/start',{method:'POST',body:{}})).data;
      const questions=JSON.parse(ctx.db.prepare('SELECT questions_private FROM academy_quiz_attempt WHERE id=?').get(opened.id).questions_private);
      const answers=Object.fromEntries(questions.map(q=>[q.id,q.id===wrongId?q.options.find(o=>o.id!==q.answer).id:q.answer]));
      const r=await request(seller,'/api/quiz-attempts/'+opened.id+'/finish',{method:'POST',body:{revision:opened.revision,answers}});assert.equal(r.status,200);return r.data;
    };
    await t.test('um subconjunto correto permanece parcial e as evidências se acumulam por pergunta',async()=>{
      const one=newQuiz(plans.slice(0,2).map(q=>q.id));await answer(one);
      let topics=(await request(seller,'/api/knowledge-map/assessment/pap')).data.items,n=topics.find(n=>n.title==='Planos');
      assert.equal(n.status,'partial');assert.equal(n.coverage.answered,2);assert.equal(n.coverage.total,plans.length);
      const two=newQuiz(plans.slice(2).map(q=>q.id));await answer(two);
      n=(await request(seller,'/api/knowledge-map/assessment/pap')).data.items.find(n=>n.title==='Planos');
      assert.equal(n.status,'validated');assert.equal(n.coverage.complete,true);assert.equal(n.evidenceCount,2);
      assert(!topics.some(n=>n.kind==='material'));
    });
    await t.test('erro crítico recente pede reforço e uma avaliação de versão anterior não valida a nova',async()=>{
      const critical=plans.find(q=>q.critical),quiz=newQuiz([critical.id,plans.find(q=>!q.critical).id]);await answer(quiz,critical.id);
      let n=(await request(seller,'/api/knowledge-map/assessment/pap')).data.items.find(n=>n.title==='Regras críticas');assert.equal(n.status,'reinforce');
      const current=ctx.game.quizzes.adminDetail(quiz.id);
      ctx.game.quizzes.save(admin.id,quiz.id,{...current,revision:current.revision,questionIds:plans.filter(q=>q.id!==critical.id).slice(0,2).map(q=>q.id)});
      n=(await request(seller,'/api/knowledge-map/assessment/pap')).data.items.find(n=>n.title==='Regras críticas');
      assert.notEqual(n.status,'reinforce');
    });
    await t.test('arquivar ou excluir um material o retira do mapa sem refazer o cadastro',async()=>{
      ctx.contents.update(admin.id,second.id,{revision:second.revision,status:'archived'});
      ctx.db.prepare('UPDATE academy_content SET deleted_at=? WHERE id=?').run(new Date().toISOString(),orphan.id);
      assert.equal((await request(seller,'/api/knowledge-map')).data.summary.total,1);
      assert.equal((await request(seller,'/api/knowledge-map/module/'+module.id)).data.total,1);
    });
    await t.test('500 módulos, 2.000 materiais e 1.000 temas avaliados mantêm o mapa paginado',async()=>{
      const now=new Date().toISOString(),m=ctx.db.prepare('INSERT INTO academy_module(id,title,description,tracks_json,audience_json,status,created_by,updated_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)');
      const c=ctx.db.prepare('INSERT INTO academy_content(id,title,summary,kind,body,tracks_json,audience_json,status,modules_json,category,created_by,updated_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
      const q=ctx.db.prepare('INSERT INTO academy_quiz(id,title,description,type,status,tracks_json,audience_json,duration_seconds,questions_private,topic,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)');
      const a=ctx.db.prepare('INSERT INTO academy_quiz_attempt(id,user_id,quiz_id,version,title,type,tracks_json,questions_private,status,started_at,finished_at,result_json) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)');
      ctx.db.exec('BEGIN IMMEDIATE');
      try{
        for(let i=0;i<500;i++){const id='escala-'+String(i).padStart(4,'0');m.run(id,'Escala '+String(i).padStart(4,'0'),'Módulo sintético de carga.','["pap"]','["seller","supervisor"]','published',admin.id,admin.id,now,now);for(let j=0;j<4;j++)c.run(id+'-'+j,'Material '+i+' / '+j,'Descrição sintética.','text','CORPO_NAO_DEVE_IR_PARA_O_MAPA','["pap"]','["seller","supervisor"]','published',JSON.stringify([id]),'processos',admin.id,admin.id,now,now);}
        for(let i=0;i<1000;i++){
          const id='carga-avaliacao-'+i,question={id:'carga-pergunta-'+i,stem:'Pergunta sintética de carga '+i,topic:'Conhecimento de carga '+String(i).padStart(4,'0'),critical:false,explanation:'Somente no ensaio isolado.',answer:'a',options:[{id:'a',text:'Resposta esperada'},{id:'b',text:'Alternativa B'},{id:'c',text:'Alternativa C'},{id:'d',text:'Alternativa D'}]},questions=JSON.stringify([question]),result=JSON.stringify(gradePractice([question],{[question.id]:'a'}));
          q.run(id,'Avaliação de carga '+i,'Somente no ensaio isolado.','flash','published','["pap"]','["seller","supervisor"]',60,questions,question.topic,now,now);
          a.run('carga-tentativa-'+i,seller.id,id,1,'Avaliação de carga '+i,'flash','["pap"]',questions,'complete',now,now,result);
        }
        ctx.db.exec('COMMIT');
      }catch(e){ctx.db.exec('ROLLBACK');throw e;}
      const begin=performance.now(),one=await request(seller,'/api/knowledge-map?q=escala&limit=24'),ms=performance.now()-begin;
      assert.equal(one.status,200);assert.equal(one.data.total,500);assert.equal(one.data.items.length,24);assert.equal(one.data.nextCursor,'24');assert(one.data.summary.topics>=1000);
      assert(one.text.length<40000);assert(!one.text.includes('CORPO_NAO_DEVE'));
      const two=await request(seller,'/api/knowledge-map?q=escala&limit=24&cursor='+one.data.nextCursor);assert(two.data.items.every(n=>!one.data.items.some(p=>p.id===n.id)));
      const leaf=await request(seller,'/api/knowledge-map/module/escala-0001?limit=2');assert.equal(leaf.data.total,4);assert.equal(leaf.data.items.length,2);assert.equal(leaf.data.nextCursor,'2');
      const topics=await request(seller,'/api/knowledge-map/assessment/pap?limit=24');assert(topics.data.total>=1000);assert.equal(topics.data.items.length,24);
      console.log(JSON.stringify({knowledgeMapLoad:{modules:500,materials:2000,evaluatedTopics:1000,firstPage:24,responseChars:one.text.length,milliseconds:Math.round(ms)}}));
      assert(ms<5000,'A página do mapa deve permanecer utilizável no ensaio de carga.');
    });
  }finally{
    await new Promise(done=>server.close(done));ctx.db.close();
    if(!resolve(dataDir).startsWith(resolve(tmpdir())+sep)||!basename(dataDir).startsWith('st1-map-'))throw new Error('Pasta de teste inesperada.');
    await rm(dataDir,{recursive:true,force:true});
  }
});
