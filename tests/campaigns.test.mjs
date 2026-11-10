import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {createCampaignService} from '../lib/campaigns.mjs';

test('campanhas enviam só a contas ativas selecionadas e registram o resultado sem duplicar',async()=>{
  const db=new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE user(id TEXT PRIMARY KEY,name TEXT,email TEXT);
    CREATE TABLE academy_member(user_id TEXT PRIMARY KEY,role TEXT,enabled INTEGER);
    INSERT INTO user VALUES('a','Ana Silva','ana@example.test'),('b','Bruno Costa','bruno@example.test'),('c','Caio Lima','caio@example.test');
    INSERT INTO academy_member VALUES('a','seller',1),('b','supervisor',1),('c','seller',0);`);
  const sent=[];
  const service=createCampaignService(db,{baseURL:'https://st1academy.tech',env:{ACADEMY_MAIL_FROM:'vinicius.agnes@st1.net.br'},mailerTransport:{async sendMail(message){sent.push(message);if(message.to==='bruno@example.test')throw Object.assign(new Error('Falha SMTP'),{code:'SMTP_FAIL'});return {messageId:'test-id',rejected:[]};}}});
  try{
    assert.deepEqual(service.list().recipients.map(x=>x.id),['a','b']);
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

