import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {createCampaignService} from '../lib/campaigns.mjs';

test('campanhas enviam só a contas ativas selecionadas e registram o resultado sem duplicar',async()=>{
  const db=new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE user(id TEXT PRIMARY KEY,name TEXT,email TEXT);
    CREATE TABLE academy_member(user_id TEXT PRIMARY KEY,role TEXT,enabled INTEGER);
    CREATE TABLE academy_onboarding(user_id TEXT PRIMARY KEY,answers_json TEXT NOT NULL,completed_at TEXT NOT NULL);
    INSERT INTO user VALUES('a','Ana Silva','ana@example.test'),('b','Bruno Costa','bruno@example.test'),('c','Caio Lima','caio@example.test');
    INSERT INTO academy_member VALUES('a','seller',1),('b','supervisor',1),('c','seller',0);
    INSERT INTO academy_onboarding VALUES('a','{"role":"Consultor(a)"}','2026-01-01'),('b','{"role":"Supervisor(a)"}','2026-01-01');`);
  const sent=[];
  const service=createCampaignService(db,{baseURL:'https://st1academy.tech',env:{ACADEMY_MAIL_FROM:'vinicius.agnes@st1.net.br'},mailerTransport:{async sendMail(message){sent.push(message);if(message.to==='bruno@example.test')throw Object.assign(new Error('Falha SMTP'),{code:'SMTP_FAIL'});return {messageId:'test-id',rejected:[]};}}});
  try{
    assert.deepEqual(service.list().recipients.map(x=>x.id),['a','b']);
    assert.equal(service.list().recipients[0].jobRole,'Consultor(a)');
    const roleDraft=service.create('admin',{title:'Por cargo',subject:'Mensagem para consultores',body:'Olá, {{nome}}! Continue sua trilha hoje.',audienceType:'role',audienceRole:'Consultor(a)',recipientIds:['a']});
    assert.deepEqual(roleDraft.recipientIds,['a']);
    assert.equal(roleDraft.audienceRole,'Consultor(a)');
    assert.throws(()=>service.create('admin',{title:'Por cargo',subject:'Mensagem para consultores',body:'Olá, {{nome}}! Continue sua trilha hoje.',audienceType:'role',audienceRole:'Gerente'}),/Selecione entre 1 e 50/);
    assert.throws(()=>service.create('admin',{title:'Incentivo',subject:'Vamos aprender',body:'Olá, {{nome}}! Continue sua trilha hoje.',recipientIds:['c']}),/sem acesso ativo/);
    const draft=service.create('admin',{title:'Incentivo',subject:'Vamos aprender',body:'Olá, {{nome}}! Continue sua trilha hoje.',recipientIds:['a','b'],ctaLabel:'Abrir trilhas',ctaUrl:'/#trilhas'});
    assert.equal(draft.status,'draft');assert.equal(draft.metrics.selected,2);
    const result=await service.send(draft.id);
    assert.equal(result.metrics.accepted,1);assert.equal(result.metrics.failed,1);assert.equal(sent.length,2);
    assert.match(sent[0].text,/Olá, Ana!/);
    assert.match(sent[0].html,/ST1 ACADEMY/);
    await assert.rejects(service.send(draft.id),/já foi iniciada/);
    const first=db.prepare("SELECT token FROM academy_campaign_delivery WHERE user_id='a'").get().token;
    assert.equal(service.mark('click',first),'/#trilhas');service.mark('open',first);
    const tracked=service.list().campaigns[0];assert.equal(tracked.metrics.clicked,1);assert.equal(tracked.metrics.opened,1);
    assert.equal(service.optout(first),true);assert.deepEqual(service.list().recipients.map(x=>x.id),['b']);
  }finally{db.close();}
});

test('agendamento persiste, respeita a lista ajustada e envia imagens embutidas',async()=>{
  const db=new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE user(id TEXT PRIMARY KEY,name TEXT,email TEXT);
    CREATE TABLE academy_member(user_id TEXT PRIMARY KEY,role TEXT,enabled INTEGER);
    CREATE TABLE academy_onboarding(user_id TEXT PRIMARY KEY,answers_json TEXT NOT NULL,completed_at TEXT NOT NULL);
    INSERT INTO user VALUES('a','Ana Silva','ana@example.test'),('b','Bruno Costa','bruno@example.test');
    INSERT INTO academy_member VALUES('a','seller',1),('b','seller',1);
    INSERT INTO academy_onboarding VALUES('a','{"role":"Consultor(a)"}','2026-01-01'),('b','{"role":"Consultor(a)"}','2026-01-01');`);
  const sent=[],transport={async sendMail(message){sent.push(message);return {messageId:'scheduled-id',rejected:[]};}};
  const service=createCampaignService(db,{baseURL:'https://st1academy.tech',mailerTransport:transport});
  try{
    const image='data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=';
    const draft=service.create('admin',{title:'Campanha marcada',subject:'Continue seu percurso',body:'Olá, {{nome}}! Seu próximo passo está aqui.',audienceType:'role',audienceRole:'Consultor(a)',recipientIds:['a'],ctaLabel:'Abrir conteúdo',ctaUrl:'https://exemplo.test/curso',headerImage:image,footerImage:image});
    assert.deepEqual(draft.recipientIds,['a']);assert.equal(draft.images.length,2);
    assert.throws(()=>service.schedule(draft.id,new Date(Date.now()-60000).toISOString()),/data futura/);
    const scheduled=service.schedule(draft.id,new Date(Date.now()+120000).toISOString());assert.equal(scheduled.status,'scheduled');
    await service.runDue();assert.equal(sent.length,0);
    db.prepare("UPDATE academy_campaign SET scheduled_at='2020-01-01T00:00:00.000Z' WHERE id=?").run(draft.id);
    await service.runDue();assert.equal(sent.length,1);assert.equal(sent[0].to,'ana@example.test');assert.equal(sent[0].attachments.length,2);assert.match(sent[0].html,/cid:campaign-header/);assert.equal(service.list().campaigns[0].status,'sent');
    await service.runDue();assert.equal(sent.length,1);
    const second=service.create('admin',{title:'Cancelar envio',subject:'Campanha agendada',body:'Uma mensagem para testar o agendamento.',recipientIds:['b']});service.schedule(second.id,new Date(Date.now()+120000).toISOString());assert.equal(service.cancelSchedule(second.id).status,'draft');
  }finally{db.close();}
});

test('campanhas manuais respeitam a cota dos automáticos e reagendam o envio coletivo',async()=>{
  const db=new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE user(id TEXT PRIMARY KEY,name TEXT,email TEXT);
    CREATE TABLE academy_member(user_id TEXT PRIMARY KEY,role TEXT,enabled INTEGER);
    CREATE TABLE academy_onboarding(user_id TEXT PRIMARY KEY,answers_json TEXT NOT NULL,completed_at TEXT NOT NULL);
    CREATE TABLE academy_email_job(user_id TEXT,status TEXT,accepted_at TEXT);
    INSERT INTO user VALUES('a','Ana Silva','ana@example.test');
    INSERT INTO academy_member VALUES('a','seller',1);
    INSERT INTO academy_onboarding VALUES('a','{"role":"Consultor(a)"}','2026-01-01');`);
  const clock=Date.now();db.prepare('INSERT INTO academy_email_job(user_id,status,accepted_at) VALUES(?,?,?),(?,?,?)').run('a','accepted',new Date(clock-24*60*60*1000).toISOString(),'a','accepted',new Date(clock-4*60*60*1000).toISOString());
  const sent=[],service=createCampaignService(db,{baseURL:'https://st1academy.tech',mailerTransport:{async sendMail(message){sent.push(message);return {messageId:'limited',rejected:[]};}}});
  try{
    const draft=service.create('admin',{title:'Não ultrapassar a frequência',subject:'Seu próximo passo',body:'Olá, {{nome}}! Continue seu desenvolvimento na Academy.',recipientIds:['a']});
    await assert.rejects(service.send(draft.id),/limite de frequência/);
    assert.equal(service.list().campaigns[0].status,'draft');assert.equal(sent.length,0);
    const scheduled=service.create('admin',{title:'Aguardar a cota',subject:'Seu próximo passo',body:'Olá, {{nome}}! Continue seu desenvolvimento na Academy.',recipientIds:['a']});
    service.schedule(scheduled.id,new Date(Date.now()+120000).toISOString());db.prepare('UPDATE academy_campaign SET scheduled_at=? WHERE id=?').run(new Date(Date.now()-1000).toISOString(),scheduled.id);
    await service.runDue();
    const deferred=service.list().campaigns.find(item=>item.id===scheduled.id);
    assert.equal(deferred.status,'scheduled');assert.ok(Date.parse(deferred.scheduledAt)>Date.now());assert.match(deferred.scheduleError,/limite de duas mensagens/);assert.equal(sent.length,0);
  }finally{db.close();}
});

test('CRUD de e-mail edita e exclui somente campanhas em rascunho',()=>{
  const db=new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE user(id TEXT PRIMARY KEY,name TEXT,email TEXT);CREATE TABLE academy_member(user_id TEXT PRIMARY KEY,role TEXT,enabled INTEGER);CREATE TABLE academy_onboarding(user_id TEXT PRIMARY KEY,answers_json TEXT NOT NULL,completed_at TEXT NOT NULL);INSERT INTO user VALUES('a','Ana Silva','ana@example.test');INSERT INTO academy_member VALUES('a','seller',1);INSERT INTO academy_onboarding VALUES('a','{"role":"Consultor(a)"}','2026-01-01');`);
  const service=createCampaignService(db,{baseURL:'https://st1academy.tech'});
  try{
    const draft=service.create('admin-1',{title:'Rascunho inicial',subject:'Assunto inicial',body:'Mensagem inicial com conteúdo suficiente.',recipientIds:['a']});
    const edited=service.update('admin-2',draft.id,{title:'Rascunho revisado',subject:'Assunto revisado',body:'Mensagem revisada e persistida corretamente.',audienceType:'role',audienceRole:'Consultor(a)',recipientIds:['a'],ctaLabel:'Abrir trilhas',ctaUrl:'/#trilhas'});
    assert.equal(edited.title,'Rascunho revisado');assert.equal(edited.updatedBy,'admin-2');assert.ok(edited.updatedAt);assert.equal(edited.ctaUrl,'/#trilhas');
    service.schedule(draft.id,new Date(Date.now()+120000).toISOString());
    assert.throws(()=>service.update('admin-2',draft.id,{title:'Bloqueada'}),/Somente campanhas em rascunho/);assert.throws(()=>service.remove(draft.id),/Somente campanhas em rascunho/);
    assert.equal(service.cancelSchedule(draft.id).status,'draft');service.remove(draft.id);assert.equal(service.list().campaigns.length,0);
  }finally{db.close();}
});


