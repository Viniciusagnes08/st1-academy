// These fixtures isolate the existing grading/access/study contracts.
// Default curriculum and prerequisite enforcement are covered in learning-flows.test.mjs.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,sep,basename} from 'node:path';
import {randomBytes} from 'node:crypto';
import {createApp} from '../server.mjs';
import {completeOnboardingForTest} from './helpers/academy-fixtures.mjs';
test('Perfil pessoal usa progresso real, mantém privacidade e exige aprovação de squad',async t=>{
  const dataDir=await mkdtemp(resolve(tmpdir(),'st1-profile-')),baseURL='http://localhost:4193';let now=Date.now(),instance=await createApp({dataDir,baseURL,testMode:true,includeLearningFlows:false,clock:()=>now}),ctx=instance.ctx;
  const server=await new Promise(resolve=>{const value=instance.app.listen(4193,'127.0.0.1',()=>resolve(value));}),people={};
  const request=async(who,path,{method='GET',body,bytes,headers={}}={})=>{
    const response=await fetch(baseURL+path,{method,headers:{Origin:baseURL,Connection:'close',...(who?.cookie?{Cookie:who.cookie}:{}),...(body?{'Content-Type':'application/json'}:{}),...(bytes?{'Content-Type':'application/octet-stream'}:{}),...headers},...(body?{body:JSON.stringify(body)}:{}),...(bytes?{body:bytes}:{})});
    if(who&&response.headers.getSetCookie().length)who.cookie=response.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ');
    const output=Buffer.from(await response.arrayBuffer());let data;try{data=JSON.parse(output.toString());}catch{}return {status:response.status,data,bytes:output};
  };
  const signup=async(key,role)=>{
    const email=key+'@profile-qa.example',invitation=ctx.createInvitation({name:'QA '+key,email,role,tracks:['pap']});
    const r=await fetch(baseURL+'/api/auth/sign-up/email',{method:'POST',headers:{Origin:baseURL,'Content-Type':'application/json','x-academy-invite':new URL(invitation.url).searchParams.get('convite'),Connection:'close'},body:JSON.stringify({name:'QA',email,password:randomBytes(24).toString('base64url')})});assert.equal(r.status,200);const value=await r.json();people[key]={id:value.user.id,cookie:r.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ')};completeOnboardingForTest(ctx.db,people[key].id);
  };
  const profile=async who=>(await request(who,'/api/profile')).data;
  try{
    await signup('admin','admin');await signup('seller','seller');await signup('peer','seller');await signup('peer2','seller');await signup('leader','supervisor');await signup('otherLeader','supervisor');await signup('outsider','seller');
    await t.test('perfil básico começa sem dados inventados, é privado e não dá XP por visita',async()=>{
      assert.equal((await request(null,'/api/profile')).status,401);
      const p=await profile(people.seller);assert.equal(p.fields.biography,'');assert.equal(p.stats.xp,0);assert.equal(p.stats.study.totalDays,0);assert.equal(p.completion,0);assert.equal(p.catalog.filter(i=>i.unlocked).length,4);
      assert.equal((await request(people.outsider,'/api/profiles/'+people.seller.id)).status,404);
    });
    await t.test('cadastro pessoal não altera nome, e-mail, papel, XP ou certificados',async()=>{
      const value=await request(people.seller,'/api/profile',{method:'PATCH',body:{revision:0,phone:'(98) 99999-0000',city:'São Luís',hobbies:'Leitura e futebol',lifeGoal:'Evoluir com minha família.',biography:'Texto de QA <script>alert(1)</script>',dream:'Construir uma casa.',shareStory:false}});assert.equal(value.status,200);
      assert.equal(value.data.stats.xp,0);assert.equal(value.data.fields.phone,'(98) 99999-0000');assert.equal(value.data.fields.shareStory,true);
      assert.equal((await request(people.seller,'/api/profile',{method:'PATCH',body:{revision:value.data.revision,role:'admin',xp:999999}})).status,400);
      const me=(await request(people.seller,'/api/me')).data;assert.equal(me.name,'QA seller');assert.equal(me.role,'seller');assert.equal(me.email,'seller@profile-qa.example');assert.equal(me.certificates.length,0);
      assert.equal((await request(people.seller,'/api/profile',{method:'PATCH',body:{revision:0,biography:'Concorrência'}})).status,409);
      assert.equal((await request(people.seller,'/api/profile',{method:'PATCH',body:{revision:value.data.revision,phone:'123'}})).status,400);
    });
    let imageId,squad;
    await t.test('imagem é validada, pertence à conta e não tem link público',async()=>{
      const bytes=await readFile(new URL('../public/assets/starzinho/pose01-open.webp',import.meta.url)),p=await profile(people.seller);
      const response=await request(people.seller,'/api/profile/media/avatar',{method:'POST',bytes,headers:{'x-file-name':'qa.webp','x-profile-revision':String(p.revision)}});assert.equal(response.status,201);imageId=response.data.avatarUrl.split('/').pop();
      assert.equal((await request(people.seller,'/api/profile-media/'+imageId)).status,200);assert.equal((await request(null,'/api/profile-media/'+imageId)).status,401);assert.equal((await request(people.outsider,'/api/profile-media/'+imageId)).status,404);
      assert.equal((await request(people.seller,'/api/profile/media/avatar',{method:'POST',bytes:Buffer.from('<svg><script>alert(1)</script></svg>'),headers:{'x-file-name':'unsafe.svg','x-profile-revision':String(response.data.revision)}})).status,400);
      assert.equal((await profile(people.seller)).avatarUrl,response.data.avatarUrl);
    });
    await t.test('personalizações bloqueadas não podem ser liberadas pelo navegador',async()=>{
      const p=await profile(people.seller);
      assert.equal((await request(people.seller,'/api/profile/style',{method:'PATCH',body:{revision:p.revision,palette:'gold'}})).status,403);
      assert.equal((await request(people.seller,'/api/profile/style',{method:'PATCH',body:{revision:p.revision,level:6,palette:'gold'}})).status,400);
      const saved=await request(people.seller,'/api/profile/style',{method:'PATCH',body:{revision:p.revision,palette:'st1',effect:'signal',frame:'plain',title:'newcomer'}});assert.equal(saved.status,200);assert.equal(saved.data.stats.xp,0);
    });
    await t.test('pedido de squad não concede acesso até a aprovação e só o líder correto pode decidir',async()=>{
      squad=(await request(people.admin,'/api/admin/squads')).data.items.find(s=>s.id==='time-fenix');
      const saved=await request(people.admin,'/api/admin/squads/'+squad.id,{method:'PATCH',body:{...squad,supervisorId:people.leader.id,memberIds:[people.peer.id,people.peer2.id],revision:squad.revision}});assert.equal(saved.status,200);
      const asked=await request(people.seller,'/api/profile/squad-request',{method:'POST',body:{squadId:squad.id}});assert.equal(asked.status,201);assert.equal(asked.data.status,'pending');assert.equal((await request(people.seller,'/api/squads/'+squad.id)).status,404);
      const repeated=await request(people.seller,'/api/profile/squad-request',{method:'POST',body:{squadId:squad.id}});assert.equal(repeated.data.id,asked.data.id);
      assert.equal((await request(people.otherLeader,'/api/squad-requests')).data.items.length,0);
      assert.equal((await request(people.otherLeader,'/api/squad-requests/'+asked.data.id,{method:'PATCH',body:{status:'approved',revision:0}})).status,404);
      assert.equal((await request(people.leader,'/api/squad-requests/'+asked.data.id,{method:'PATCH',body:{status:'approved',revision:0}})).status,200);
      assert.equal((await request(people.seller,'/api/squads/'+squad.id)).status,200);
      assert.equal((await profile(people.seller)).squad.id,squad.id);
      assert.equal((await request(people.leader,'/api/squad-requests/'+asked.data.id,{method:'PATCH',body:{status:'approved',revision:0}})).status,409);
    });
    await t.test('colegas autorizados veem a história e o telefone fica com a gestão autorizada',async()=>{
      let p=(await request(people.peer,'/api/profiles/'+people.seller.id)).data;assert.equal(p.fields.phone,'');assert.match(p.fields.biography,/<script>/);assert.equal(p.storyVisible,true);
      assert.equal((await request(people.leader,'/api/profiles/'+people.seller.id)).data.fields.phone,'(98) 99999-0000');
      p=(await request(people.peer,'/api/profiles/'+people.seller.id)).data;assert.match(p.fields.biography,/<script>/);assert.equal(p.fields.phone,'');assert.equal((await request(people.peer,'/api/profile-media/'+imageId)).status,200);
    });
    await t.test('XP conquistado libera cor e destaque, com pelo menos três vendedores no squad',async()=>{
      const rules=(await request(people.admin,'/api/admin/game/rules')).data;await request(people.admin,'/api/admin/game/rules',{method:'PATCH',body:{...rules,checkpointPoints:100}});
      const opened=(await request(people.seller,'/api/quizzes/etapa-pap-0/start',{method:'POST',body:{}})).data,questions=JSON.parse(ctx.db.prepare('SELECT questions_private FROM academy_quiz_attempt WHERE id=?').get(opened.id).questions_private),answers=Object.fromEntries(questions.map(q=>[q.id,q.answer]));
      await request(people.seller,'/api/quiz-attempts/'+opened.id+'/finish',{method:'POST',body:{revision:opened.revision,answers}});
      const p=await profile(people.seller);assert.equal(p.stats.xp,100);assert.equal(p.stats.level.index,2);assert.equal(p.stats.ranking.participants,3);assert.equal(p.stats.steps,1);assert.equal(p.catalog.find(i=>i.id==='frame-podium').unlocked,true);assert.equal(p.catalog.find(i=>i.id==='frame-certified').unlocked,false);
      const changed=await request(people.seller,'/api/profile/style',{method:'PATCH',body:{revision:p.revision,palette:'ocean',effect:'circuit',frame:'podium',title:'highlight'}});assert.equal(changed.status,200);assert.equal(changed.data.style.palette,'ocean');assert.equal(changed.data.stats.xp,100);
    });
    await t.test('abrir conteúdo ou preencher perfil não conta como estudo, e o relógio do servidor limita a atividade',async()=>{
      const who=people.outsider;assert.equal((await profile(who)).stats.study.totalDays,0);
      const started=(await request(who,'/api/study',{method:'POST',body:{contentId:'st1-catalogo-pap'}})).data;
      const fast=await request(who,'/api/study/'+started.id+'/heartbeat',{method:'POST',body:{activeSeconds:99999,day:'2030-01-01'}});assert.equal(fast.data.counted,false);
      assert.equal((await request(people.peer,'/api/study/'+started.id+'/heartbeat',{method:'POST',body:{}})).status,404);
      for(let i=0;i<3;i++){now+=15000;await request(who,'/api/study/'+started.id+'/heartbeat',{method:'POST',body:{}});}
      const p=await profile(who);assert.equal(p.stats.study.totalDays,1);assert.equal(p.stats.study.streak,1);assert.equal(p.stats.xp,0);
      const newer=(await request(who,'/api/study',{method:'POST',body:{contentId:'st1-catalogo-pap'}})).data;assert.equal((await request(who,'/api/study/'+started.id+'/heartbeat',{method:'POST',body:{}})).status,404);
      now+=120000;assert.equal((await request(who,'/api/study/'+newer.id+'/heartbeat',{method:'POST',body:{}})).data.counted,false);
      assert.equal((await profile(who)).stats.study.totalDays,1);
    });
    await t.test('dias consecutivos têm recorde e reiniciam após uma pausa',async()=>{
      const studyDay=async()=>{const session=(await request(people.outsider,'/api/study',{method:'POST',body:{contentId:'st1-catalogo-pap'}})).data;for(let i=0;i<3;i++){now+=15000;await request(people.outsider,'/api/study/'+session.id+'/heartbeat',{method:'POST',body:{}});}};
      now+=86400000;await studyDay();let p=await profile(people.outsider);assert.equal(p.stats.study.streak,2);assert.equal(p.stats.study.bestStreak,2);
      now+=2*86400000;await studyDay();p=await profile(people.outsider);assert.equal(p.stats.study.streak,1);assert.equal(p.stats.study.bestStreak,2);assert.equal(p.stats.study.totalDays,3);
    });
    await t.test('Admin configura desbloqueios sem mudar XP e os itens iniciais permanecem livres',async()=>{
      const value=(await request(people.admin,'/api/admin/profile-rules')).data;
      assert.equal((await request(people.seller,'/api/admin/profile-rules',{method:'PATCH',body:value})).status,403);
      const bad=await request(people.admin,'/api/admin/profile-rules',{method:'PATCH',body:{...value,items:value.items.map(i=>i.id==='palette-st1'?{...i,minLevel:2}:i)}});assert.equal(bad.status,400);
      const edited=await request(people.admin,'/api/admin/profile-rules',{method:'PATCH',body:{...value,items:value.items.map(i=>i.id==='palette-ocean'?{...i,minLevel:3}:i)}});assert.equal(edited.status,200);
      const p=await profile(people.seller);assert.equal(p.stats.xp,100);assert.equal(p.style.palette,'st1');assert.equal(ctx.db.prepare('SELECT palette FROM academy_personal_profile WHERE user_id=?').get(people.seller.id).palette,'ocean');
      assert.equal((await request(people.admin,'/api/admin/profile-rules',{method:'PATCH',body:value})).status,409);
    });
    await t.test('uma transferência depende de Admin e ainda não dá acesso ao squad solicitado',async()=>{
      const target=(await request(people.admin,'/api/admin/squads')).data.items.find(s=>s.id==='power-team');
      await request(people.admin,'/api/admin/squads/'+target.id,{method:'PATCH',body:{...target,supervisorId:people.otherLeader.id,memberIds:[],revision:target.revision}});
      const asked=(await request(people.seller,'/api/profile/squad-request',{method:'POST',body:{squadId:target.id}})).data;
      assert.equal((await request(people.otherLeader,'/api/squad-requests/'+asked.id,{method:'PATCH',body:{status:'approved',revision:0}})).status,403);
      assert.equal((await request(people.seller,'/api/squads/'+target.id)).status,404);
      assert.equal((await request(people.admin,'/api/squad-requests/'+asked.id,{method:'PATCH',body:{status:'approved',revision:0}})).status,200);
      assert.equal((await request(people.peer,'/api/profile-media/'+imageId)).status,404);
      assert.equal((await profile(people.seller)).style.frame,'plain');
    });
    await t.test('remover foto oculta o arquivo anterior e preserva o histórico de imagem',async()=>{
      const p=await profile(people.seller),removed=await request(people.seller,'/api/profile/media/avatar',{method:'DELETE',body:{revision:p.revision}});assert.equal(removed.status,200);assert.equal(removed.data.avatarUrl,null);
      assert.equal((await request(people.seller,'/api/profile-media/'+imageId)).status,404);
      assert.ok(ctx.db.prepare('SELECT 1 FROM academy_profile_media WHERE id=?').get(imageId));
    });
    await t.test('informações e regras permanecem após reiniciar o contexto',async()=>{
      ctx.db.close();instance=await createApp({dataDir,baseURL,testMode:true,includeLearningFlows:false,clock:()=>now});ctx=instance.ctx;
      const person=ctx.db.prepare("SELECT u.name,m.* FROM academy_member m JOIN user u ON u.id=m.user_id WHERE user_id=?").get(people.seller.id);person.tracks=JSON.parse(person.tracks_json);person.permissions=JSON.parse(person.permissions_json);
      assert.equal(ctx.profiles.detail(person).fields.dream,'Construir uma casa.');assert.equal(ctx.profiles.rules().revision,1);assert.equal(ctx.profiles.detail(person).stats.xp,100);
    });
  }finally{await new Promise(resolve=>server.close(resolve));ctx.db.close();if(!resolve(dataDir).startsWith(resolve(tmpdir())+sep)||!basename(dataDir).startsWith('st1-profile-'))throw new Error('Diretório temporário inesperado.');await rm(dataDir,{recursive:true,force:true});}
});
