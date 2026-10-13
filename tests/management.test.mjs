import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,sep,basename} from 'node:path';
import {randomBytes,createHash} from 'node:crypto';
import {PDFDocument} from 'pdf-lib';
import {createApp} from '../server.mjs';
import {readProfile} from '../lib/access.mjs';
import {createManagementService} from '../lib/management.mjs';
import {recognitionPdf} from '../lib/recognition-artifacts.mjs';

test('CRUDs da Academy preservam histórico e emitem reconhecimentos com evidência',async t=>{
  const dataDir=await mkdtemp(resolve(tmpdir(),'st1-crud-')),baseURL='http://localhost:4195',people={};
  let now=Date.now();const {app,ctx}=await createApp({dataDir,baseURL,testMode:true,includeLibrary:false,clock:()=>now});
  const server=await new Promise(resolve=>{const s=app.listen(4195,'127.0.0.1',()=>resolve(s));});
  const req=async(who,path,{method='GET',body,headers={}}={})=>{const r=await fetch(baseURL+path,{method,headers:{Origin:baseURL,Connection:'close',...(who?.cookie?{Cookie:who.cookie}:{}),...(body?{'Content-Type':'application/json'}:{}),...headers},...(body?{body:JSON.stringify(body)}:{})});const bytes=Buffer.from(await r.arrayBuffer());let data;try{data=JSON.parse(bytes);}catch{}return {status:r.status,data,bytes,headers:r.headers};};
  const enroll=async(key,role)=>{const email=key+'@crud.example',invite=ctx.createInvitation({name:'QA '+key,email,role,tracks:['pap']}),r=await req(null,'/api/auth/sign-up/email',{method:'POST',headers:{'x-academy-invite':new URL(invite.url).searchParams.get('convite')},body:{name:'Untrusted name',email,password:randomBytes(24).toString('base64url')}});assert.equal(r.status,200);people[key]={id:r.data.user.id,cookie:r.headers.getSetCookie().map(v=>v.split(';')[0]).join('; ')};};
  const path=(e,id)=>'/api/admin/manage/'+e+(id?'/'+id:'');
  const create=async(e,body)=>{const r=await req(people.admin,path(e),{method:'POST',body});assert.equal(r.status,201,JSON.stringify(r.data));return r.data;};
  const get=async(e,id)=>(await req(people.admin,path(e,id))).data;
  const setAccess=(key,patch)=>{const member=readProfile(ctx.db,people[key].id),relations=ctx.access.publicProfile(member);return ctx.access.updateMember(people.admin.id,member.user_id,{role:member.role,tracks:member.tracks,permissions:member.permissions,enabled:member.enabled===1,supervisorIds:relations.supervisorIds,sellerIds:relations.sellerIds,...patch});};
  let badge,model,squad,event,content,tag,award;
  try{
    await enroll('admin','admin');await enroll('seller','seller');await enroll('supervisor','supervisor');await enroll('outsider','seller');
    await t.test('todos os cadastros exigem Admin e as mutações exigem origem',async()=>{
      for(const e of ['events','contents','certificates','badges','squads','tags']){assert.equal((await req(null,path(e))).status,401);assert.equal((await req(people.seller,path(e))).status,403);assert.equal((await req(people.supervisor,path(e),{method:'POST',body:{title:'Denied'}})).status,403);}
      assert.equal((await req(people.admin,path('tags'),{method:'POST',body:{title:'Negado'},headers:{Origin:'https://external.example'}})).status,403);
    });
    await t.test('cria os seis tipos e consulta os campos salvos',async()=>{
      tag=await create('tags',{title:'Abordagem PAP',description:'Aulas de abordagem',color:'#f77716',status:'active'});
      badge=await create('badges',{title:'Comunicação em evolução',description:'Aplicação conferida pelo gestor.',color:'#149574',shape:'hexagon',symbol:'book',status:'active',tagIds:[tag.id]});
      content=await create('contents',{title:'Material privado PAP',kind:'file',category:'processos',summary:'Um exemplo de material.',tracks:['pap'],audience:['seller'],status:'draft',tagIds:[tag.id]});
      const uploaded=ctx.contents.upload(people.admin.id,content.id,content.revision,'Arquivo-QA.pdf',Buffer.from('%PDF-1.7\nIsolated fixture'));content=await get('contents',uploaded.id);
      squad=await create('squads',{name:'Squad QA',description:'Equipe fictícia para teste.',supervisorId:people.supervisor.id,memberIds:[people.seller.id],status:'active',tagIds:[tag.id]});
      const iso=x=>new Date(now+x).toISOString();event=await create('events',{title:'Aplicação prática PAP',kind:'task',description:'Atividade fictícia de teste.',prompt:'Como você aplicou?',startAt:iso(-3600000),endAt:iso(3600000),dueAt:iso(3600000),audience:{scope:'people',ids:[people.seller.id]},tagIds:[tag.id]});
      model=await create('certificates',{title:'Prática de abordagem PAP',description:'Reconhecimento pela aplicação do conteúdo.',color:'#f77716',hours:2,signature:'Equipe de desenvolvimento ST1',signatureRole:'ST1 Academy',rule:'event_validated',eventId:event.id,badgeId:badge.id,status:'active',tagIds:[tag.id]});
      for(const [e,value] of [['events',event],['contents',content],['certificates',model],['badges',badge],['squads',squad],['tags',tag]]){const list=(await req(people.admin,path(e))).data.items;assert.ok(list.some(r=>r.id===value.id));assert.equal((await get(e,value.id)).id,value.id);if(e!=='tags')assert.equal((await get(e,value.id)).tags[0].id,tag.id);}
      const asset=ctx.db.prepare('SELECT bytes FROM academy_content_asset WHERE content_id=?').get(content.id);assert.ok(asset.bytes.length);
    });
    await t.test('edita cada cadastro e impede gravação com versão antiga',async()=>{
      for(const [e,value,patch] of [['events',event,{title:'Aplicação prática PAP revisada'}],['contents',content,{summary:'Descrição revisada.'}],['certificates',model,{description:'Reconhecimento revisado.'}],['badges',badge,{color:'#1264d9'}],['squads',squad,{name:'Squad QA revisado',memberIds:[people.seller.id],supervisorId:people.supervisor.id}],['tags',tag,{description:'Etiqueta revisada.'}]]){const r=await req(people.admin,path(e,value.id),{method:'PATCH',body:{revision:value.revision,...patch}});assert.equal(r.status,200,JSON.stringify(r.data));assert.ok(r.data.revision>value.revision);const stale=await req(people.admin,path(e,value.id),{method:'PATCH',body:{revision:value.revision,...patch}});assert.equal(stale.status,409);}
      badge=await get('badges',badge.id);model=await get('certificates',model.id);squad=await get('squads',squad.id);event=await get('events',event.id);content=await get('contents',content.id);tag=await get('tags',tag.id);
    });
    await t.test('etiquetas são únicas, escapadas e não aceitam SVG arbitrário',async()=>{
      assert.equal((await req(people.admin,path('tags'),{method:'POST',body:{title:'abordagem pap'}})).status,409);
      assert.equal((await req(people.admin,path('badges',badge.id),{method:'PATCH',body:{revision:badge.revision,svg:'<script>alert(1)</script>'}})).status,400);
      assert.equal((await req(people.admin,path('tags',tag.id),{method:'PATCH',body:{revision:tag.revision,color:'url(javascript:alert(1))'}})).status,400);
      const safe=await create('badges',{title:'<script>alert(1)</script>',color:'#1264d9',status:'active',shape:'medal',symbol:'bolt'});const svg=await req(people.admin,path('badges',safe.id)+'/preview.svg');assert.equal(svg.status,200);assert.ok(svg.bytes.toString().includes('&lt;script&gt;'));assert.ok(!svg.bytes.toString().includes('<script>'));
      const updated=await req(people.admin,path('contents',content.id)+'/tags',{method:'PATCH',body:{revision:content.revision,tagIds:[]}});assert.equal(updated.status,200);content=updated.data;assert.equal(content.tags.length,0);
      content=(await req(people.admin,path('contents',content.id)+'/tags',{method:'PATCH',body:{revision:content.revision,tagIds:[tag.id]}})).data;
    });
    await t.test('não emite por confirmação própria, submissão pendente ou pessoa bloqueada',async()=>{
      assert.equal((await req(people.admin,path('certificates',model.id)+'/issue',{method:'POST',body:{revision:model.revision,userId:people.seller.id,evidence:'Aplicação aguardando validação.'}})).status,409);
      const detail=(await req(people.seller,'/api/agenda/items/'+event.id)).data;const sent=await req(people.seller,'/api/agenda/items/'+event.id+'/submit',{method:'POST',body:{revision:detail.mine.revision,answer:'Resposta completa para validação da aplicação.'}});assert.equal(sent.status,200);
      assert.equal((await req(people.admin,path('certificates',model.id)+'/issue',{method:'POST',body:{revision:model.revision,userId:people.seller.id,evidence:'Ainda não foi conferida.'}})).status,409);
      const reviewed=await req(people.admin,'/api/agenda/items/'+event.id+'/review/'+people.seller.id,{method:'POST',body:{revision:sent.data.mine.revision,outcome:'accepted',feedback:'Evidência conferida no teste.'}});assert.equal(reviewed.status,200);
      setAccess('seller',{enabled:false});
      assert.equal((await req(people.seller,'/api/me')).status,403);
      assert.equal((await req(people.admin,path('certificates',model.id)+'/issue',{method:'POST',body:{revision:model.revision,userId:people.seller.id,evidence:'Tentativa para pessoa bloqueada de verdade.'}})).status,400);
      assert.equal(ctx.db.prepare('SELECT count(*) n FROM academy_recognition').get().n,0);
      setAccess('seller',{enabled:true});
      assert.equal(ctx.db.prepare('SELECT count(*) n FROM academy_certificate').get().n,0);
    });
    await t.test('emite PDF autêntico e uma única conquista por pessoa, modelo e versão',async()=>{
      const body={revision:model.revision,userId:people.seller.id,evidence:'Aplicação conferida pela gestão de teste.'},r=await req(people.admin,path('certificates',model.id)+'/issue',{method:'POST',body});assert.equal(r.status,201,JSON.stringify(r.data));award=r.data;
      const retry=await req(people.admin,path('certificates',model.id)+'/issue',{method:'POST',body});assert.equal(retry.data.id,award.id);
      const pdf=await req(people.seller,award.pdfUrl);assert.equal(pdf.status,200);assert.equal(pdf.bytes.subarray(0,5).toString(),'%PDF-');assert.equal(createHash('sha256').update(pdf.bytes).digest('hex'),award.pdfSha256);
      const doc=await PDFDocument.load(pdf.bytes);assert.equal(doc.getPageCount(),1);assert.ok(doc.getTitle().includes(model.title));
      const verified=(await req(null,'/api/verify/'+award.id)).data;assert.equal(verified.valid,true);assert.equal(verified.pdfSha256,award.pdfSha256);assert.equal(verified.name,undefined);assert.equal(verified.evidence,undefined);
      assert.equal((await req(people.outsider,award.pdfUrl)).status,404);assert.equal((await req(null,award.artUrl)).status,401);
      assert.equal((await req(people.seller,'/api/me')).data.recognitions[0].id,award.id);assert.equal((await req(people.seller,'/api/profile')).data.recognitions[0].id,award.id);
      assert.equal(ctx.db.prepare("SELECT count(*) n FROM academy_message WHERE event_key=?").get('recognition:'+award.id).n,1);
      assert.equal(ctx.db.prepare('SELECT count(*) n FROM academy_xp').get().n,0);assert.equal(ctx.db.prepare('SELECT count(*) n FROM academy_outbox').get().n,0);
      assert.equal(ctx.db.prepare('SELECT count(*) n FROM academy_certificate').get().n,0);
    });
    await t.test('edição dos modelos não modifica arquivos e revogação preserva o histórico',async()=>{
      const before=ctx.db.prepare('SELECT pdf_sha256,snapshot_json FROM academy_recognition WHERE id=?').get(award.id);
      model=(await req(people.admin,path('certificates',model.id),{method:'PATCH',body:{revision:model.revision,title:'Novo modelo de aplicação'}})).data;
      const after=ctx.db.prepare('SELECT pdf_sha256,snapshot_json FROM academy_recognition WHERE id=?').get(award.id);assert.deepEqual(after,before);
      let r=await req(people.admin,'/api/admin/recognitions/'+award.id,{method:'PATCH',body:{revision:award.revision,status:'revoked',reason:'Emissão revogada para teste de governança.'}});assert.equal(r.status,200);assert.equal(r.data.status,'revoked');
      assert.equal((await req(people.seller,award.pdfUrl)).status,404);assert.equal((await req(null,'/api/verify/'+award.id)).data.valid,false);assert.equal((await req(people.seller,'/api/me')).data.recognitions.length,0);
      r=await req(people.admin,'/api/admin/recognitions/'+award.id,{method:'PATCH',body:{revision:r.data.revision,status:'issued',reason:'Emissão restaurada após teste de governança.'}});assert.equal(r.status,200);assert.equal(r.data.pdfSha256,before.pdf_sha256);assert.equal((await req(people.seller,award.pdfUrl)).status,200);
    });
    await t.test('lixeira e recuperação funcionam nos seis tipos sem apagar entregas, arquivos ou mensagens',async()=>{
      const priorAssets=ctx.db.prepare('SELECT count(*) n FROM academy_content_asset').get().n,priorMessages=ctx.db.prepare('SELECT count(*) n FROM academy_message').get().n,priorSubmissions=ctx.db.prepare('SELECT count(*) n FROM academy_agenda_submission').get().n;
      for(const [e,value] of [['events',event],['contents',content],['certificates',model],['badges',badge],['squads',squad],['tags',tag]]){
        const fresh=await get(e,value.id),deleted=await req(people.admin,path(e,value.id),{method:'DELETE',body:{revision:fresh.revision}});assert.equal(deleted.status,200,JSON.stringify(deleted.data));
        assert.ok(!(await req(people.admin,path(e))).data.items.some(i=>i.id===value.id));const trash=(await req(people.admin,path(e)+'?trash=1')).data.items;assert.ok(trash.some(i=>i.id===value.id));
        const trashed=await get(e,value.id);assert.ok(trashed.deletedAt);assert.equal((await req(people.admin,path(e,value.id),{method:'PATCH',body:{revision:trashed.revision,title:'Não ressuscitar'}})).status,404);
        if(e==='events'){assert.equal((await req(people.seller,'/api/agenda/items/'+value.id)).status,404);assert.equal((await req(people.admin,'/api/agenda?management=1')).status,200);}
        if(e==='contents'){assert.equal((await req(people.seller,'/api/contents/'+value.id+'/file')).status,404);assert.equal((await req(people.admin,'/api/admin/contents/'+value.id,{method:'PATCH',body:{revision:trashed.revision,status:'published'}})).status,404);}
        if(e==='tags')assert.equal(ctx.management.tagsFor('contents',content.id).length,0);
        const restored=await req(people.admin,path(e,value.id)+'/restore',{method:'POST',body:{revision:trashed.revision}});assert.equal(restored.status,200);assert.equal(restored.data.deletedAt,null);assert.equal(restored.data.status,fresh.status);
      }
      assert.equal(ctx.db.prepare('SELECT count(*) n FROM academy_content_asset').get().n,priorAssets);assert.equal(ctx.db.prepare('SELECT count(*) n FROM academy_message').get().n,priorMessages);assert.equal(ctx.db.prepare('SELECT count(*) n FROM academy_agenda_submission').get().n,priorSubmissions);
      assert.equal((await req(people.seller,award.pdfUrl)).status,200);assert.equal(ctx.management.tagsFor('contents',content.id).length,1);
    });
    await t.test('insígnias podem ser emitidas com motivo, e campos secretos não saem nas consultas',async()=>{
      const fresh=await get('badges',badge.id),r=await req(people.admin,path('badges',badge.id)+'/issue',{method:'POST',body:{revision:fresh.revision,userId:people.seller.id,evidence:'Participação destacada e conferida pelo Admin.'}});assert.equal(r.status,201);assert.equal(r.data.hasPdf,false);assert.equal((await req(people.seller,r.data.artUrl)).status,200);
      assert.equal((await req(people.seller,'/api/admin/recognitions')).status,403);
      const me=(await req(people.seller,'/api/recognitions')).data;assert.equal(me.items.length,2);assert.equal(me.items[0].evidence,undefined);assert.equal(me.items[0].pdf,undefined);assert.equal(me.items[0].snapshot_json,undefined);
      assert.equal(ctx.db.prepare('SELECT count(*) n FROM academy_xp').get().n,0);
    });
    await t.test('a leitura respeita a trilha do snapshot e as permissões atuais do titular, supervisor e colegas',async()=>{
      await enroll('peer','seller');
      const currentSquad=await get('squads',squad.id),squadUpdate=await req(people.admin,path('squads',squad.id),{method:'PATCH',body:{name:currentSquad.name,description:currentSquad.description,status:'active',revision:currentSquad.revision,supervisorId:people.supervisor.id,memberIds:[people.seller.id,people.peer.id]}});assert.equal(squadUpdate.status,200,JSON.stringify(squadUpdate.data));squad=squadUpdate.data;
      const start=await req(people.seller,'/api/attempts',{method:'POST',body:{trackId:'pap'}});assert.equal(start.status,201);
      const source=ctx.bank.tracks.find(r=>r.id==='pap'),answers=Object.fromEntries(start.data.questions.map(q=>[q.id,source.questions.find(original=>original.id===q.id).answer]));
      const passed=await req(people.seller,'/api/attempts/'+start.data.id+'/finish',{method:'POST',body:{revision:0,answers}});assert.equal(passed.status,200);assert.equal(passed.data.approved,true);
      const trackModel=await create('certificates',{title:'Trilha PAP aplicada',description:'Reconhecimento vinculado à certificação PAP.',rule:'track_certified',trackId:'pap',status:'active'});
      const earned=await req(people.admin,path('certificates',trackModel.id)+'/issue',{method:'POST',body:{revision:trackModel.revision,userId:people.seller.id,evidence:'Aprovação original confirmada no teste.'}});assert.equal(earned.status,201);
      for(const key of ['seller','supervisor','peer'])assert.equal((await req(people[key],earned.data.pdfUrl)).status,200,key);
      // Editing the definition must never retarget an existing award's access rule.
      await req(people.admin,path('certificates',trackModel.id),{method:'PATCH',body:{revision:trackModel.revision,rule:'manual',trackId:null}});
      for(const key of ['seller','supervisor','peer']){
        setAccess(key,{tracks:[]});assert.equal((await req(people[key],earned.data.pdfUrl)).status,404,key+' without track');
        const visible=ctx.management.recognitions(readProfile(ctx.db,people[key].id),people.seller.id);assert.ok(!visible.some(r=>r.id===earned.data.id));
        setAccess(key,{tracks:['pap']});assert.equal((await req(people[key],earned.data.pdfUrl)).status,200);
      }
      for(const key of ['seller','peer']){
        const original=readProfile(ctx.db,people[key].id).permissions;setAccess(key,{permissions:original.filter(p=>p!=='conquests')});assert.equal((await req(people[key],earned.data.pdfUrl)).status,404);setAccess(key,{permissions:original});
      }
      const supervisorPermissions=readProfile(ctx.db,people.supervisor.id).permissions;setAccess('supervisor',{permissions:supervisorPermissions.filter(p=>p!=='team_results')});assert.equal((await req(people.supervisor,earned.data.pdfUrl)).status,200,'supervisor still shares the squad as colleague');setAccess('supervisor',{permissions:supervisorPermissions.filter(p=>p!=='team_results'&&p!=='conquests')});assert.equal((await req(people.supervisor,earned.data.pdfUrl)).status,404);setAccess('supervisor',{permissions:supervisorPermissions});
      setAccess('seller',{enabled:false});assert.equal((await req(people.peer,earned.data.pdfUrl)).status,404);assert.equal((await req(people.supervisor,earned.data.pdfUrl)).status,404);assert.equal((await req(people.admin,earned.data.pdfUrl)).status,200);setAccess('seller',{enabled:true});
    });
    await t.test('emissões sem permissão de comunidade ou conquistas não divulgam a pessoa no squad',async()=>{
      for(const missing of ['community','conquests']){
        const permissions=readProfile(ctx.db,people.seller.id).permissions,prior=ctx.db.prepare('SELECT count(*) n FROM academy_message').get().n;
        setAccess('seller',{permissions:permissions.filter(p=>p!==missing)});
        const privateBadge=await create('badges',{title:'Marco privado '+missing,status:'active'}),earned=await req(people.admin,path('badges',privateBadge.id)+'/issue',{method:'POST',body:{revision:privateBadge.revision,userId:people.seller.id,evidence:'Reconhecimento reservado no teste de acessos.'}});assert.equal(earned.status,201);
        assert.equal(ctx.db.prepare('SELECT shared_squad_id FROM academy_recognition WHERE id=?').get(earned.data.id).shared_squad_id,null);
        assert.equal(ctx.db.prepare('SELECT count(*) n FROM academy_message').get().n,prior);assert.equal((await req(people.peer,earned.data.artUrl)).status,404);
        setAccess('seller',{permissions});
      }
    });
    await t.test('a emissão assíncrona revalida o Admin, a pessoa, o cadastro e a insígnia antes de persistir',async()=>{
      await enroll('backupadmin','admin');
      const gated=()=>{const pending=[];const service=createManagementService(ctx.db,ctx.bank,ctx.access,ctx.contents,ctx.agenda,ctx.game,{baseURL,testMode:true,renderPdf:async snapshot=>{await new Promise(resolve=>pending.push(resolve));return recognitionPdf(snapshot);}});return {pending,service};};
      for(const scenario of ['recipient','admin','model','badge','event']){
        const linked=await create('badges',{title:'Insígnia assíncrona '+scenario,status:'active'}),candidate=await create('certificates',{title:'Certificado assíncrono '+scenario,rule:scenario==='event'?'event_validated':'manual',eventId:scenario==='event'?event.id:null,badgeId:linked.id,status:'active'});
        const {pending,service}=gated(),before=ctx.db.prepare('SELECT count(*) n FROM academy_recognition').get().n;
        const emission=service.issue(readProfile(ctx.db,people.admin.id),'certificates',candidate.id,{revision:candidate.revision,userId:people.seller.id,evidence:'Evidência conferida no teste assíncrono.'});
        assert.equal(pending.length,1);
        if(scenario==='recipient')setAccess('seller',{enabled:false});
        if(scenario==='admin')setAccess('admin',{role:'seller',permissions:['materials','assessments','conquests','community'],supervisorIds:[],sellerIds:[]});
        if(scenario==='model')ctx.management.remove(readProfile(ctx.db,people.admin.id),'certificates',candidate.id,{revision:candidate.revision});
        if(scenario==='badge')ctx.management.save(readProfile(ctx.db,people.admin.id),'badges',linked.id,{revision:linked.revision,color:'#1264d9'});
        if(scenario==='event')ctx.management.save(readProfile(ctx.db,people.admin.id),'events',event.id,{revision:(await get('events',event.id)).revision,status:'cancelled'});
        pending[0]();await assert.rejects(emission,error=>error.status===(scenario==='admin'?403:409));assert.equal(ctx.db.prepare('SELECT count(*) n FROM academy_recognition').get().n,before);
        if(scenario==='recipient')setAccess('seller',{enabled:true});
        if(scenario==='admin')ctx.access.updateMember(people.backupadmin.id,people.admin.id,{role:'admin',enabled:true});
        if(scenario==='event')ctx.management.save(readProfile(ctx.db,people.admin.id),'events',event.id,{revision:(await get('events',event.id)).revision,status:'active'});
      }
    });
    await t.test('emissões simultâneas são idempotentes e não contornam uma revogação concorrente',async()=>{
      const pending=[],service=createManagementService(ctx.db,ctx.bank,ctx.access,ctx.contents,ctx.agenda,ctx.game,{baseURL,testMode:true,renderPdf:async snapshot=>{await new Promise(resolve=>pending.push(resolve));return recognitionPdf(snapshot);}}),candidate=await create('certificates',{title:'Certificado de concorrência',status:'active'}),viewer=readProfile(ctx.db,people.admin.id),body={revision:candidate.revision,userId:people.seller.id,evidence:'Evidência conferida no teste concorrente.'};
      const first=service.issue(viewer,'certificates',candidate.id,body),second=service.issue(viewer,'certificates',candidate.id,body);assert.equal(pending.length,2);
      pending[0]();const created=await first;service.changeIssue(viewer,created.id,{revision:created.revision,status:'revoked',reason:'Revogado enquanto outra emissão era preparada.'});
      pending[1]();await assert.rejects(second,error=>error.status===409);assert.equal(ctx.db.prepare('SELECT count(*) n FROM academy_recognition WHERE model_id=?').get(candidate.id).n,1);
      const current=service.issued(viewer).items.find(r=>r.id===created.id);service.changeIssue(viewer,created.id,{revision:current.revision,status:'issued',reason:'Restauração autorizada no teste de concorrência.'});
      assert.equal((await service.issue(viewer,'certificates',candidate.id,body)).id,created.id);
      const edited=service.save(viewer,'certificates',candidate.id,{revision:candidate.revision,description:'Nova versão para concorrência ativa.'}),nextBody={...body,revision:edited.revision},third=service.issue(viewer,'certificates',candidate.id,nextBody),fourth=service.issue(viewer,'certificates',candidate.id,nextBody);pending[2]();const thirdResult=await third;pending[3]();assert.equal((await fourth).id,thirdResult.id);
      assert.equal(ctx.db.prepare('SELECT count(*) n FROM academy_recognition WHERE model_id=?').get(candidate.id).n,2);
    });
  }finally{await new Promise(resolve=>server.close(resolve));ctx.db.close();const target=resolve(dataDir),parent=resolve(tmpdir())+sep;if(!target.startsWith(parent)||!basename(target).startsWith('st1-crud-'))throw new Error('Unsafe test cleanup');await rm(target,{recursive:true,force:true});}
});
