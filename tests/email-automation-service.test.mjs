import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {createEmailAutomationService} from '../lib/email-automation-service.mjs';

test('boas-vindas só são enviadas a novos membros elegíveis uma vez',async()=>{
  const db=new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE user(id TEXT PRIMARY KEY,name TEXT,email TEXT);
    CREATE TABLE academy_member(user_id TEXT PRIMARY KEY,role TEXT,tracks_json TEXT,enabled INTEGER);
    CREATE TABLE academy_onboarding(user_id TEXT PRIMARY KEY,completed_at TEXT);
    CREATE TABLE academy_campaign_optout(user_id TEXT PRIMARY KEY,created_at TEXT);
    CREATE TABLE academy_learning_flow(id TEXT PRIMARY KEY,track_id TEXT,title TEXT,nodes_json TEXT,audience_json TEXT,status TEXT);
    INSERT INTO academy_learning_flow VALUES('flow','pap','PAP','[{"kind":"start","title":"Início"},{"kind":"material","title":"Primeira aula","targetId":"lesson"}]','["seller"]','published');
    INSERT INTO user VALUES('old','Antiga Pessoa','old@example.test');
    INSERT INTO academy_member VALUES('old','seller','["pap"]',1);
    INSERT INTO academy_onboarding VALUES('old','2026-11-09T00:00:00.000Z');`);
  let time='2026-11-10T00:00:00.000Z';const sent=[];
  const service=createEmailAutomationService(db,{baseURL:'https://st1academy.tech',clock:()=>time,env:{ACADEMY_MAIL_FROM:'academy@example.test'},mailerTransport:{async sendMail(message){sent.push(message);return {messageId:'smtp-1',rejected:[]};}}});
  try{
    assert.equal(service.list().items.length,20);
    service.activate('welcome');
    assert.deepEqual(await service.tick(),{queued:0,accepted:0,failed:0});
    db.exec(`INSERT INTO user VALUES('new','Ana Silva','ana@example.test');INSERT INTO academy_member VALUES('new','seller','["pap"]',1);INSERT INTO academy_onboarding VALUES('new','2026-11-10T01:00:00.000Z');`);
    time='2026-11-10T01:01:00.000Z';
    assert.deepEqual(await service.tick(),{queued:1,accepted:1,failed:0});
    assert.match(sent[0].subject,/Ana/);assert.match(sent[0].html,/Primeira aula/);
    assert.equal(sent[0].to,'ana@example.test');
    assert.deepEqual(await service.tick(),{queued:0,accepted:0,failed:0});
    const token=db.prepare("SELECT token FROM academy_email_job WHERE user_id='new'").get().token;
    assert.equal(service.optout(token),true);
    assert.equal(db.prepare("SELECT count(*) n FROM academy_email_optout WHERE user_id='new'").get().n,1);
  }finally{db.close();}
});

test('certificado emitido após ativação gera apenas um e-mail para titular habilitado',async()=>{
  const db=new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE user(id TEXT PRIMARY KEY,name TEXT,email TEXT);
    CREATE TABLE academy_member(user_id TEXT PRIMARY KEY,role TEXT,tracks_json TEXT,enabled INTEGER);
    CREATE TABLE academy_onboarding(user_id TEXT PRIMARY KEY,completed_at TEXT);
    CREATE TABLE academy_campaign_optout(user_id TEXT PRIMARY KEY,created_at TEXT);
    CREATE TABLE academy_learning_flow(id TEXT PRIMARY KEY,track_id TEXT,title TEXT,nodes_json TEXT,audience_json TEXT,status TEXT,updated_at TEXT);
    CREATE TABLE academy_certificate(id TEXT PRIMARY KEY,user_id TEXT,track_id TEXT,issued_at TEXT);
    INSERT INTO user VALUES('a','Ana Silva','ana@example.test');
    INSERT INTO academy_member VALUES('a','seller','["pap"]',1);
    INSERT INTO academy_learning_flow VALUES('f','pap','Trilha PAP','[]','["seller"]','published','2026-11-09');
    INSERT INTO academy_certificate VALUES('old','a','pap','2026-11-09T00:00:00.000Z');`);
  let time='2026-11-10T00:00:00.000Z';const sent=[];
  const service=createEmailAutomationService(db,{baseURL:'https://st1academy.tech',clock:()=>time,env:{ACADEMY_MAIL_FROM:'academy@example.test'},mailerTransport:{async sendMail(message){sent.push(message);return {messageId:'smtp-2',rejected:[]};}}});
  try{
    service.activate('certificate_available');
    assert.deepEqual(await service.tick(),{queued:0,accepted:0,failed:0});
    db.exec("INSERT INTO academy_certificate VALUES('new','a','pap','2026-11-10T01:00:00.000Z')");time='2026-11-10T01:01:00.000Z';
    assert.deepEqual(await service.tick(),{queued:1,accepted:1,failed:0});
    assert.match(sent[0].text,/Trilha PAP/);assert.match(sent[0].text,/certificates\/new\/pdf/);
    assert.deepEqual(await service.tick(),{queued:0,accepted:0,failed:0});
    db.exec("UPDATE academy_member SET enabled=0 WHERE user_id='a'");
    db.exec("INSERT INTO academy_certificate VALUES('later','a','pap','2026-11-10T02:00:00.000Z')");time='2026-11-10T02:01:00.000Z';
    assert.deepEqual(await service.tick(),{queued:0,accepted:0,failed:0});
  }finally{db.close();}
});
