import {randomUUID,createHash} from 'node:crypto';

const fail=(message,status=400)=>Object.assign(new Error(message),{status});
const text=(value,max,label)=>{if(typeof value!=='string'||!value.trim()||value.length>max||/[\x00-\x1f]/.test(value))throw fail(`${label} inválido.`);return value.trim();};
const types=['catalogo_oficial','processo_aprovado','manual_interno','material_externo_licenciado'];
const businessDate=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo'}).format(new Date());
const states=['legacy_unreviewed','review_due','pending_review','approved','blocked'];
const date=value=>{if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(Date.parse(value))||new Date(value).toISOString().slice(0,10)!==value)throw fail('Data de revisão inválida.');return value;};
const sourceInput=input=>{
  const value={title:text(input.title,180,'Título'),type:input.type,reference:text(input.reference,600,'Referência'),version:text(input.version,80,'Versão')};
  if(!types.includes(value.type))throw fail('Tipo de fonte inválido.');
  let url;try{url=new URL(value.reference);}catch{throw fail('Use uma referência HTTPS sem credenciais.');}
  if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash)throw fail('Use uma referência HTTPS sem credenciais, parâmetros ou fragmentos.');
  return value;
};

// Only experimental tables are written. Existing content and all learning records are read-only.
export function createM24Governance(db){
  db.exec(`CREATE TABLE IF NOT EXISTS academy_m24_source(id TEXT PRIMARY KEY,title TEXT NOT NULL,type TEXT NOT NULL,reference TEXT NOT NULL,version TEXT NOT NULL,revision INTEGER NOT NULL DEFAULT 0,created_by TEXT NOT NULL,updated_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS academy_m24_governance(content_id TEXT PRIMARY KEY,revision INTEGER NOT NULL,content_revision INTEGER NOT NULL,curator TEXT NOT NULL,criticality TEXT NOT NULL,sources_json TEXT NOT NULL,state TEXT NOT NULL,next_review_on TEXT NOT NULL,reviewed_at TEXT,updated_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS academy_m24_event(id TEXT PRIMARY KEY,content_id TEXT NOT NULL,actor_id TEXT NOT NULL,revision INTEGER NOT NULL,action TEXT NOT NULL,reason TEXT NOT NULL,before_json TEXT,after_json TEXT NOT NULL,created_at TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS academy_m24_event_content_idx ON academy_m24_event(content_id,created_at);
    CREATE TABLE IF NOT EXISTS academy_m24_request(id TEXT PRIMARY KEY,fingerprint TEXT NOT NULL,response_json TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS academy_m24_source_event(id TEXT PRIMARY KEY,source_id TEXT NOT NULL,actor_id TEXT NOT NULL,before_json TEXT,after_json TEXT NOT NULL,created_at TEXT NOT NULL);`);
  const transaction=fn=>{db.exec('BEGIN IMMEDIATE');try{const result=fn();db.exec('COMMIT');return result;}catch(error){db.exec('ROLLBACK');throw error;}};
  const sources=()=>db.prepare('SELECT * FROM academy_m24_source ORDER BY title').all();
  const source=id=>db.prepare('SELECT * FROM academy_m24_source WHERE id=?').get(id);
  const content=id=>{const row=db.prepare('SELECT id,title,revision,status,scope,tracks_json FROM academy_content WHERE id=? AND deleted_at IS NULL').get(id);if(!row)throw fail('Conteúdo não encontrado.',404);return row;};
  const raw=id=>db.prepare('SELECT * FROM academy_m24_governance WHERE content_id=?').get(id);
  const serialize=(c,g)=>{
    const links=g?JSON.parse(g.sources_json):[];
    let effectiveState=g?.state||'legacy_unreviewed';
    if(effectiveState==='approved'&&(g.content_revision!==c.revision||g.next_review_on<=businessDate()||links.some(link=>source(link.id)?.revision!==link.revision)))effectiveState='review_due';
    return {contentId:c.id,title:c.title,publication:c.status,scope:c.scope,tracks:JSON.parse(c.tracks_json),contentRevision:c.revision,reviewedContentRevision:g?.content_revision??null,revision:g?.revision??0,curator:g?.curator||'',criticality:g?.criticality||'normal',state:g?.state||'legacy_unreviewed',effectiveState,nextReviewOn:g?.next_review_on||'',reviewedAt:g?.reviewed_at||null,sources:links.map(link=>({...link,current:source(link.id)||null}))};
  };
  const detail=id=>({...serialize(content(id),raw(id)),history:db.prepare('SELECT id,actor_id,action,reason,before_json,after_json,created_at FROM academy_m24_event WHERE content_id=? ORDER BY revision,id').all(id).map(e=>({...e,before:e.before_json?JSON.parse(e.before_json):null,after:JSON.parse(e.after_json),before_json:undefined,after_json:undefined}))});
  const inventory=(filters={})=>{
    const limit=Number(filters.limit??50),offset=Number(filters.offset??0);
    if(!Number.isInteger(limit)||limit<1||limit>100||!Number.isInteger(offset)||offset<0||offset>100000)throw fail('Paginação inválida.');
    if(filters.state&&!states.includes(filters.state))throw fail('Status inválido.');
    const search=String(filters.search||'').toLowerCase().slice(0,180);
    const all=db.prepare('SELECT id,title,revision,status,scope,tracks_json FROM academy_content WHERE deleted_at IS NULL ORDER BY title,id').all().map(c=>serialize(c,raw(c.id)));
    const items=all.filter(c=>(!search||c.title.toLowerCase().includes(search))&&(!filters.state||c.effectiveState===filters.state));
    return {items:items.slice(offset,offset+limit),total:items.length,limit,offset,counts:Object.fromEntries(states.map(s=>[s,all.filter(c=>c.effectiveState===s).length]))};
  };
  const sourceAudit=(actor,id,before,after)=>db.prepare('INSERT INTO academy_m24_source_event(id,source_id,actor_id,before_json,after_json,created_at) VALUES(?,?,?,?,?,?)').run(randomUUID(),id,actor,before?JSON.stringify(before):null,JSON.stringify(after),new Date().toISOString());
  const createSource=(actor,input)=>transaction(()=>{
    const v=sourceInput(input),id=randomUUID();
    db.prepare('INSERT INTO academy_m24_source(id,title,type,reference,version,created_by,updated_at) VALUES(?,?,?,?,?,?,?)').run(id,v.title,v.type,v.reference,v.version,actor,new Date().toISOString());
    const result=source(id);sourceAudit(actor,id,null,result);return result;
  });
  const updateSource=(actor,id,input)=>transaction(()=>{
    const before=source(id);if(!before)throw fail('Fonte não encontrada.',404);const v=sourceInput(input);
    if(!Number.isInteger(input.revision)||input.revision!==before.revision)throw fail('Fonte alterada. Reabra para continuar.',409);
    const changed=db.prepare('UPDATE academy_m24_source SET title=?,type=?,reference=?,version=?,revision=revision+1,updated_at=? WHERE id=? AND revision=?').run(v.title,v.type,v.reference,v.version,new Date().toISOString(),id,input.revision);
    if(changed.changes!==1)throw fail('Fonte alterada. Reabra para continuar.',409);
    const result=source(id);sourceAudit(actor,id,before,result);return result;
  });
  const check=(id,input)=>{
    const c=content(id),g=raw(id);
    if(!Number.isInteger(input.revision)||input.revision!==(g?.revision??0)||input.contentRevision!==c.revision)throw fail('Conteúdo ou ficha alterado. Reabra para continuar.',409);
    return {c,g};
  };
  const event=(actor,id,action,reason,before,after)=>db.prepare('INSERT INTO academy_m24_event(id,content_id,actor_id,revision,action,reason,before_json,after_json,created_at) VALUES(?,?,?,?,?,?,?,?,?)').run(randomUUID(),id,actor,after.revision,action,reason,before?JSON.stringify(before):null,JSON.stringify(after),new Date().toISOString());
  const save=(actor,id,input)=>transaction(()=>{
    const {c,g}=check(id,input),curator=text(input.curator,120,'Curador'),next=date(input.nextReviewOn);
    if(!['normal','comercial_critico'].includes(input.criticality))throw fail('Criticidade inválida.');
    if(!Array.isArray(input.sourceIds)||input.sourceIds.length<1||input.sourceIds.length>20||new Set(input.sourceIds).size!==input.sourceIds.length)throw fail('Selecione de 1 a 20 fontes distintas.');
    const links=input.sourceIds.map(id=>{const s=typeof id==='string'?source(id):null;if(!s)throw fail('Fonte inválida.');return {id:s.id,revision:s.revision,version:s.version};});
    // Metadata edits never implicitly unblock an explicitly blocked item.
    const state=g?.state==='blocked'?'blocked':'review_due',values=[c.revision,curator,input.criticality,JSON.stringify(links),state,next,new Date().toISOString()];
    if(g){const changed=db.prepare('UPDATE academy_m24_governance SET content_revision=?,curator=?,criticality=?,sources_json=?,state=?,next_review_on=?,updated_at=?,revision=revision+1 WHERE content_id=? AND revision=?').run(...values,id,g.revision);if(changed.changes!==1)throw fail('Ficha alterada. Reabra para continuar.',409);}
    else db.prepare('INSERT INTO academy_m24_governance(content_revision,curator,criticality,sources_json,state,next_review_on,updated_at,content_id,revision) VALUES(?,?,?,?,?,?,?,?,1)').run(...values,id);
    event(actor,id,'metadata','Metadados de homologação atualizados',g,raw(id));return detail(id);
  });
  const review=(actor,id,input)=>transaction(()=>{
    const key=text(input.requestKey,100,'Identificador da operação');
    const fingerprint=createHash('sha256').update(JSON.stringify([actor,id,input.action,input.revision,input.contentRevision,input.reason,input.selfReviewReason||''])).digest('hex');
    const prior=db.prepare('SELECT * FROM academy_m24_request WHERE id=?').get(key);
    if(prior){if(prior.fingerprint!==fingerprint)throw fail('Identificador já utilizado em outra operação.',409);return JSON.parse(prior.response_json);}
    const {c,g}=check(id,input),reason=text(input.reason,1000,'Justificativa');
    if(!g)throw fail('Preencha a ficha antes de solicitar revisão.');
    let state;
    if(input.action==='request')state='pending_review';
    else if(input.action==='block')state='blocked';
    else if(['approve','reject'].includes(input.action)){
      if(g.state!=='pending_review')throw fail('Solicite uma revisão antes de decidir.');
      state=input.action==='approve'?'approved':'review_due';
      if(state==='approved'){
        text(input.selfReviewReason,500,'Justificativa da exceção de autorrevisão');
        if(g.content_revision!==c.revision)throw fail('Salve a ficha para a revisão atual antes de aprovar.',409);
        if(g.next_review_on<=businessDate())throw fail('Escolha uma data de próxima revisão futura.');
        if(JSON.parse(g.sources_json).some(link=>source(link.id)?.revision!==link.revision))throw fail('As fontes mudaram. Salve a ficha com as versões atuais.',409);
      }
    }else throw fail('Ação inválida.');
    // Explicit new request refreshes source references only after metadata is saved.
    if(state==='pending_review'&&(g.content_revision!==c.revision||JSON.parse(g.sources_json).some(link=>source(link.id)?.revision!==link.revision)))throw fail('Salve a ficha com a revisão e fontes atuais antes de solicitar.',409);
    const reviewed=state==='approved'?new Date().toISOString():g.reviewed_at;
    const changed=db.prepare('UPDATE academy_m24_governance SET state=?,reviewed_at=?,updated_at=?,revision=revision+1 WHERE content_id=? AND revision=?').run(state,reviewed,new Date().toISOString(),id,g.revision);
    if(changed.changes!==1)throw fail('Ficha alterada. Reabra para continuar.',409);
    event(actor,id,input.action,reason+(input.action==='approve'?' | Exceção de autorrevisão: '+input.selfReviewReason:''),g,raw(id));
    const result=JSON.parse(JSON.stringify(detail(id)));db.prepare('INSERT INTO academy_m24_request(id,fingerprint,response_json) VALUES(?,?,?)').run(key,fingerprint,JSON.stringify(result));return result;
  });
  return {inventory,detail,sources,createSource,updateSource,save,review};
}
