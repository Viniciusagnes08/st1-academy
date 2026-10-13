import {randomUUID} from 'node:crypto';
import {readProfile,hasPermission,hasTrack} from './access.mjs';

const fail=(message,status=400)=>Object.assign(new Error(message),{status});
const text=(value,max,label)=>{if(typeof value!=='string'||value.length>max)throw fail(label+' inválido.');return value.trim();};
const date=(value,label)=>{if(typeof value!=='string'||!/\dT\d.*(?:Z|[+-]\d\d:\d\d)$/.test(value)||!Number.isFinite(Date.parse(value)))throw fail('Informe '+label+' com data e horário.');return new Date(value).toISOString();};
export const canManageAgenda=p=>p?.enabled===1&&(p.role==='admin'||p.role==='supervisor'&&hasPermission(p,'team_results'));

export function createAgendaService(db,access,game,contents,{clock=Date.now}={}){
  db.exec([
    "CREATE TABLE IF NOT EXISTS academy_agenda_item(id TEXT PRIMARY KEY,creator_id TEXT NOT NULL REFERENCES user(id),kind TEXT NOT NULL,title TEXT NOT NULL,description TEXT NOT NULL,start_at TEXT NOT NULL,end_at TEXT NOT NULL,due_at TEXT NOT NULL,meeting_url TEXT NOT NULL DEFAULT '',location TEXT NOT NULL DEFAULT '',content_id TEXT,prompt TEXT NOT NULL DEFAULT '',audience_json TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'active',revision INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL,updated_at TEXT NOT NULL)",
    "CREATE TABLE IF NOT EXISTS academy_agenda_assignment(item_id TEXT NOT NULL REFERENCES academy_agenda_item(id),user_id TEXT NOT NULL REFERENCES user(id),active INTEGER NOT NULL DEFAULT 1,rsvp TEXT NOT NULL DEFAULT 'needs_action',rsvp_source TEXT,attendance TEXT NOT NULL DEFAULT 'none',progress TEXT NOT NULL DEFAULT 'pending',answer TEXT NOT NULL DEFAULT '',submitted_at TEXT,submitted_due_at TEXT,validated_at TEXT,validated_by TEXT REFERENCES user(id),feedback TEXT NOT NULL DEFAULT '',revision INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(item_id,user_id))",
    "CREATE TABLE IF NOT EXISTS academy_agenda_submission(id TEXT PRIMARY KEY,item_id TEXT NOT NULL REFERENCES academy_agenda_item(id),user_id TEXT NOT NULL REFERENCES user(id),answer TEXT NOT NULL,submitted_at TEXT NOT NULL,due_at TEXT NOT NULL)",
    "CREATE INDEX IF NOT EXISTS academy_agenda_person ON academy_agenda_assignment(user_id,active)",
    "CREATE TABLE IF NOT EXISTS academy_calendar_connection(user_id TEXT PRIMARY KEY REFERENCES user(id),calendar_id TEXT,status TEXT NOT NULL DEFAULT 'disconnected',last_sync TEXT,sync_token TEXT,last_error TEXT,connected_at TEXT)",
    "CREATE TABLE IF NOT EXISTS academy_calendar_mirror(item_id TEXT NOT NULL REFERENCES academy_agenda_item(id),user_id TEXT NOT NULL REFERENCES user(id),event_id TEXT NOT NULL,etag TEXT,desired_hash TEXT,status TEXT NOT NULL DEFAULT 'pending',html_url TEXT,last_error TEXT,PRIMARY KEY(item_id,user_id))"
  ].join(';')+';');
  const transaction=fn=>{db.exec('BEGIN IMMEDIATE');try{const v=fn();db.exec('COMMIT');return v;}catch(e){db.exec('ROLLBACK');throw e;}};
  for(const column of ['deleted_at','deletion_status'])if(!db.prepare('PRAGMA table_info(academy_agenda_item)').all().some(c=>c.name===column))db.exec('ALTER TABLE academy_agenda_item ADD COLUMN '+column+' TEXT');
  const row=id=>db.prepare('SELECT * FROM academy_agenda_item WHERE id=?').get(id);
  const people=()=>db.prepare('SELECT user_id FROM academy_member WHERE enabled=1').all().map(p=>readProfile(db,p.user_id));
  const canTarget=(actor,p)=>actor?.enabled===1&&p?.enabled===1&&(actor.role==='admin'||canManageAgenda(actor)&&(actor.user_id===p.user_id||game.squads.canInspect(actor,p.user_id)));
  const members=item=>db.prepare('SELECT a.*,u.name,u.email,m.role,m.enabled FROM academy_agenda_assignment a JOIN user u ON u.id=a.user_id JOIN academy_member m ON m.user_id=a.user_id WHERE a.item_id=? ORDER BY u.name').all(item.id);
  const choices=viewer=>{
    if(!canManageAgenda(viewer))throw fail('A programação é exclusiva da gestão autorizada.',403);
    const users=people().filter(p=>canTarget(viewer,p));
    const squads=db.prepare("SELECT id,name,supervisor_id FROM academy_squad WHERE status='active' ORDER BY name").all().filter(s=>viewer.role==='admin'||s.supervisor_id===viewer.user_id);
    return {users:users.map(p=>({id:p.user_id,name:p.name,role:p.role})),squads,contents:contents.visible(viewer).map(c=>({id:c.id,title:c.title})),roles:viewer.role==='admin'?['seller','supervisor','admin']:['seller','supervisor']};
  };
  const matches=(audience,p)=>{
    if(audience.scope==='all')return true;
    if(audience.scope==='role')return audience.ids.includes(p.role);
    if(audience.scope==='people')return audience.ids.includes(p.user_id);
    return audience.ids.includes(game.squads.ownSquad(p.user_id)?.id);
  };
  const targets=(actor,audience)=>people().filter(p=>canTarget(actor,p)&&matches(audience,p));
  const audienceFor=(actor,value)=>{
    if(!value||!['all','role','squad','people'].includes(value.scope)||!Array.isArray(value.ids)||value.ids.length>300||value.ids.some(v=>typeof v!=='string'))throw fail('Escolha um público válido.');
    const ids=[...new Set(value.ids)],c=choices(actor);
    const allowed=value.scope==='role'?c.roles:value.scope==='squad'?c.squads.map(s=>s.id):c.users.map(p=>p.id);
    if(value.scope!=='all'&&(!ids.length||ids.some(id=>!allowed.includes(id))))throw fail('O público selecionado não está sob sua gestão.',403);
    if(value.scope==='all'&&ids.length)throw fail('Público inválido.');
    const result={scope:value.scope,ids};
    if(!targets(actor,result).length)throw fail('Nenhuma pessoa ativa corresponde ao público escolhido.');
    return result;
  };
  const eligible=(item,p)=>!item.deleted_at&&p?.enabled===1&&canTarget(readProfile(db,item.creator_id),p)&&matches(JSON.parse(item.audience_json),p);
  const reconcile=()=>{
    for(const item of db.prepare("SELECT * FROM academy_agenda_item WHERE status='active' AND due_at>?").all(new Date(clock()).toISOString())){
      const actor=readProfile(db,item.creator_id);if(!canManageAgenda(actor))continue;
      const current=targets(actor,JSON.parse(item.audience_json)),ids=new Set(current.map(p=>p.user_id));
      for(const a of members(item))if(a.active&&!ids.has(a.user_id))db.prepare('UPDATE academy_agenda_assignment SET active=0,revision=revision+1 WHERE item_id=? AND user_id=?').run(item.id,a.user_id);
      for(const p of current){
        const inserted=db.prepare('INSERT OR IGNORE INTO academy_agenda_assignment(item_id,user_id) VALUES(?,?)').run(item.id,p.user_id);
        db.prepare('UPDATE academy_agenda_assignment SET active=1 WHERE item_id=? AND user_id=? AND active=0').run(item.id,p.user_id);
        if(inserted.changes)game.squads.notify(p.user_id,'agenda-assigned:'+item.id,'Novo compromisso na Academy',item.title,'#agenda/'+item.id);
      }
    }
  };
  const manageable=(viewer,item)=>canManageAgenda(viewer)&&(viewer.role==='admin'||item.creator_id===viewer.user_id||members(item).some(a=>game.squads.canInspect(viewer,a.user_id)));
  const assignmentPayload=(a,item)=>({userId:a.user_id,name:a.name,role:a.role,revision:a.revision,rsvp:a.rsvp,rsvpSource:a.rsvp_source,attendance:a.attendance,progress:a.progress,answer:a.answer,submittedAt:a.submitted_at,submittedDueAt:a.submitted_due_at,validatedAt:a.validated_at,feedback:a.feedback,late:!!a.submitted_at&&a.submitted_at>a.submitted_due_at,overdue:item.status==='active'&&item.kind==='task'&&['pending','changes'].includes(a.progress)&&item.due_at<new Date(clock()).toISOString()});
  const detail=(viewer,id)=>{
    reconcile();const item=row(id);if(!item||item.deleted_at)throw fail('Compromisso não encontrado.',404);
    const own=db.prepare('SELECT a.*,u.name,m.role FROM academy_agenda_assignment a JOIN user u ON u.id=a.user_id JOIN academy_member m ON m.user_id=a.user_id WHERE a.item_id=? AND a.user_id=? AND a.active=1').get(id,viewer.user_id);
    const manage=manageable(viewer,item);
    if(!manage&&(!own||!eligible(item,viewer)))throw fail('Compromisso não encontrado ou não liberado.',404);
    const c=item.content_id?contents.visible(viewer).find(c=>c.id===item.content_id):null;
    const participants=manage?members(item).filter(a=>a.active&&a.enabled===1&&canTarget(viewer,readProfile(db,a.user_id))).map(a=>assignmentPayload(a,item)):undefined;
    const mirror=db.prepare('SELECT status,html_url,last_error FROM academy_calendar_mirror WHERE item_id=? AND user_id=?').get(id,item.kind==='training'?item.creator_id:viewer.user_id);
    return {id:item.id,kind:item.kind,title:item.title,description:item.description,startAt:item.start_at,endAt:item.end_at,dueAt:item.due_at,meetingUrl:item.meeting_url,location:item.location,prompt:item.prompt,status:item.status,revision:item.revision,creatorId:item.creator_id,canManage:manage,canEdit:canManageAgenda(viewer)&&(viewer.role==='admin'||item.creator_id===viewer.user_id),...(manage?{audience:JSON.parse(item.audience_json),participants}:{}),content:c?{id:c.id,title:c.title}:null,mine:own&&eligible(item,viewer)?assignmentPayload(own,item):null,calendar:{state:mirror?.status||'pending',url:mirror?.html_url||null},timeZone:'America/Fortaleza'};
  };
  const validate=(actor,input,before=null)=>{
    if(!input||Object.keys(input).some(k=>!['revision','kind','title','description','startAt','endAt','dueAt','meetingUrl','location','contentId','prompt','audience','status'].includes(k)))throw fail('Programação inválida.');
    const kind=input.kind??before?.kind;if(!['training','task'].includes(kind)||before&&kind!==before.kind)throw fail('Escolha treinamento ou tarefa. O tipo de um compromisso publicado permanece fixo.');
    const title=text(input.title??before?.title,120,'Título');if(title.length<3)throw fail('Dê um título de pelo menos 3 caracteres.');
    const description=text(input.description??before?.description??'',1800,'Descrição'),startAt=date(input.startAt??before?.start_at,'o início'),endAt=date(input.endAt??before?.end_at,'o fim'),dueAt=kind==='training'?endAt:date(input.dueAt??before?.due_at,'o prazo');
    if(endAt<=startAt||dueAt<startAt||Date.parse(endAt)-Date.parse(startAt)>86400000*30)throw fail('O fim e o prazo devem ser posteriores ao início. Use um período de até 30 dias.');
    const meetingUrl=text(input.meetingUrl??before?.meeting_url??'',500,'Link');if(meetingUrl&&!/^https:\/\/[^\s]+$/i.test(meetingUrl))throw fail('Use um link de reunião HTTPS.');
    const location=text(input.location??before?.location??'',160,'Local'),prompt=text(input.prompt??before?.prompt??'',500,'Orientação de preenchimento');
    const contentId=input.contentId===null?null:input.contentId??before?.content_id??null;if(contentId&&!contents.visible(actor).some(c=>c.id===contentId))throw fail('Escolha um conteúdo liberado.',403);
    const audience=audienceFor(actor,input.audience??(before?JSON.parse(before.audience_json):null)),status=input.status??before?.status??'active';if(!['active','cancelled'].includes(status))throw fail('Status inválido.');
    return {kind,title,description,startAt,endAt,dueAt,meetingUrl,location,prompt,contentId,audience,status};
  };
  const save=(viewer,input,id=null)=>{
    if(!canManageAgenda(viewer))throw fail('A programação é exclusiva da gestão autorizada.',403);
    const before=id?row(id):null;if(id&&(!before||before.deleted_at||viewer.role!=='admin'&&before.creator_id!==viewer.user_id))throw fail('Somente o organizador ou Admin edita a programação.',403);
    if(before&&before.revision!==input.revision)throw fail('A programação mudou. Reabra antes de editar.',409);
    const v=validate(viewer,input,before),now=new Date(clock()).toISOString();id??=randomUUID();
    transaction(()=>{
      if(before)db.prepare('UPDATE academy_agenda_item SET title=?,description=?,start_at=?,end_at=?,due_at=?,meeting_url=?,location=?,content_id=?,prompt=?,audience_json=?,status=?,revision=revision+1,updated_at=? WHERE id=?').run(v.title,v.description,v.startAt,v.endAt,v.dueAt,v.meetingUrl,v.location,v.contentId,v.prompt,JSON.stringify(v.audience),v.status,now,id);
      else db.prepare('INSERT INTO academy_agenda_item(id,creator_id,kind,title,description,start_at,end_at,due_at,meeting_url,location,content_id,prompt,audience_json,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(id,viewer.user_id,v.kind,v.title,v.description,v.startAt,v.endAt,v.dueAt,v.meetingUrl,v.location,v.contentId,v.prompt,JSON.stringify(v.audience),v.status,now,now);
      const item=row(id),wanted=targets(viewer,v.audience),ids=new Set(wanted.map(p=>p.user_id));
      for(const a of members(item))if(!ids.has(a.user_id)&&a.active)db.prepare('UPDATE academy_agenda_assignment SET active=0,revision=revision+1 WHERE item_id=? AND user_id=?').run(id,a.user_id);
      for(const p of wanted){db.prepare('INSERT OR IGNORE INTO academy_agenda_assignment(item_id,user_id) VALUES(?,?)').run(id,p.user_id);db.prepare('UPDATE academy_agenda_assignment SET active=1 WHERE item_id=? AND user_id=?').run(id,p.user_id);game.squads.notify(p.user_id,'agenda-change:'+id+':'+item.revision,v.status==='cancelled'?'Compromisso cancelado':before?'Programação atualizada':'Novo compromisso na Academy',v.title,'#agenda/'+id);}
      access.audit(viewer.user_id,id,before?'agenda.updated':'agenda.created',before?{revision:before.revision,status:before.status}:null,{title:v.title,kind:v.kind,revision:item.revision,status:v.status});
    });return detail(viewer,id);
  };
  const ownRow=(viewer,id,revision)=>{
    const item=row(id),a=db.prepare('SELECT * FROM academy_agenda_assignment WHERE item_id=? AND user_id=? AND active=1').get(id,viewer.user_id);
    if(!item||!a||!eligible(item,viewer))throw fail('Compromisso não encontrado ou não liberado.',404);
    if(item.status!=='active')throw fail('Este compromisso foi cancelado.',409);
    if(a.revision!==revision)throw fail('Seu registro mudou. Reabra para continuar.',409);
    return {item,a};
  };
  const respond=(viewer,id,input)=>{
    const {item}=ownRow(viewer,id,input?.revision);if(item.kind!=='training')throw fail('Confirme a presença em um treinamento.');
    if(!['confirmed','declined','declared'].includes(input.action))throw fail('Escolha uma resposta válida.');
    if(input.action==='declared'&&(clock()<Date.parse(item.start_at)-600000||clock()>Date.parse(item.end_at)+86400000))throw fail('Declare presença do início do encontro até 24 horas após o fim.');
    if(input.action==='declared')db.prepare("UPDATE academy_agenda_assignment SET attendance=CASE WHEN attendance IN ('present','absent') THEN attendance ELSE 'declared' END,revision=revision+1 WHERE item_id=? AND user_id=?").run(id,viewer.user_id);
    else db.prepare("UPDATE academy_agenda_assignment SET rsvp=?,rsvp_source='academy',revision=revision+1 WHERE item_id=? AND user_id=?").run(input.action,id,viewer.user_id);
    access.audit(viewer.user_id,id,'agenda.response',null,{action:input.action});
    return detail(viewer,id);
  };
  const submit=(viewer,id,input)=>{
    const {item,a}=ownRow(viewer,id,input?.revision);if(item.kind!=='task')throw fail('Este compromisso é um treinamento.');if(a.progress==='accepted')throw fail('Esta entrega já foi validada.',409);
    if(clock()<Date.parse(item.start_at))throw fail('O preenchimento abre no início programado.',409);
    const answer=text(input.answer,5000,'Preenchimento');if(answer.length<3)throw fail('Preencha sua resposta antes de enviar.');
    const now=new Date(clock()).toISOString();
    transaction(()=>{db.prepare("UPDATE academy_agenda_assignment SET progress='submitted',answer=?,submitted_at=?,submitted_due_at=?,validated_at=NULL,validated_by=NULL,revision=revision+1 WHERE item_id=? AND user_id=?").run(answer,now,item.due_at,id,viewer.user_id);db.prepare('INSERT INTO academy_agenda_submission(id,item_id,user_id,answer,submitted_at,due_at) VALUES(?,?,?,?,?,?)').run(randomUUID(),id,viewer.user_id,answer,now,item.due_at);access.audit(viewer.user_id,id,'agenda.submitted',null,{late:now>item.due_at});game.squads.notify(item.creator_id,'agenda-submitted:'+id+':'+viewer.user_id+':'+(a.revision+1),'Uma entrega para validar',viewer.name+' enviou '+item.title+'.','#agenda/'+id);});
    return detail(viewer,id);
  };
  const review=(viewer,id,userId,input)=>{
    const item=row(id),person=readProfile(db,userId),a=db.prepare('SELECT * FROM academy_agenda_assignment WHERE item_id=? AND user_id=? AND active=1').get(id,userId);
    if(!item||!a||!person||!manageable(viewer,item)||!canTarget(viewer,person))throw fail('Validação não liberada.',403);
    if(userId===viewer.user_id)throw fail('Sua participação precisa ser validada por outra pessoa da gestão.',403);
    if(item.status!=='active'||a.revision!==input?.revision)throw fail('O registro mudou ou foi cancelado. Reabra para continuar.',409);
    const status=input.outcome,feedback=text(input.feedback??'',800,'Devolutiva'),now=new Date(clock()).toISOString();
    if(item.kind==='task'){if(a.progress!=='submitted'||!['accepted','changes'].includes(status))throw fail('Valide uma entrega enviada.');db.prepare('UPDATE academy_agenda_assignment SET progress=?,feedback=?,validated_at=?,validated_by=?,revision=revision+1 WHERE item_id=? AND user_id=?').run(status,feedback,now,viewer.user_id,id,userId);}
    else {if(!['present','absent'].includes(status)||clock()<Date.parse(item.start_at))throw fail('Registre a presença após o início do encontro.');db.prepare('UPDATE academy_agenda_assignment SET attendance=?,feedback=?,validated_at=?,validated_by=?,revision=revision+1 WHERE item_id=? AND user_id=?').run(status,feedback,now,viewer.user_id,id,userId);}
    access.audit(viewer.user_id,id,'agenda.validated',null,{userId,outcome:status});game.squads.notify(userId,'agenda-reviewed:'+id+':'+(a.revision+1),'Sua participação foi conferida',item.title+' recebeu uma devolutiva da gestão.','#agenda/'+id);
    return detail(viewer,id);
  };
  const list=(viewer,{month,management=false}={})=>{
    if(month&&!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))throw fail('Escolha um mês válido.');
    if(management&&!canManageAgenda(viewer))throw fail('Acompanhamento não liberado.',403);
    reconcile();let items=db.prepare('SELECT * FROM academy_agenda_item WHERE deleted_at IS NULL ORDER BY start_at,id').all().filter(item=>management?manageable(viewer,item):!!db.prepare('SELECT 1 FROM academy_agenda_assignment WHERE item_id=? AND user_id=? AND active=1').get(item.id,viewer.user_id)&&eligible(item,viewer));
    if(month){const start=month+'-01T00:00:00-03:00',d=new Date(start),end=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,1,3)).toISOString();items=items.filter(i=>i.start_at<end&&i.due_at>=d.toISOString());}
    return {items:items.map(i=>detail(viewer,i.id)),canManage:canManageAgenda(viewer),timeZone:'America/Fortaleza',serverNow:new Date(clock()).toISOString()};
  };
  const report=viewer=>{
    if(!canManageAgenda(viewer))throw fail('Acompanhamento não liberado.',403);
    reconcile();const now=new Date(clock()).toISOString(),items=db.prepare("SELECT * FROM academy_agenda_item WHERE status='active'").all();
    return {people:people().filter(p=>canTarget(viewer,p)).map(p=>{
      const entries=items.filter(i=>manageable(viewer,i)).map(i=>({item:i,a:db.prepare('SELECT * FROM academy_agenda_assignment WHERE item_id=? AND user_id=? AND active=1').get(i.id,p.user_id)})).filter(e=>e.a);
      const tasks=entries.filter(e=>e.item.kind==='task'),trainings=entries.filter(e=>e.item.kind==='training'),ended=entries.filter(e=>e.item.due_at<=now),done=ended.filter(e=>e.item.kind==='task'?e.a.progress==='accepted':e.a.attendance==='present');
      return {id:p.user_id,name:p.name,role:p.role,squad:game.squads.ownSquad(p.user_id)?.name||null,tasks:tasks.length,submitted:tasks.filter(e=>e.a.submitted_at).length,validated:tasks.filter(e=>e.a.progress==='accepted').length,onTime:tasks.filter(e=>e.a.progress==='accepted'&&e.a.submitted_at<=e.a.submitted_due_at).length,overdue:tasks.filter(e=>e.item.due_at<now&&['pending','changes'].includes(e.a.progress)).length,trainings:trainings.length,declared:trainings.filter(e=>e.a.attendance==='declared').length,present:trainings.filter(e=>e.a.attendance==='present').length,confirmed:trainings.filter(e=>e.a.rsvp==='confirmed').length,matured:ended.length,fulfilled:done.length,participation:ended.length?Math.round(done.length/ended.length*100):null};
    }),definition:'Compromissos cumpridos = entregas validadas e presenças confirmadas pela gestão, entre compromissos com prazo encerrado.'};
  };
  const remind=()=>{
    reconcile();let emitted=0,now=clock();
    for(const item of db.prepare("SELECT * FROM academy_agenda_item WHERE status='active'").all()){
      const reference=Date.parse(item.kind==='task'?item.due_at:item.start_at),remaining=reference-now;
      const phase=remaining>0&&remaining<=900000?'15m':remaining>0&&remaining<=86400000?'24h':item.kind==='task'&&remaining<=0?'overdue':null;if(!phase)continue;
      for(const a of members(item).filter(a=>a.active&&eligible(item,readProfile(db,a.user_id))&&!(item.kind==='task'&&a.progress==='accepted')))emitted+=game.squads.notify(a.user_id,'agenda-reminder:'+item.id+':'+item.revision+':'+phase,phase==='overdue'?'Prazo encerrado':item.kind==='task'?'Sua entrega está chegando':'Seu treinamento está chegando',item.title,'#agenda/'+item.id).changes;
    }return {emitted};
  };
  const importMeeting=(id,google)=>{
    const item=row(id);if(!item||item.kind!=='training')return false;
    if(google.status==='cancelled'){if(item.status==='active'){db.prepare("UPDATE academy_agenda_item SET status='cancelled',revision=revision+1,updated_at=? WHERE id=?").run(new Date(clock()).toISOString(),id);for(const a of members(item).filter(a=>a.active))game.squads.notify(a.user_id,'agenda-google-cancel:'+id,'Treinamento cancelado no Google',item.title,'#agenda/'+id);}return true;}
    if(!google.start?.dateTime||!google.end?.dateTime)return false;
    const start=date(google.start.dateTime,'o início'),end=date(google.end.dateTime,'o fim'),title=text(google.summary||item.title,120,'Título'),location=text(google.location||'',160,'Local');
    if(title.length<3||end<=start||Date.parse(end)-Date.parse(start)>86400000*30)return false;
    if(start!==item.start_at||end!==item.end_at||title!==item.title||location!==item.location){db.prepare('UPDATE academy_agenda_item SET title=?,location=?,start_at=?,end_at=?,due_at=?,revision=revision+1,updated_at=? WHERE id=?').run(title,location,start,end,end,new Date(clock()).toISOString(),id);for(const a of members(item).filter(a=>a.active))game.squads.notify(a.user_id,'agenda-google-change:'+id+':'+(item.revision+1),'Horário atualizado no Google',title,'#agenda/'+id);access.audit(item.creator_id,id,'agenda.google.updated',null,{revision:item.revision+1});}
    for(const a of members(item)){const guest=google.attendees?.find(g=>g.email?.toLowerCase()===a.email.toLowerCase()),rsvp=({accepted:'confirmed',declined:'declined',tentative:'tentative',needsAction:'needs_action'})[guest?.responseStatus];if(rsvp&&a.rsvp!==rsvp)db.prepare("UPDATE academy_agenda_assignment SET rsvp=?,rsvp_source='google',revision=revision+1 WHERE item_id=? AND user_id=?").run(rsvp,id,a.user_id);}
    return true;
  };
  const ics=(viewer,id)=>{
    const item=detail(viewer,id),escape=v=>String(v).replace(/\\/g,'\\\\').replace(/\r?\n/g,'\\n').replace(/[,;]/g,m=>'\\'+m),stamp=v=>new Date(v).toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z');
    return ['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//ST1 Academy//Agenda//PT-BR','CALSCALE:GREGORIAN','BEGIN:VEVENT','UID:'+id+'@st1-academy','DTSTAMP:'+stamp(clock()),'DTSTART:'+stamp(item.kind==='task'?Date.parse(item.dueAt)-900000:item.startAt),'DTEND:'+stamp(item.kind==='task'?item.dueAt:item.endAt),'SUMMARY:'+escape(item.title),'DESCRIPTION:'+escape(item.description),...(item.location?['LOCATION:'+escape(item.location)]:[]),...(item.status==='cancelled'?['STATUS:CANCELLED']:[]),'END:VEVENT','END:VCALENDAR',''].join('\r\n');
  };
  return {row,members,eligible,choices,detail,list,save,respond,submit,review,report,remind,reconcile,importMeeting,ics,canTarget,manageable};
}
