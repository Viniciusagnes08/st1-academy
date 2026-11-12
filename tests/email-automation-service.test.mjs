import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {createEmailAutomationService} from '../lib/email-automation-service.mjs';

test('boas-vindas só são enviadas a novos membros elegíveis uma vez',async()=>{
  const db=new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE user(id TEXT PRIMARY KEY,name TEXT,email TEXT);
    CREATE TABLE academy_member(user_id TEXT PRIMARY KEY,role TEXT,tracks_json TEXT,permissions_json TEXT NOT NULL DEFAULT '["materials","assessments","conquests"]',enabled INTEGER);
    CREATE TABLE academy_onboarding(user_id TEXT PRIMARY KEY,completed_at TEXT);
    CREATE TABLE academy_campaign_optout(user_id TEXT PRIMARY KEY,created_at TEXT);
    CREATE TABLE academy_learning_flow(id TEXT PRIMARY KEY,track_id TEXT,title TEXT,nodes_json TEXT,audience_json TEXT,status TEXT);
    CREATE TABLE academy_certificate(id TEXT PRIMARY KEY,user_id TEXT,track_id TEXT,issued_at TEXT);
    INSERT INTO academy_learning_flow VALUES('flow','pap','PAP','[{"kind":"start","title":"Início"},{"kind":"material","title":"Primeira aula","targetId":"lesson"}]','["seller"]','published');
    INSERT INTO user VALUES('old','Antiga Pessoa','old@example.test');
    INSERT INTO academy_member(user_id,role,tracks_json,enabled) VALUES('old','seller','["pap"]',1);
    INSERT INTO academy_onboarding VALUES('old','2026-11-09T00:00:00.000Z');`);
  let time='2026-11-10T14:00:00.000Z';const sent=[];
  const service=createEmailAutomationService(db,{baseURL:'https://st1academy.tech',clock:()=>time,env:{ACADEMY_MAIL_FROM:'academy@example.test'},mailerTransport:{async sendMail(message){sent.push(message);return {messageId:'smtp-1',rejected:[]};}}});
  try{
    assert.equal(service.list().items.length,20);
    for(const item of service.list().items)if(item.key!=='welcome')service.pause(item.key);
    service.activate('welcome');
    assert.deepEqual(await service.tick(),{queued:0,accepted:0,failed:0});
    db.exec(`INSERT INTO user VALUES('new','Ana Silva','ana@example.test');INSERT INTO academy_member(user_id,role,tracks_json,enabled) VALUES('new','seller','["pap"]',1);INSERT INTO academy_onboarding VALUES('new','2026-11-10T15:00:00.000Z');`);
    time='2026-11-10T15:01:00.000Z';
    assert.deepEqual(await service.tick(),{queued:1,accepted:1,failed:0});
    assert.match(sent[0].subject,/Ana/);assert.match(sent[0].html,/Primeira aula/);
    assert.equal(sent[0].to,'ana@example.test');
    assert.deepEqual(await service.tick(),{queued:0,accepted:0,failed:0});
    const token=db.prepare("SELECT token FROM academy_email_job WHERE user_id='new'").get().token;
    assert.equal(service.optout(token),true);
    assert.equal(db.prepare("SELECT count(*) n FROM academy_email_optout WHERE user_id='new'").get().n,1);
    assert.equal(db.prepare("SELECT count(*) n FROM academy_campaign_optout WHERE user_id='new'").get().n,1);
  }finally{db.close();}
});

test('certificado emitido após ativação gera apenas um e-mail para titular habilitado',async()=>{
  const db=new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE user(id TEXT PRIMARY KEY,name TEXT,email TEXT);
    CREATE TABLE academy_member(user_id TEXT PRIMARY KEY,role TEXT,tracks_json TEXT,permissions_json TEXT NOT NULL DEFAULT '["materials","assessments","conquests"]',enabled INTEGER);
    CREATE TABLE academy_onboarding(user_id TEXT PRIMARY KEY,completed_at TEXT);
    CREATE TABLE academy_campaign_optout(user_id TEXT PRIMARY KEY,created_at TEXT);
    CREATE TABLE academy_learning_flow(id TEXT PRIMARY KEY,track_id TEXT,title TEXT,nodes_json TEXT,audience_json TEXT,status TEXT,updated_at TEXT);
    CREATE TABLE academy_certificate(id TEXT PRIMARY KEY,user_id TEXT,track_id TEXT,issued_at TEXT);
    INSERT INTO user VALUES('a','Ana Silva','ana@example.test');
    INSERT INTO academy_member(user_id,role,tracks_json,enabled) VALUES('a','seller','["pap"]',1);
    INSERT INTO academy_learning_flow VALUES('f','pap','Trilha PAP','[]','["seller"]','published','2026-11-09');
    INSERT INTO academy_certificate VALUES('old','a','pap','2026-11-09T00:00:00.000Z');`);
  let time='2026-11-10T14:00:00.000Z';const sent=[];
  const service=createEmailAutomationService(db,{baseURL:'https://st1academy.tech',clock:()=>time,env:{ACADEMY_MAIL_FROM:'academy@example.test'},mailerTransport:{async sendMail(message){sent.push(message);return {messageId:'smtp-2',rejected:[]};}}});
  try{
    for(const item of service.list().items)if(item.key!=='certificate_available')service.pause(item.key);
    service.activate('certificate_available');
    assert.deepEqual(await service.tick(),{queued:0,accepted:0,failed:0});
    db.exec("INSERT INTO academy_certificate VALUES('new','a','pap','2026-11-10T15:00:00.000Z')");time='2026-11-10T15:01:00.000Z';
    assert.deepEqual(await service.tick(),{queued:1,accepted:1,failed:0});
    assert.match(sent[0].text,/Trilha PAP/);assert.match(sent[0].text,/certificates\/new\/pdf/);
    assert.deepEqual(await service.tick(),{queued:0,accepted:0,failed:0});
    db.exec("UPDATE academy_member SET enabled=0 WHERE user_id='a'");
    db.exec("INSERT INTO academy_certificate VALUES('later','a','pap','2026-11-10T16:00:00.000Z')");time='2026-11-10T16:01:00.000Z';
    assert.deepEqual(await service.tick(),{queued:0,accepted:0,failed:0});
  }finally{db.close();}
});

test('SMTP configurado ativa as vinte automações uma vez e preserva pausas do Admin após reiniciar',()=>{
  const db=new DatabaseSync(':memory:');
  const options={baseURL:'https://st1academy.tech',env:{ACADEMY_MAIL_FROM:'academy@example.test'},mailerTransport:{async sendMail(){return {messageId:'smtp',rejected:[]};}}};
  try{
    const first=createEmailAutomationService(db,options);
    assert.equal(first.list().smtpReady,true);
    assert.equal(first.list().items.filter(item=>item.status==='active').length,20);
    first.pause('welcome');
    const restarted=createEmailAutomationService(db,options);
    assert.equal(restarted.list().items.find(item=>item.key==='welcome').status,'paused');
    assert.equal(restarted.list().items.filter(item=>item.status==='active').length,19);
  }finally{db.close();}
});

test('lista de automações contabiliza só mensagens que chegaram à tentativa de envio',()=>{
  const db=new DatabaseSync(':memory:');
  const service=createEmailAutomationService(db,{baseURL:'https://st1academy.tech'});
  try{
    const insert=db.prepare('INSERT INTO academy_email_job(id,automation_key,user_id,entity_key,scheduled_at,status,token,created_at) VALUES(?,?,?,?,?,?,?,?)');
    for(const status of ['accepted','failed','unknown','sending','pending','skipped'])insert.run(`job-${status}`,'welcome','u',`entity-${status}`,'2026-11-12T10:00:00.000Z',status,`token-${status}`,'2026-11-12T10:00:00.000Z');
    const item=service.list().items.find(row=>row.key==='welcome');
    assert.deepEqual({accepted:item.accepted,failed:item.failed,unknown:item.unknown,inProgress:item.inProgress,pending:item.pending,attempted:item.attempted},{accepted:1,failed:1,unknown:1,inProgress:1,pending:1,attempted:4});
  }finally{db.close();}
});

test('Admin personaliza uma automação no banco e pode restaurar o modelo oficial',()=>{
  const db=new DatabaseSync(':memory:');
  const service=createEmailAutomationService(db,{baseURL:'https://st1academy.tech',clock:()=> '2026-11-12T10:00:00.000Z'});
  try{
    const original=service.list().items.find(item=>item.key==='welcome');
    const saved=service.save('admin','welcome',{title:'Boas-vindas personalizadas',subject:`${original.subject} · ST1`,preheader:original.preheader,body:`${original.body}\n\nConteúdo personalizado para o time.`,ctaLabel:original.ctaLabel});
    assert.equal(saved.customized,true);assert.equal(saved.title,'Boas-vindas personalizadas');assert.match(saved.subject,/ST1$/);
    const persisted=service.list().items.find(item=>item.key==='welcome');assert.equal(persisted.body,saved.body);assert.equal(persisted.updatedAt,'2026-11-12T10:00:00.000Z');
    const restored=service.restore('welcome');assert.equal(restored.customized,false);assert.equal(restored.title,original.title);assert.equal(db.prepare('SELECT count(*) n FROM academy_email_automation_override').get().n,0);
  }finally{db.close();}
});

test('avisos editoriais exigem conteúdo publicado e o feedback privado só é aceito uma vez',()=>{
  const db=new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE user(id TEXT PRIMARY KEY,name TEXT,email TEXT);
    CREATE TABLE academy_content(id TEXT PRIMARY KEY,title TEXT,summary TEXT,status TEXT,deleted_at TEXT,tracks_json TEXT,audience_json TEXT);
    CREATE TABLE academy_learning_flow(id TEXT,track_id TEXT,title TEXT,status TEXT,updated_at TEXT);
    INSERT INTO user VALUES('u','Ana Silva','ana@example.test');
    INSERT INTO academy_content VALUES('content','Abordagem consultiva','Resumo real do conteúdo.','published',NULL,'["pap"]','["seller"]');
    INSERT INTO academy_learning_flow VALUES('flow','pap','Trilha PAP','published','2026-11-10');`);
  const service=createEmailAutomationService(db,{baseURL:'https://st1academy.tech',env:{ACADEMY_MAIL_FROM:'academy@example.test'},mailerTransport:{async sendMail(){return {messageId:'smtp',rejected:[]};}}});
  try{
    const update=service.createEditorialEvent('admin',{kind:'content_update',contentId:'content',summary:'Atualizamos a sequência de diagnóstico.',situation:'Use quando houver mais de uma necessidade.'});
    const challenge=service.createEditorialEvent('admin',{kind:'practical_challenge',contentId:'content',title:'Treino de diagnóstico',challenge:'Simule uma conversa e registre as perguntas usadas.'});
    assert.equal(service.editorialCatalog().events.length,2);assert.equal(update.kind,'content_update');assert.equal(challenge.title,'Treino de diagnóstico');
    assert.throws(()=>service.createEditorialEvent('admin',{kind:'content_update',contentId:'rascunho',summary:'Uma alteração importante',situation:'Uma situação prática.'}),/conteúdo publicado/);
    const jobId='feedback-job',feedbackToken='a'.repeat(48);
    db.prepare('INSERT INTO academy_email_job(id,automation_key,user_id,entity_key,scheduled_at,status,token,accepted_at,created_at) VALUES(?,?,?,?,?,?,?,?,?)').run(jobId,'post_track_feedback','u','feedback:u:pap','2026-11-10','accepted',feedbackToken,'2026-11-10','2026-11-10');
    db.prepare('INSERT INTO academy_email_feedback_request(job_id,user_id,track_id,completion_job_id,created_at) VALUES(?,?,?,?,?)').run(jobId,'u','pap','track-job','2026-11-10');
    assert.deepEqual(service.feedbackRequest(feedbackToken),{track:'Trilha PAP',answered:false});
    service.submitFeedback(feedbackToken,{useful:'O roteiro ajudou a fazer perguntas melhores.',unclear:'Ficou confusa a parte de objeções.',improve:'Inclua mais exemplos de conversas reais.'});
    assert.deepEqual(service.feedbackRequest(feedbackToken),{track:'Trilha PAP',answered:true});
    assert.equal(service.feedbackResults().total,1);assert.throws(()=>service.submitFeedback(feedbackToken,{useful:'Outra resposta',unclear:'Outra resposta',improve:'Outra resposta'}),/já foi enviado/);
  }finally{db.close();}
});


