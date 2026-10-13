import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,sep,basename} from 'node:path';
import {randomBytes} from 'node:crypto';
import {createApp} from '../server.mjs';
import {GOOGLE_CALENDAR_SCOPE} from '../lib/google-calendar.mjs';

test('Agenda acompanha entregas e presenças e sincroniza apenas eventos ST1',async t=>{
  const dataDir=await mkdtemp(resolve(tmpdir(),'st1-agenda-')),baseURL='http://localhost:4194',people={},calendars=new Map(),calls=[];
  let now=Date.now(),calendarSequence=0,eventSequence=0,invalidateToken=false,failOnce=0,source;
  const fakeFetch=async(url,options={})=>{
    const u=new URL(url),path=decodeURIComponent(u.pathname.replace('/calendar/v3','')),method=options.method||'GET',body=options.body?JSON.parse(options.body):null;
    assert.equal(u.origin,'https://www.googleapis.com');assert.ok(options.headers.Authorization.startsWith('Bearer qa-token-'));calls.push({path,method,body,query:u.searchParams});
    const response=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}});
    if(failOnce){const status=failOnce;failOnce=0;return response({error:'isolated-qa'},status);}
    if(path==='/calendars'&&method==='POST'){const id='qa-'+(++calendarSequence)+'@calendar.test';calendars.set(id,new Map());return response({id},201);}
    const match=path.match(/^\/calendars\/([^/]+)\/events(?:\/([^/]+))?$/);assert.ok(match,'Unexpected Calendar API path');const events=calendars.get(match[1]);if(!events)return response({},404);
    if(method==='GET'&&!match[2]){if(invalidateToken&&u.searchParams.has('syncToken')){invalidateToken=false;return response({},410);}return response({items:[...events.values()],nextSyncToken:'sync-'+eventSequence});}
    if(method==='POST'){if(events.has(body.id))return response({},409);const value={...body,etag:'etag-'+(++eventSequence),htmlLink:'https://calendar.google.com/calendar/event?eid=qa'};events.set(body.id,value);return response(value,201);}
    if(method==='PATCH'){const before=events.get(match[2]);if(!before)return response({},404);const value={...before,...body,etag:'etag-'+(++eventSequence)};events.set(match[2],value);return response(value);}
    if(method==='GET')return response(events.get(match[2])||{},events.has(match[2])?200:404);
    throw new Error('Unexpected method');
  };
  const instance=await createApp({dataDir,baseURL,testMode:true,clock:()=>now,googleConfig:{clientId:'qa.example.apps.googleusercontent.com',clientSecret:'QA-NOT-A-REAL-SECRET'},calendarFetch:fakeFetch,calendarTokenProvider:async id=>'qa-token-'+id});
  const {ctx}=instance,server=await new Promise(resolve=>{const s=instance.app.listen(4194,'127.0.0.1',()=>resolve(s));});
  const request=async(who,path,{method='GET',body,headers={}}={})=>{
    const r=await fetch(baseURL+path,{method,headers:{Origin:baseURL,Connection:'close',...(who?.cookie?{Cookie:who.cookie}:{}),...(body?{'Content-Type':'application/json'}:{}),...headers},...(body?{body:JSON.stringify(body)}:{})});
    const bytes=Buffer.from(await r.arrayBuffer());let data;try{data=JSON.parse(bytes.toString());}catch{}return {status:r.status,data,bytes,headers:r.headers};
  };
  const signup=async(key,role)=>{
    const email=key+'@agenda-qa.example',inv=ctx.createInvitation({name:'QA '+key,email,role,tracks:['pap']}),r=await request(null,'/api/auth/sign-up/email',{method:'POST',headers:{'x-academy-invite':new URL(inv.url).searchParams.get('convite')},body:{name:'User-controlled name',email,password:randomBytes(24).toString('base64url')}});
    assert.equal(r.status,200);people[key]={id:r.data.user.id,cookie:r.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ')};
  };
  const iso=offset=>new Date(now+offset).toISOString(),input=(kind,ids)=>({kind,title:kind==='task'?'Atividade de aplicação PAP':'Treinamento de abordagem PAP',description:'Conteúdo fictício de teste.',startAt:iso(-3600000),endAt:iso(3600000),dueAt:iso(3600000),prompt:'Como você aplicará o conteúdo?',audience:{scope:'people',ids}});
  const detail=async(who,id)=>(await request(who,'/api/agenda/items/'+id)).data;
  let task,meeting,lateTask;
  try{
    await signup('admin','admin');await signup('seller','seller');await signup('peer','seller');await signup('leader','supervisor');await signup('outsider','seller');
    ctx.access.updateMember(people.admin.id,people.leader.id,{role:'supervisor',tracks:['pap'],sellerIds:[people.seller.id]});
    await t.test('sessão e público são obrigatórios; vendedor não programa nem acompanha outros',async()=>{
      assert.equal((await request(null,'/api/agenda')).status,401);
      assert.equal((await request(people.seller,'/api/agenda/items',{method:'POST',body:input('task',[people.peer.id])})).status,403);
      assert.equal((await request(people.seller,'/api/agenda/participation')).status,403);
      assert.equal((await request(people.leader,'/api/agenda/items',{method:'POST',body:input('task',[people.outsider.id])})).status,403);
      assert.equal((await request(people.admin,'/api/agenda')).data.items.length,0);
      assert.equal(ctx.db.prepare('SELECT count(*) n FROM academy_xp').get().n,0);
    });
    await t.test('programação valida horário, link e público sem criar registros incompletos',async()=>{
      assert.equal((await request(people.admin,'/api/agenda/items',{method:'POST',body:{...input('training',[people.seller.id]),meetingUrl:'javascript:alert(1)'}})).status,400);
      assert.equal((await request(people.admin,'/api/agenda/items',{method:'POST',body:{...input('task',[people.seller.id]),endAt:iso(-7200000)}})).status,400);
      assert.equal(ctx.db.prepare('SELECT count(*) n FROM academy_agenda_item').get().n,0);
    });
    await t.test('tarefa e encontro avisam somente os participantes selecionados',async()=>{
      let r=await request(people.admin,'/api/agenda/items',{method:'POST',body:input('task',[people.seller.id,people.peer.id])});assert.equal(r.status,201);task=r.data;
      r=await request(people.admin,'/api/agenda/items',{method:'POST',body:{...input('training',[people.seller.id,people.leader.id]),startAt:iso(7200000),endAt:iso(10800000),meetingUrl:'https://meet.google.com/aaa-bbbb-ccc'}});assert.equal(r.status,201);meeting=r.data;
      assert.equal((await request(people.outsider,'/api/agenda/items/'+task.id)).status,404);
      assert.equal(ctx.db.prepare("SELECT count(*) n FROM academy_notification WHERE user_id=? AND event_key LIKE 'agenda-%'").get(people.outsider.id).n,0);
      assert.ok(ctx.db.prepare("SELECT count(*) n FROM academy_notification WHERE user_id=? AND event_key LIKE 'agenda-%'").get(people.seller.id).n>=2);
    });
    await t.test('supervisor valida sua equipe, mas não edita encontro criado pelo Admin',async()=>{
      const m=await detail(people.leader,meeting.id);assert.equal(m.canEdit,false);assert.equal(m.participants.some(p=>p.userId===people.peer.id),false);
      assert.equal((await request(people.leader,'/api/agenda/items/'+meeting.id,{method:'PATCH',body:{revision:meeting.revision,status:'cancelled'}})).status,403);
    });
    await t.test('aceitar convite não confirma presença, não dá XP e usa revisão',async()=>{
      const m=await detail(people.seller,meeting.id),r=await request(people.seller,'/api/agenda/items/'+meeting.id+'/respond',{method:'POST',body:{revision:m.mine.revision,action:'confirmed'}});
      assert.equal(r.status,200);assert.equal(r.data.mine.attendance,'none');
      assert.equal((await request(people.seller,'/api/agenda/items/'+meeting.id+'/respond',{method:'POST',body:{revision:m.mine.revision,action:'declined'}})).status,409);
      assert.equal((await request(people.seller,'/api/agenda/items/'+meeting.id+'/respond',{method:'POST',body:{revision:r.data.mine.revision,action:'declared'}})).status,400);
      assert.equal(ctx.db.prepare('SELECT count(*) n FROM academy_xp').get().n,0);
    });
    await t.test('entrega é preenchida pelo titular, aguarda gestão e guarda o prazo original',async()=>{
      let p=await detail(people.seller,task.id),r=await request(people.seller,'/api/agenda/items/'+task.id+'/submit',{method:'POST',body:{revision:p.mine.revision,answer:'Exemplo de aplicação com explicação e prática.'}});
      assert.equal(r.status,200);assert.equal(r.data.mine.progress,'submitted');assert.equal(r.data.mine.late,false);
      const snapshot=r.data.mine.submittedDueAt;now+=7200000;
      r=await request(people.admin,'/api/agenda/items/'+task.id,{method:'PATCH',body:{revision:task.revision,dueAt:iso(10800000)}});assert.equal(r.status,200);task=r.data;
      assert.equal((await detail(people.seller,task.id)).mine.submittedDueAt,snapshot);
      assert.equal(ctx.db.prepare('SELECT count(*) n FROM academy_agenda_submission WHERE item_id=?').get(task.id).n,1);
    });
    await t.test('presença declarada exige conferência e nenhuma pessoa valida a própria presença',async()=>{
      let m=await detail(people.seller,meeting.id),r=await request(people.seller,'/api/agenda/items/'+meeting.id+'/respond',{method:'POST',body:{revision:m.mine.revision,action:'declared'}});
      assert.equal(r.status,200);assert.equal(r.data.mine.attendance,'declared');
      const own=await detail(people.leader,meeting.id);
      assert.equal((await request(people.leader,'/api/agenda/items/'+meeting.id+'/review/'+people.leader.id,{method:'POST',body:{revision:own.mine.revision,outcome:'present'}})).status,403);
      r=await request(people.leader,'/api/agenda/items/'+meeting.id+'/review/'+people.seller.id,{method:'POST',body:{revision:r.data.mine.revision,outcome:'present',feedback:'Participou da atividade.'}});assert.equal(r.status,200);
      assert.equal((await detail(people.seller,meeting.id)).mine.attendance,'present');
    });
    await t.test('validação não inventa certificado e entrega aguardando gestão não vira falta de preenchimento',async()=>{
      const own=await detail(people.seller,task.id),r=await request(people.leader,'/api/agenda/items/'+task.id+'/review/'+people.seller.id,{method:'POST',body:{revision:own.mine.revision,outcome:'accepted',feedback:'Aplicação conferida.'}});assert.equal(r.status,200);
      assert.equal((await detail(people.seller,task.id)).mine.progress,'accepted');
      assert.equal(ctx.db.prepare('SELECT count(*) n FROM academy_certificate').get().n,0);assert.equal(ctx.db.prepare('SELECT count(*) n FROM academy_xp').get().n,0);
      now+=21600000;
      const report=(await request(people.admin,'/api/agenda/participation')).data.people.find(p=>p.id===people.seller.id);assert.equal(report.present,1);assert.equal(report.validated,1);assert.equal(report.onTime,1);
      assert.equal(report.participation,100);
    });
    await t.test('envio após prazo é rastreado; histórico e lembretes não se duplicam',async()=>{
      const r=await request(people.admin,'/api/agenda/items',{method:'POST',body:{...input('task',[people.seller.id]),dueAt:iso(900000)}});assert.equal(r.status,201);lateTask=r.data;
      ctx.agenda.remind();const n=ctx.db.prepare('SELECT count(*) n FROM academy_notification').get().n;ctx.agenda.remind();assert.equal(ctx.db.prepare('SELECT count(*) n FROM academy_notification').get().n,n);
      now+=1800000;let own=await detail(people.seller,lateTask.id);
      const s=await request(people.seller,'/api/agenda/items/'+lateTask.id+'/submit',{method:'POST',body:{revision:own.mine.revision,answer:'Entrega realizada após o prazo de teste.'}});assert.equal(s.status,200);assert.equal(s.data.mine.late,true);assert.equal(s.data.mine.overdue,false);
      const report=(await request(people.admin,'/api/agenda/participation')).data.people.find(p=>p.id===people.seller.id);assert.equal(report.overdue,0);assert.equal(report.participation,67);
    });
    await t.test('novos acessos entram no público por perfil enquanto o compromisso está aberto',async()=>{
      const r=await request(people.admin,'/api/agenda/items',{method:'POST',body:{...input('task',[]),audience:{scope:'role',ids:['seller']}}});assert.equal(r.status,201);
      await signup('newSeller','seller');
      assert.equal((await request(people.newSeller,'/api/agenda')).data.items.some(i=>i.id===r.data.id),true);
      assert.equal((await request(people.leader,'/api/agenda')).data.items.some(i=>i.id===r.data.id),false);
    });
    await t.test('exportação .ics é privada e não contém respostas nem participantes',async()=>{
      const r=await request(people.seller,'/api/agenda/items/'+task.id+'/calendar.ics');assert.equal(r.status,200);const output=r.bytes.toString();assert.ok(output.includes('BEGIN:VCALENDAR'));assert.ok(!output.includes('agenda-qa.example'));assert.ok(!output.includes('Exemplo de aplicação'));
      assert.equal((await request(people.outsider,'/api/agenda/items/'+task.id+'/calendar.ics')).status,404);
    });
    await t.test('Google OAuth usa convite verificado, PKCE e escopo restrito; metadados não expõem chave',async()=>{
      assert.equal((await request(null,'/api/auth/sign-in/social',{method:'POST',body:{provider:'google',callbackURL:'https://evil.example'}})).status,403);
      const r=await request(null,'/api/auth/sign-in/social',{method:'POST',headers:{'x-academy-remember':'0'},body:{provider:'google',callbackURL:baseURL+'/#inicio',requestSignUp:true,additionalData:{serverContext:{academyInviteId:'spoof'}}}});assert.equal(r.status,200);
      const u=new URL(r.data.url);assert.equal(u.hostname,'accounts.google.com');assert.ok(u.searchParams.get('scope').includes(GOOGLE_CALENDAR_SCOPE));assert.ok(!u.searchParams.get('scope').split(' ').includes('https://www.googleapis.com/auth/calendar'));assert.ok(u.searchParams.get('code_challenge'));assert.equal(u.searchParams.get('redirect_uri'),baseURL+'/api/auth/callback/google');
      assert.ok(r.headers.getSetCookie().some(c=>c.includes('dont_remember')));
      assert.equal((await request(null,'/api/auth/sign-in/social',{method:'POST',headers:{'x-academy-invite':'invalid'},body:{provider:'google'}})).status,403);
      assert.equal((await request(null,'/api/auth/sign-in/social',{method:'POST',body:{provider:'google',idToken:{token:'forged'}}})).status,403);
      const setup=await request(people.admin,'/api/admin/calendar-setup');assert.ok(!JSON.stringify(setup.data).includes('QA-NOT-A-REAL-SECRET'));
      assert.equal((await request(people.seller,'/api/admin/calendar-setup')).status,403);
      assert.equal((await request(people.seller,'/api/auth/get-access-token',{method:'POST',body:{accountId:'forged'}})).status,403);
    });
    await t.test('conexão cria calendário ST1 e eventos idempotentes sem copiar respostas pessoais',async()=>{
      await ctx.googleCalendar.connect({...ctx.access.publicProfile(ctx.db.prepare('SELECT m.*,u.name,u.email FROM academy_member m JOIN user u ON u.id=m.user_id WHERE m.user_id=?').get(people.admin.id)),user_id:people.admin.id,enabled:1});
      await ctx.googleCalendar.connect({user_id:people.seller.id,enabled:1});
      source=ctx.db.prepare('SELECT * FROM academy_calendar_connection WHERE user_id=?').get(people.admin.id);assert.ok(source.calendar_id);assert.ok(calendars.get(source.calendar_id).size>=1);
      const count=[...calendars.values()].reduce((n,c)=>n+c.size,0);await ctx.googleCalendar.sync(people.admin.id);await ctx.googleCalendar.sync(people.seller.id);assert.equal([...calendars.values()].reduce((n,c)=>n+c.size,0),count);
      const payloads=JSON.stringify([...calendars.values()].flatMap(c=>[...c.values()]));assert.ok(!payloads.includes('Exemplo de aplicação'));assert.ok(!payloads.includes('Entrega realizada após'));
      assert.equal(ctx.googleCalendar.status({user_id:people.seller.id}).state,'connected');assert.ok(calls.some(c=>c.query.get('sendUpdates')==='all'));
    });
    await t.test('edição local é enviada ao Google e uma cópia inalterada não desfaz a programação',async()=>{
      const current=ctx.agenda.row(meeting.id),viewer=ctx.db.prepare('SELECT m.*,u.name,u.email FROM academy_member m JOIN user u ON u.id=m.user_id WHERE m.user_id=?').get(people.admin.id);
      ctx.agenda.save({...viewer,tracks:['pap'],permissions:[],enabled:1},{revision:current.revision,title:'Treinamento PAP atualizado na Academy'},meeting.id);
      await ctx.googleCalendar.sync(people.admin.id);
      const m=ctx.db.prepare('SELECT * FROM academy_calendar_mirror WHERE item_id=? AND user_id=?').get(meeting.id,people.admin.id);
      assert.equal(ctx.agenda.row(meeting.id).title,'Treinamento PAP atualizado na Academy');assert.equal(calendars.get(source.calendar_id).get(m.event_id).summary,'Treinamento · Treinamento PAP atualizado na Academy');
    });
    await t.test('mudança de horário e RSVP chegam do Google sem falsificar presença',async()=>{
      const mirror=ctx.db.prepare('SELECT * FROM academy_calendar_mirror WHERE item_id=? AND user_id=?').get(meeting.id,people.admin.id),event=calendars.get(source.calendar_id).get(mirror.event_id);
      calendars.get(source.calendar_id).set(mirror.event_id,{...event,start:{dateTime:iso(7200000)},end:{dateTime:iso(10800000)},attendees:event.attendees.map(a=>({...a,responseStatus:'accepted'})),etag:'google-change-'+(++eventSequence)});
      await ctx.googleCalendar.sync(people.admin.id);const current=await detail(people.leader,meeting.id);assert.equal(current.startAt,iso(7200000));assert.equal(current.mine.rsvp,'confirmed');assert.equal(current.mine.attendance,'none');
    });
    await t.test('syncToken vencido refaz a leitura; falha não declara sincronização bem-sucedida',async()=>{
      invalidateToken=true;await ctx.googleCalendar.sync(people.admin.id);assert.ok(ctx.db.prepare('SELECT sync_token FROM academy_calendar_connection WHERE user_id=?').get(people.admin.id).sync_token);
      failOnce=503;await assert.rejects(ctx.googleCalendar.sync(people.admin.id));assert.equal(ctx.googleCalendar.status({user_id:people.admin.id}).state,'error');await ctx.googleCalendar.sync(people.admin.id);assert.equal(ctx.googleCalendar.status({user_id:people.admin.id}).state,'connected');
    });
    await t.test('cancelamento no Google é importado e remoção de tarefa não a conclui',async()=>{
      const mirror=ctx.db.prepare('SELECT * FROM academy_calendar_mirror WHERE item_id=? AND user_id=?').get(meeting.id,people.admin.id),event=calendars.get(source.calendar_id).get(mirror.event_id);calendars.get(source.calendar_id).set(mirror.event_id,{...event,status:'cancelled',etag:'cancelled-'+(++eventSequence)});await ctx.googleCalendar.sync(people.admin.id);assert.equal(ctx.agenda.row(meeting.id).status,'cancelled');
      const personal=ctx.db.prepare('SELECT * FROM academy_calendar_connection WHERE user_id=?').get(people.seller.id),taskMirror=ctx.db.prepare('SELECT * FROM academy_calendar_mirror WHERE item_id=? AND user_id=?').get(lateTask.id,people.seller.id),taskEvent=calendars.get(personal.calendar_id).get(taskMirror.event_id);calendars.get(personal.calendar_id).set(taskMirror.event_id,{...taskEvent,status:'cancelled',etag:'removed-'+(++eventSequence)});await ctx.googleCalendar.sync(people.seller.id);
      assert.equal((await detail(people.seller,lateTask.id)).mine.progress,'submitted');assert.equal(ctx.db.prepare('SELECT status FROM academy_calendar_mirror WHERE item_id=? AND user_id=?').get(lateTask.id,people.seller.id).status,'external_removed');
      await ctx.googleCalendar.sync(people.seller.id,{restore:true});assert.notEqual(ctx.db.prepare('SELECT event_id FROM academy_calendar_mirror WHERE item_id=? AND user_id=?').get(lateTask.id,people.seller.id).event_id,taskMirror.event_id);
    });
    await t.test('reativar um treinamento restaura o evento sem duplicar o convite',async()=>{
      const current=ctx.agenda.row(meeting.id),viewer=ctx.db.prepare('SELECT m.*,u.name,u.email FROM academy_member m JOIN user u ON u.id=m.user_id WHERE m.user_id=?').get(people.admin.id),count=calendars.get(source.calendar_id).size;
      ctx.agenda.save({...viewer,tracks:['pap'],permissions:[],enabled:1},{revision:current.revision,status:'active'},meeting.id);
      await ctx.googleCalendar.sync(people.admin.id);
      const m=ctx.db.prepare('SELECT * FROM academy_calendar_mirror WHERE item_id=? AND user_id=?').get(meeting.id,people.admin.id);
      assert.equal(ctx.agenda.row(meeting.id).status,'active');assert.equal(calendars.get(source.calendar_id).get(m.event_id).status,'confirmed');assert.equal(calendars.get(source.calendar_id).size,count);
    });
    await t.test('pausa e bloqueio impedem sincronização; dados e histórico continuam no banco',async()=>{
      ctx.googleCalendar.pause({user_id:people.seller.id});await assert.rejects(ctx.googleCalendar.sync(people.seller.id));assert.ok(ctx.db.prepare('SELECT count(*) n FROM academy_agenda_submission').get().n>=2);
      ctx.access.updateMember(people.admin.id,people.peer.id,{role:'seller',tracks:['pap'],enabled:false});assert.equal((await request(people.peer,'/api/agenda')).status,403);
      assert.equal(ctx.db.prepare('SELECT count(*) n FROM academy_xp').get().n,0);
    });
  }finally{
    ctx.googleCalendar.stop();await new Promise(r=>server.close(r));ctx.db.close();
    const absolute=resolve(dataDir);assert.ok(absolute.startsWith(resolve(tmpdir())+sep)&&basename(absolute).startsWith('st1-agenda-'));await rm(absolute,{recursive:true,force:true});
  }
});
