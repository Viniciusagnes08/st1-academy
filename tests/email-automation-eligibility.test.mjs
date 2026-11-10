import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {createEmailAutomationEligibility} from '../lib/email-automation-eligibility.mjs';

function fixture(){
  const db=new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE user(id TEXT PRIMARY KEY,name TEXT,email TEXT);
    CREATE TABLE academy_member(user_id TEXT PRIMARY KEY,role TEXT,tracks_json TEXT,permissions_json TEXT,enabled INTEGER);
    CREATE TABLE academy_email_optout(user_id TEXT PRIMARY KEY,created_at TEXT);
    CREATE TABLE academy_campaign_optout(user_id TEXT PRIMARY KEY,created_at TEXT);
    CREATE TABLE academy_study_day(user_id TEXT,day TEXT,active_seconds REAL);
    CREATE TABLE academy_attempt(user_id TEXT,status TEXT,finished_at TEXT);
    CREATE TABLE academy_quiz_attempt(user_id TEXT,status TEXT,finished_at TEXT,answers_json TEXT,quiz_id TEXT);
    CREATE TABLE academy_material_study(user_id TEXT,content_id TEXT,completed_at TEXT,last_studied_at TEXT);
    CREATE TABLE academy_content(id TEXT PRIMARY KEY,title TEXT,summary TEXT,status TEXT,deleted_at TEXT,modules_json TEXT,tracks_json TEXT,audience_json TEXT);
    CREATE TABLE academy_module(id TEXT PRIMARY KEY,title TEXT,description TEXT,tracks_json TEXT,audience_json TEXT,status TEXT);
    CREATE TABLE academy_access_audit(id TEXT,subject_id TEXT,action TEXT,after_json TEXT,before_json TEXT,created_at TEXT);
    CREATE TABLE academy_agenda_item(id TEXT,kind TEXT,status TEXT,deleted_at TEXT,created_at TEXT,due_at TEXT,title TEXT,content_id TEXT,revision INTEGER);
    CREATE TABLE academy_agenda_assignment(item_id TEXT,user_id TEXT,active INTEGER,progress TEXT);
    CREATE TABLE academy_certificate(user_id TEXT,track_id TEXT,issued_at TEXT);
    CREATE TABLE academy_email_feedback(user_id TEXT,track_id TEXT);
    CREATE TABLE academy_email_job(id TEXT,user_id TEXT,automation_key TEXT,status TEXT,accepted_at TEXT,entity_key TEXT);
    CREATE TABLE academy_email_editorial_event(id TEXT,kind TEXT,content_id TEXT,title TEXT,summary TEXT,situation TEXT,challenge TEXT,created_by TEXT,created_at TEXT);
    INSERT INTO user VALUES('admin','Admin ST1','admin@example.test'),('seller','Ana Silva','ana@example.test'),('seller-2','Bruno Lima','bruno@example.test');
    INSERT INTO academy_member VALUES('admin','admin','[]','["materials","assessments","conquests"]',1),('seller','seller','["pap","digital"]','["materials","assessments","conquests"]',1),('seller-2','seller','["pap","digital"]','["materials","assessments","conquests"]',1);
    INSERT INTO academy_content VALUES('base','Processo de abordagem','Como conduzir uma abordagem consultiva.','published',NULL,'["module-pap"]','["pap"]','["seller"]');
    INSERT INTO academy_content VALUES('digital-lesson','Diagnóstico Digital','Como diagnosticar uma necessidade digital.','published',NULL,'[]','["digital"]','["seller"]');
    INSERT INTO academy_module VALUES('module-pap','Módulo de abordagem','Pratique o diagnóstico e conduza a conversa com clareza.','["pap"]','["seller"]','published');
    INSERT INTO academy_material_study VALUES('seller','base','2026-11-10T15:30:00.000Z','2026-11-10T15:30:00.000Z');
    INSERT INTO academy_material_study VALUES('seller','digital-lesson','2026-11-12T15:00:00.000Z','2026-11-12T15:00:00.000Z');
    INSERT INTO academy_material_study VALUES('seller-2','digital-lesson','2026-11-12T15:00:00.000Z','2026-11-12T15:00:00.000Z');
    INSERT INTO academy_email_job VALUES('completed-track','seller','track_complete','accepted','2026-11-13T15:00:00.000Z','track:digital:flow:flow-digital:r1');
    INSERT INTO academy_access_audit VALUES('module-event','module-pap','module.created','{"id":"module-pap","title":"Módulo de abordagem","description":"Pratique o diagnóstico e conduza a conversa com clareza.","tracks":["pap"],"audience":["seller"],"status":"published"}',NULL,'2026-11-11T15:00:00.000Z');
    INSERT INTO academy_email_editorial_event VALUES('update-event','content_update','base','Processo de abordagem','O fluxo de qualificação foi atualizado.','Use ao identificar mais de uma necessidade no primeiro contato.','','admin','2026-11-11T16:00:00.000Z');
    INSERT INTO academy_email_editorial_event VALUES('challenge-event','practical_challenge','base','Simulação de diagnóstico','','','Faça uma simulação com um colega, registre as perguntas de diagnóstico e compare o encaminhamento com o processo publicado.','admin','2026-11-11T17:00:00.000Z');
    INSERT INTO academy_agenda_item VALUES('task-1','task','active',NULL,'2026-11-20T15:00:00.000Z','2026-12-04T15:00:00.000Z','Aplicar a abordagem em campo','base',1);
    INSERT INTO academy_agenda_assignment VALUES('task-1','seller',1,'pending');`);
  const flowPap={id:'flow-pap',trackId:'pap',title:'Trilha PAP',revision:1,summary:{percent:50,completed:1,total:2},edges:[{from:'start',to:'base-node'},{from:'base-node',to:'next-node'}],nodes:[{id:'start',kind:'start',title:'Início',completed:true,locked:false,required:false},{id:'base-node',kind:'material',title:'Processo de abordagem',targetId:'base',completed:true,locked:false,required:true,href:'#material/base'},{id:'next-node',kind:'material',title:'Simulação prática',targetId:'next-content',completed:false,locked:false,required:true,href:'#material/next-content'}]};
  const flowDigital={id:'flow-digital',trackId:'digital',title:'Trilha Digital',revision:1,summary:{percent:100,completed:1,total:1},edges:[{from:'start-d',to:'done-d'}],nodes:[{id:'start-d',kind:'start',title:'Início',completed:true,locked:false,required:false},{id:'done-d',kind:'material',title:'Diagnóstico Digital',targetId:'digital-lesson',completed:true,locked:false,required:true,href:'#material/digital-lesson'}]};
  const flows=[flowPap,flowDigital],context={learningFlows:{list:(_,userId)=>({items:flows.map(flow=>({id:flow.id,title:flow.title,trackId:flow.trackId}))}),get:(_,id)=>flows.find(flow=>flow.id===id)}};
  const eligibility=createEmailAutomationEligibility(db,{context,baseURL:'https://st1academy.tech',clock:()=> '2026-12-01T15:00:00.000Z'});
  return {db,eligibility,flows};
}

test('gatilhos de módulo e de curadoria usam publicação e estudos reais',()=>{
  const {db,eligibility}=fixture();
  try{
    const activated='2026-11-01T00:00:00.000Z';
    const complete=eligibility.forKey('module_complete',activated);
    assert.equal(complete.length,1);assert.equal(complete[0].values.modulo,'Módulo de abordagem');
    const trackComplete=eligibility.forKey('track_complete',activated);
    assert.equal(trackComplete.length,2);assert.equal(new Set(trackComplete.map(item=>item.entityKey)).size,2);
    const unlocked=eligibility.forKey('module_unlocked',activated);
    assert.equal(unlocked.length,2);assert.equal(unlocked.find(item=>item.user.user_id==='seller').values.objetivo_pratico,'Pratique o diagnóstico e conduza a conversa com clareza.');
    const update=eligibility.forKey('content_update',activated);
    assert.equal(update.length,2);assert.equal(new Set(update.map(item=>item.entityKey)).size,2);assert.equal(update.find(item=>item.user.user_id==='seller').values.resumo_da_mudanca,'O fluxo de qualificação foi atualizado.');
    const challenge=eligibility.forKey('practical_challenge',activated);
    assert.equal(challenge.length,1);assert.match(challenge[0].values.desafio_pratico,/Simulação de diagnóstico/);
  }finally{db.close();}
});

test('prazo, Academy Wrapped e feedback esperam datas e eventos reais',()=>{
  const {db,eligibility}=fixture();
  try{
    const activated='2026-11-01T00:00:00.000Z';
    const deadline=eligibility.forKey('deadline_3d',activated);
    assert.equal(deadline.length,1);assert.equal(deadline[0].values.progresso_percentual,50);assert.equal(deadline[0].values.proxima_etapa,'Simulação prática');
    const wrapped=eligibility.forKey('monthly_wrapped',activated);
    assert.equal(wrapped.length,2);const anaWrapped=wrapped.find(item=>item.user.user_id==='seller');assert.equal(anaWrapped.values.aulas_concluidas_mes,'2');assert.equal(anaWrapped.values.modulos_concluidos_mes,'1');assert.equal(anaWrapped.values.mes,'novembro');
    const feedback=eligibility.forKey('post_track_feedback',activated);
    assert.equal(feedback.length,1);assert.equal(feedback[0].values.trilha,'Trilha Digital');assert.equal(feedback[0].target,'https://st1academy.tech/api/email-automations/feedback');
  }finally{db.close();}
});

