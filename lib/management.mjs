import {randomUUID,createHash} from 'node:crypto';
import {readProfile,hasPermission,hasTrack} from './access.mjs';
import {badgeSvg,recognitionPdf} from './recognition-artifacts.mjs';

export const managementEntities=['events','contents','certificates','badges','squads','tags'];
const tableFor={events:'academy_agenda_item',contents:'academy_content',squads:'academy_squad'};
const labels={events:'Eventos',contents:'Conteúdos',certificates:'Certificados',badges:'Insígnias',squads:'Squads',tags:'Etiquetas'};
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
const clean=(value,max,label)=>{if(typeof value!=='string'||value.length>max||/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(value))throw fail(label+' inválido.');return value.trim();};

export function createManagementService(db,bank,access,contents,agenda,game,{baseURL,testMode=false,renderPdf=recognitionPdf}={}){
  db.exec([
    "CREATE TABLE IF NOT EXISTS academy_design(id TEXT PRIMARY KEY,kind TEXT NOT NULL CHECK(kind IN ('certificates','badges','tags')),payload_json TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'draft',revision INTEGER NOT NULL DEFAULT 0,created_by TEXT NOT NULL REFERENCES user(id),created_at TEXT NOT NULL,updated_at TEXT NOT NULL,deleted_at TEXT,deletion_status TEXT)",
    "CREATE TABLE IF NOT EXISTS academy_resource_tag(entity TEXT NOT NULL,resource_id TEXT NOT NULL,tag_id TEXT NOT NULL REFERENCES academy_design(id),PRIMARY KEY(entity,resource_id,tag_id))",
    "CREATE TABLE IF NOT EXISTS academy_recognition(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES user(id),model_id TEXT NOT NULL REFERENCES academy_design(id),model_revision INTEGER NOT NULL,kind TEXT NOT NULL,name TEXT NOT NULL,title TEXT NOT NULL,snapshot_json TEXT NOT NULL,evidence TEXT NOT NULL,issued_by TEXT NOT NULL REFERENCES user(id),issued_at TEXT NOT NULL,pdf BLOB,pdf_sha256 TEXT,art BLOB,status TEXT NOT NULL DEFAULT 'issued',revision INTEGER NOT NULL DEFAULT 0,revocation_reason TEXT,revoked_at TEXT,shared_squad_id TEXT REFERENCES academy_squad(id),UNIQUE(user_id,model_id,model_revision))",
    'CREATE INDEX IF NOT EXISTS academy_recognition_person ON academy_recognition(user_id,issued_at)'
  ].join(';')+';');
  const admin=viewer=>{if(viewer?.role!=='admin'||viewer.enabled!==1)throw fail('Acesso exclusivo de Admin.',403);};
  const kind=entity=>{if(!managementEntities.includes(entity))throw fail('Cadastro não encontrado.',404);return entity;};
  const designRow=id=>db.prepare('SELECT * FROM academy_design WHERE id=?').get(id);
  const serializeDesign=r=>({...JSON.parse(r.payload_json),id:r.id,status:r.status,revision:r.revision,deletedAt:r.deleted_at,createdAt:r.created_at,updatedAt:r.updated_at});
  const raw=(entity,id)=>tableFor[entity]?db.prepare('SELECT * FROM '+tableFor[entity]+' WHERE id=?').get(id):db.prepare('SELECT * FROM academy_design WHERE id=? AND kind=?').get(id,entity);
  const tagsFor=(entity,id)=>db.prepare("SELECT d.* FROM academy_resource_tag t JOIN academy_design d ON d.id=t.tag_id WHERE t.entity=? AND t.resource_id=? AND d.deleted_at IS NULL AND d.status='active' ORDER BY d.created_at").all(entity,id).map(serializeDesign);
  const tagIds=(entity,id)=>db.prepare('SELECT tag_id FROM academy_resource_tag WHERE entity=? AND resource_id=?').all(entity,id).map(r=>r.tag_id);
  const modelList=entity=>db.prepare('SELECT * FROM academy_design WHERE kind=? ORDER BY updated_at DESC,id').all(entity).map(serializeDesign);
  const eventPayload=r=>({id:r.id,title:r.title,description:r.description,kind:r.kind,startAt:r.start_at,endAt:r.end_at,dueAt:r.due_at,status:r.status,revision:r.revision,deletedAt:r.deleted_at,audience:JSON.parse(r.audience_json),recipientCount:db.prepare('SELECT count(*) n FROM academy_agenda_assignment WHERE item_id=? AND active=1').get(r.id).n,createdAt:r.created_at,updatedAt:r.updated_at});
  const records=entity=>entity==='contents'?contents.list(true):entity==='events'?db.prepare('SELECT * FROM academy_agenda_item ORDER BY start_at DESC,id').all().map(eventPayload):entity==='squads'?game.squads.adminRecords().map(r=>({...r,title:r.name})):modelList(entity);
  const detail=(viewer,entity,id)=>{
    admin(viewer);kind(entity);const r=raw(entity,id);if(!r)throw fail('Cadastro não encontrado.',404);
    const value=entity==='contents'?contents.adminRecord(id):entity==='squads'?{...game.squads.adminRecord(id),title:r.name}:entity==='events'?(r.deleted_at?eventPayload(r):agenda.detail(viewer,id)):serializeDesign(r);
    return {...value,deletedAt:r.deleted_at,tagIds:tagIds(entity,id),tags:tagsFor(entity,id)};
  };
  const list=(viewer,entity,{trash=false}={})=>{
    admin(viewer);kind(entity);return {entity,label:labels[entity],items:records(entity).filter(r=>trash?!!r.deletedAt:!r.deletedAt).map(r=>({...r,tags:tagsFor(entity,r.id)}))};
  };
  const catalog=viewer=>{admin(viewer);return {entities:managementEntities.map(entity=>{const rows=records(entity);return {id:entity,title:labels[entity],count:rows.filter(r=>!r.deletedAt).length,trash:rows.filter(r=>r.deletedAt).length};})};};
  const choices=viewer=>{
    admin(viewer);return {people:access.directory().users.filter(p=>p.enabled),tracks:bank.tracks.map(t=>({id:t.id,name:t.name})),events:db.prepare("SELECT id,title,kind FROM academy_agenda_item WHERE status='active' AND deleted_at IS NULL ORDER BY start_at DESC").all(),badges:modelList('badges').filter(r=>!r.deletedAt&&r.status==='active'),tags:modelList('tags').filter(r=>!r.deletedAt&&r.status==='active')};
  };
  const checkRevision=(r,input)=>{if(!Number.isInteger(input?.revision)||input.revision!==r.revision)throw fail('Este cadastro mudou. Reabra antes de salvar.',409);};
  const validateTags=ids=>{
    if(!Array.isArray(ids)||ids.length>30||ids.some(id=>typeof id!=='string'||!db.prepare("SELECT 1 FROM academy_design WHERE id=? AND kind='tags' AND deleted_at IS NULL AND status='active'").get(id)))throw fail('Escolha etiquetas ativas.');
    return [...new Set(ids)];
  };
  const assign=(entity,id,ids)=>{db.prepare('DELETE FROM academy_resource_tag WHERE entity=? AND resource_id=?').run(entity,id);for(const tagId of ids)db.prepare('INSERT INTO academy_resource_tag(entity,resource_id,tag_id) VALUES(?,?,?)').run(entity,id,tagId);};
  const normalizeDesign=(entity,input,current)=>{
    const allowed=['revision','title','description','color','status','tagIds',...(entity==='badges'?['shape','symbol']:entity==='certificates'?['hours','signature','signatureRole','badgeId','rule','trackId','eventId']:[])];
    if(!input||Object.keys(input).some(k=>!allowed.includes(k)))throw fail('Campos de cadastro inválidos.');
    const value={title:'',description:'',color:'#f77716',status:entity==='tags'?'active':'draft',shape:'shield',symbol:'star',hours:1,signature:'ST1 Academy',signatureRole:'Desenvolvimento do time',badgeId:null,rule:'manual',trackId:null,eventId:null,...(current?serializeDesign(current):{}),...input};
    const title=clean(value.title,100,'Nome');if(title.length<3)throw fail('Use um nome de pelo menos 3 caracteres.');
    const description=clean(value.description,500,'Descrição');if(!/^#[a-f0-9]{6}$/i.test(value.color))throw fail('Escolha uma cor válida.');
    if(!['draft','active','archived'].includes(value.status))throw fail('Situação inválida.');
    const data={title,description,color:value.color};
    if(entity==='tags'){
      const duplicate=db.prepare("SELECT id FROM academy_design WHERE kind='tags' AND deleted_at IS NULL AND lower(json_extract(payload_json,'$.title'))=lower(?) AND id<>?").get(title,current?.id||'');if(duplicate)throw fail('Já existe uma etiqueta com este nome.',409);
    }
    if(entity==='badges'){
      if(!['shield','hexagon','medal'].includes(value.shape)||!['star','trophy','bolt','book'].includes(value.symbol))throw fail('Escolha um formato e um símbolo válidos.');data.shape=value.shape;data.symbol=value.symbol;
    }
    if(entity==='certificates'){
      for(const field of ['badgeId','trackId','eventId'])if(value[field]!==null&&value[field]!==undefined&&typeof value[field]!=='string')throw fail('Vínculo de '+field+' inválido.');
      if(typeof value.hours!=='number'||!Number.isFinite(value.hours)||value.hours<0||value.hours>500)throw fail('A carga horária deve ficar entre 0 e 500 horas.');
      const rule=value.rule;if(!['manual','event_validated','track_certified'].includes(rule))throw fail('Escolha a regra de emissão.');
      if(value.badgeId&&!db.prepare("SELECT 1 FROM academy_design WHERE id=? AND kind='badges' AND deleted_at IS NULL AND status='active'").get(value.badgeId))throw fail('Escolha uma insígnia ativa.');
      if(value.trackId&&!bank.tracks.some(t=>t.id===value.trackId))throw fail('Trilha inválida.');
      if(value.eventId&&!db.prepare("SELECT 1 FROM academy_agenda_item WHERE id=? AND deleted_at IS NULL").get(value.eventId))throw fail('Evento inválido.');
      if(value.status==='active'&&(rule==='track_certified'&&!value.trackId||rule==='event_validated'&&!value.eventId))throw fail('Vincule a trilha ou o evento exigido pela regra de emissão.');
      Object.assign(data,{hours:value.hours,signature:clean(value.signature,80,'Assinatura'),signatureRole:clean(value.signatureRole,80,'Cargo da assinatura'),badgeId:value.badgeId||null,rule,trackId:value.trackId||null,eventId:value.eventId||null});
    }
    return {data,status:value.status};
  };
  const save=(viewer,entity,id,input)=>{
    if(!input||typeof input!=='object'||Array.isArray(input))throw fail('Campos de cadastro inválidos.');
    admin(viewer);kind(entity);const before=id?raw(entity,id):null;if(id&&(!before||before.deleted_at))throw fail('Cadastro não encontrado.',404);if(before)checkRevision(before,input);
    const selected=input.tagIds===undefined?(id?tagIds(entity,id):[]):validateTags(input.tagIds);const payload={...input};delete payload.tagIds;
    let value;
    if(entity==='contents')value=id?contents.update(viewer.user_id,id,payload):contents.create(viewer.user_id,payload);
    else if(entity==='events')value=agenda.save(viewer,payload,id);
    else if(entity==='squads')value=game.squads.save(viewer.user_id,id,payload);
    else{
      const normalized=normalizeDesign(entity,input,before),now=new Date().toISOString();id??=randomUUID();
      if(before)db.prepare('UPDATE academy_design SET payload_json=?,status=?,revision=revision+1,updated_at=? WHERE id=? AND revision=?').run(JSON.stringify(normalized.data),normalized.status,now,id,before.revision);
      else db.prepare('INSERT INTO academy_design(id,kind,payload_json,status,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').run(id,entity,JSON.stringify(normalized.data),normalized.status,viewer.user_id,now,now);
      value=serializeDesign(designRow(id));access.audit(viewer.user_id,id,entity+(before?'.updated':'.created'),before?serializeDesign(before):null,value);
    }
    assign(entity,value.id,selected);return detail(viewer,entity,value.id);
  };
  const setTags=(viewer,entity,id,input)=>{
    admin(viewer);kind(entity);if(entity==='tags')throw fail('Etiquetas não recebem outras etiquetas.');const r=raw(entity,id);if(!r||r.deleted_at)throw fail('Cadastro não encontrado.',404);checkRevision(r,input);
    const selected=validateTags(input.tagIds),before=tagIds(entity,id),table=tableFor[entity]||'academy_design';
    db.exec('BEGIN IMMEDIATE');try{assign(entity,id,selected);db.prepare('UPDATE '+table+' SET revision=revision+1,updated_at=? WHERE id=? AND revision=?').run(new Date().toISOString(),id,r.revision);access.audit(viewer.user_id,id,entity+'.tags.updated',{tagIds:before},{tagIds:selected});db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}
    return detail(viewer,entity,id);
  };
  const remove=(viewer,entity,id,input)=>{
    admin(viewer);kind(entity);const r=raw(entity,id);if(!r||r.deleted_at)throw fail('Cadastro não encontrado.',404);checkRevision(r,input);const table=tableFor[entity]||'academy_design',now=new Date().toISOString();
    if(entity==='events')agenda.save(viewer,{revision:r.revision,status:'cancelled'},id);
    else if(entity==='contents')contents.update(viewer.user_id,id,{revision:r.revision,status:'archived'});
    db.prepare('UPDATE '+table+' SET deleted_at=?,deletion_status=?,status=?,revision=revision+1,updated_at=? WHERE id=?').run(now,r.status,entity==='events'?'cancelled':'archived',now,id);
    access.audit(viewer.user_id,id,entity+'.deleted',{status:r.status,revision:r.revision},{deletedAt:now});return {id,deleted:true};
  };
  const restore=(viewer,entity,id,input)=>{
    admin(viewer);kind(entity);const r=raw(entity,id);if(!r||!r.deleted_at)throw fail('Cadastro não encontrado na lixeira.',404);checkRevision(r,input);const table=tableFor[entity]||'academy_design';
    db.prepare('UPDATE '+table+' SET deleted_at=NULL,status=?,deletion_status=NULL,revision=revision+1,updated_at=? WHERE id=? AND revision=?').run(r.deletion_status||'draft',new Date().toISOString(),id,r.revision);
    access.audit(viewer.user_id,id,entity+'.restored',{deletedAt:r.deleted_at},{status:r.deletion_status});return detail(viewer,entity,id);
  };
  const recognitionRow=id=>db.prepare('SELECT * FROM academy_recognition WHERE id=?').get(id);
  const recognitionPayload=r=>({id:r.id,userId:r.user_id,modelId:r.model_id,kind:r.kind,name:r.name,title:r.title,issuedAt:r.issued_at,status:r.status,revision:r.revision,revokedAt:r.revoked_at,hasPdf:!!r.pdf,pdfSha256:r.pdf_sha256,artUrl:'/api/recognitions/'+r.id+'/art',pdfUrl:r.pdf?'/api/recognitions/'+r.id+'/pdf':null});
  const canReadRecognition=(viewer,r)=>{
    if(viewer?.enabled!==1||!r)return false;
    if(viewer.role==='admin')return true;
    if(readProfile(db,r.user_id)?.enabled!==1)return false;
    const model=JSON.parse(r.snapshot_json).model;
    if(model.rule==='track_certified'&&!hasTrack(viewer,model.trackId))return false;
    if(viewer.user_id===r.user_id)return hasPermission(viewer,'conquests');
    return game.squads.canInspect(viewer,r.user_id)||!!(r.shared_squad_id&&hasPermission(viewer,'conquests')&&hasPermission(viewer,'community')&&game.squads.canRead(viewer,r.shared_squad_id));
  };
  const recognitionDetail=(viewer,id)=>{const r=recognitionRow(id);if(!canReadRecognition(viewer,r)||r.status!=='issued'&&viewer.role!=='admin')throw fail('Conquista não encontrada ou não liberada.',404);return {...recognitionPayload(r),...(viewer.role==='admin'?{evidence:r.evidence,revocationReason:r.revocation_reason}:{})};};
  const recognitions=(viewer,userId=viewer.user_id)=>db.prepare('SELECT * FROM academy_recognition WHERE user_id=? ORDER BY issued_at DESC').all(userId).filter(r=>r.status==='issued'&&canReadRecognition(viewer,r)).map(recognitionPayload);
  const issued=viewer=>{admin(viewer);return {items:db.prepare('SELECT * FROM academy_recognition ORDER BY issued_at DESC').all().map(r=>({...recognitionPayload(r),evidence:r.evidence,revocationReason:r.revocation_reason}))};};
  const proof=(model,userId)=>{
    if(model.rule==='track_certified'&&(!hasTrack(readProfile(db,userId),model.trackId)||!db.prepare('SELECT 1 FROM academy_certificate WHERE user_id=? AND track_id=?').get(userId,model.trackId)))throw fail('A pessoa ainda não tem acesso à certificação da trilha exigida.',409);
    if(model.rule==='event_validated'){
      const a=db.prepare('SELECT a.progress,a.attendance,i.kind,i.status,i.deleted_at FROM academy_agenda_assignment a JOIN academy_agenda_item i ON i.id=a.item_id WHERE a.item_id=? AND a.user_id=? AND a.active=1').get(model.eventId,userId);
      if(!a||a.deleted_at||a.status!=='active'||!(a.kind==='task'?a.progress==='accepted':a.attendance==='present'))throw fail('A entrega ou presença ainda não foi validada pela gestão.',409);
    }
  };
  const issue=async(viewer,entity,id,input)=>{
    admin(viewer);
    if(!input||typeof input!=='object'||Array.isArray(input)||typeof input.userId!=='string')throw fail('Informe uma pessoa para a emissão.');
    if(!['certificates','badges'].includes(entity))throw fail('Escolha um certificado ou uma insígnia.');const row=raw(entity,id);if(!row||row.deleted_at||row.status!=='active')throw fail('Ative o cadastro antes de emitir.',409);checkRevision(row,input);
    const person=readProfile(db,input.userId);if(person?.enabled!==1)throw fail('Escolha uma pessoa ativa.');const evidence=clean(input.evidence,600,'Motivo ou evidência');if(evidence.length<10)throw fail('Registre o motivo ou a evidência da emissão.');
    const existing=db.prepare('SELECT * FROM academy_recognition WHERE user_id=? AND model_id=? AND model_revision=?').get(person.user_id,id,row.revision);if(existing){if(existing.status!=='issued')throw fail('Esta emissão está revogada. Restaure-a ou use uma nova versão do cadastro.',409);return recognitionPayload(existing);}
    const model=serializeDesign(row);if(entity==='certificates')proof(model,person.user_id);
    const linked=model.badgeId?designRow(model.badgeId):null;if(model.badgeId&&(!linked||linked.deleted_at||linked.status!=='active'))throw fail('A insígnia vinculada não está ativa.',409);
    const artModel=entity==='badges'?model:linked?serializeDesign(linked):{title:model.title,color:model.color,shape:'shield',symbol:'star'},issuedAt=new Date().toISOString(),recognitionId=randomUUID();
    const snapshot={id:recognitionId,name:person.name,model,artModel,issuedAt,baseURL,testMode};
    const pdf=entity==='certificates'?await renderPdf(snapshot):null,art=Buffer.from(badgeSvg(artModel),'utf8');
    admin(readProfile(db,viewer.user_id));
    const fresh=raw(entity,id);if(!fresh||fresh.revision!==row.revision||fresh.deleted_at||fresh.status!=='active')throw fail('O cadastro mudou durante a emissão. Reabra e confira.',409);
    if(readProfile(db,input.userId)?.enabled!==1)throw fail('A pessoa não está mais ativa.',409);
    if(linked){const current=designRow(linked.id);if(!current||current.revision!==linked.revision||current.deleted_at||current.status!=='active')throw fail('A insígnia vinculada mudou durante a emissão. Reabra e confira.',409);}
    if(entity==='certificates')proof(model,person.user_id);
    db.exec('BEGIN IMMEDIATE');try{
      const duplicate=db.prepare('SELECT * FROM academy_recognition WHERE user_id=? AND model_id=? AND model_revision=?').get(person.user_id,id,row.revision);if(duplicate){if(duplicate.status!=='issued')throw fail('Esta emissão está revogada. Restaure-a ou use uma nova versão do cadastro.',409);db.exec('COMMIT');return recognitionPayload(duplicate);}
      const recipient=readProfile(db,person.user_id),squad=hasPermission(recipient,'community')&&hasPermission(recipient,'conquests')?game.squads.ownSquad(person.user_id):null;
      db.prepare('INSERT INTO academy_recognition(id,user_id,model_id,model_revision,kind,name,title,snapshot_json,evidence,issued_by,issued_at,pdf,pdf_sha256,art,shared_squad_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(recognitionId,person.user_id,id,row.revision,entity,person.name,model.title,JSON.stringify(snapshot),evidence,viewer.user_id,issuedAt,pdf,pdf?createHash('sha256').update(pdf).digest('hex'):null,art,squad?.id||null);
      access.audit(viewer.user_id,recognitionId,'recognition.issued',null,{userId:person.user_id,modelId:id,modelRevision:row.revision,kind:entity});
      game.squads.notify(person.user_id,'recognition:'+recognitionId,entity==='certificates'?'Novo certificado na Academy':'Nova insígnia na Academy',model.title,'#conquistas');
      if(squad){db.prepare("INSERT INTO academy_message(id,squad_id,user_id,kind,body,event_key,created_at) VALUES(?,?,?,'text',?,?,?)").run(randomUUID(),squad.id,person.user_id,person.name+' conquistou '+model.title+'. Veja a conquista no perfil da pessoa.','recognition:'+recognitionId,issuedAt);for(const member of game.squads.members(squad.id))if(member.enabled===1&&member.id!==person.user_id)game.squads.notify(member.id,'squad-recognition:'+recognitionId,'Uma conquista no seu squad',person.name+' recebeu '+model.title+'.','#perfil/'+person.user_id);}
      db.exec('COMMIT');return recognitionPayload(recognitionRow(recognitionId));
    }catch(e){db.exec('ROLLBACK');throw e;}
  };
  const changeIssue=(viewer,id,input)=>{
    admin(viewer);const r=recognitionRow(id);if(!r)throw fail('Emissão não encontrada.',404);checkRevision(r,input);if(!['issued','revoked'].includes(input.status))throw fail('Situação de emissão inválida.');const reason=clean(input.reason,600,'Motivo');if(reason.length<10)throw fail('Registre o motivo da alteração.');
    db.prepare('UPDATE academy_recognition SET status=?,revocation_reason=?,revoked_at=?,revision=revision+1 WHERE id=? AND revision=?').run(input.status,reason,input.status==='revoked'?new Date().toISOString():null,id,r.revision);access.audit(viewer.user_id,id,'recognition.'+(input.status==='revoked'?'revoked':'restored'),{status:r.status},{status:input.status,reason});return recognitionDetail(viewer,id);
  };
  const artifact=(viewer,id,type)=>{const r=recognitionRow(id);recognitionDetail(viewer,id);const bytes=type==='pdf'?r.pdf:r.art;if(!bytes)throw fail('Arquivo não encontrado.',404);return {bytes:Buffer.from(bytes),mime:type==='pdf'?'application/pdf':'image/svg+xml'};};
  const verify=id=>{const r=recognitionRow(id);if(!r)return null;return {track:r.title,kind:'personalized',issuedAt:r.issued_at,reference:r.id,status:r.status,pdfSha256:r.pdf_sha256,testMode};};
  const preview=(viewer,entity,id)=>{admin(viewer);const model=detail(viewer,entity,id);if(entity!=='badges')throw fail('Prévia não encontrada.',404);return badgeSvg(model);};
  return {catalog,list,detail,choices,save,remove,restore,setTags,tagsFor,issue,issued,recognitions,recognitionDetail,changeIssue,artifact,verify,preview};
}
