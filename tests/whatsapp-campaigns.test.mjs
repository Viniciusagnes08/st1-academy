import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {createWhatsAppCampaignService} from '../lib/whatsapp-campaigns.mjs';

test('WhatsApp exige autorização registrada e telefone antes do disparo, e não reenvia a campanha',async()=>{
  const db=new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE user(id TEXT PRIMARY KEY,name TEXT,email TEXT);
    CREATE TABLE academy_member(user_id TEXT PRIMARY KEY,role TEXT,enabled INTEGER);
    CREATE TABLE academy_onboarding(user_id TEXT PRIMARY KEY,answers_json TEXT NOT NULL);
    CREATE TABLE academy_personal_profile(user_id TEXT PRIMARY KEY,phone TEXT NOT NULL DEFAULT '');
    INSERT INTO user VALUES('a','Ana Silva','ana@test.local'),('b','Bruno Costa','bruno@test.local'),('c','Caio Lima','caio@test.local');
    INSERT INTO academy_member VALUES('a','seller',1),('b','seller',1),('c','seller',0);
    INSERT INTO academy_onboarding VALUES('a','{"role":"Consultor(a)"}'),('b','{"role":"Consultor(a)"}');
    INSERT INTO academy_personal_profile VALUES('a','(98) 99999-9999'),('b','(98) 98888-8888');`);
  const sent=[];const service=createWhatsAppCampaignService(db,{sendTemplate:async(person,campaign)=>{sent.push([person.phone,campaign.template_name]);if(person.id==='b')throw new Error('Erro da API');return 'wamid.test';}});
  try{
    assert.equal(service.list().providerReady,true);
    assert.equal(service.list().recipients[0].phone,'5598999999999');
    const draft=service.create('admin',{title:'Incentivo',templateName:'incentivo_academy',language:'pt_BR',preview:'Olá, {{nome}}! Continue sua trilha.',useFirstName:true,audienceType:'role',audienceRole:'Consultor(a)',recipientIds:['a','b']});
    await assert.rejects(service.send(draft.id),/sem telefone válido ou autorização/);
    assert.throws(()=>service.consent('admin','a',{optedIn:true,source:'curta'}),/origem da autorização/);
    service.consent('admin','a',{optedIn:true,source:'Formulário de aceite'});service.consent('admin','b',{optedIn:true,source:'Formulário de aceite'});
    const result=await service.send(draft.id);assert.equal(result.metrics.accepted,1);assert.equal(result.metrics.failed,1);assert.equal(sent.length,2);
    await assert.rejects(service.send(draft.id),/já foi iniciada/);
    service.consent('admin','a',{optedIn:false});assert.equal(service.list().recipients[0].optedIn,false);
    assert.throws(()=>service.create('admin',{title:'Outra',templateName:'incentivo_academy',language:'pt_BR',preview:'Mensagem aprovada no modelo.',recipientIds:['c']}),/sem acesso ativo/);
  }finally{db.close();}
});

test('agendamento do WhatsApp só fica ativo com canal configurado',()=>{
  const db=new DatabaseSync(':memory:');db.exec(`CREATE TABLE user(id TEXT PRIMARY KEY,name TEXT,email TEXT);CREATE TABLE academy_member(user_id TEXT PRIMARY KEY,role TEXT,enabled INTEGER);CREATE TABLE academy_onboarding(user_id TEXT PRIMARY KEY,answers_json TEXT NOT NULL);CREATE TABLE academy_personal_profile(user_id TEXT PRIMARY KEY,phone TEXT NOT NULL DEFAULT '');INSERT INTO user VALUES('a','Ana Silva','ana@test.local');INSERT INTO academy_member VALUES('a','seller',1);INSERT INTO academy_personal_profile VALUES('a','98999999999');`);
  try{const service=createWhatsAppCampaignService(db,{env:{}});const draft=service.create('admin',{title:'Próxima trilha',templateName:'proxima_trilha',language:'pt_BR',preview:'Sua próxima trilha espera por você.',recipientIds:['a']});assert.equal(service.list().providerReady,false);assert.throws(()=>service.schedule(draft.id,new Date(Date.now()+120000).toISOString()),/conta WhatsApp Business/);assert.equal(service.list().campaigns[0].status,'draft');}finally{db.close();}
});

test('CRUD de WhatsApp edita e exclui somente campanhas em rascunho',()=>{
  const db=new DatabaseSync(':memory:');db.exec(`CREATE TABLE user(id TEXT PRIMARY KEY,name TEXT,email TEXT);CREATE TABLE academy_member(user_id TEXT PRIMARY KEY,role TEXT,enabled INTEGER);CREATE TABLE academy_onboarding(user_id TEXT PRIMARY KEY,answers_json TEXT NOT NULL);CREATE TABLE academy_personal_profile(user_id TEXT PRIMARY KEY,phone TEXT NOT NULL DEFAULT '');INSERT INTO user VALUES('a','Ana Silva','ana@test.local');INSERT INTO academy_member VALUES('a','seller',1);INSERT INTO academy_onboarding VALUES('a','{"role":"Consultor(a)"}');INSERT INTO academy_personal_profile VALUES('a','98999999999');`);
  const service=createWhatsAppCampaignService(db,{sendTemplate:async()=> 'wamid.test'});
  try{
    const draft=service.create('admin-1',{title:'Rascunho inicial',templateName:'modelo_inicial',language:'pt_BR',preview:'Mensagem inicial aprovada.',recipientIds:['a']});
    const edited=service.update('admin-2',draft.id,{title:'Rascunho revisado',templateName:'modelo_revisado',language:'pt_BR',preview:'Mensagem revisada e persistida.',useFirstName:true,audienceType:'role',audienceRole:'Consultor(a)',recipientIds:['a']});
    assert.equal(edited.templateName,'modelo_revisado');assert.equal(edited.updatedBy,'admin-2');assert.ok(edited.updatedAt);assert.equal(edited.useFirstName,true);
    service.consent('admin-2','a',{optedIn:true,source:'Formulário de aceite'});service.schedule(draft.id,new Date(Date.now()+120000).toISOString());
    assert.throws(()=>service.update('admin-2',draft.id,{title:'Bloqueada'}),/Somente campanhas em rascunho/);assert.throws(()=>service.remove(draft.id),/Somente campanhas em rascunho/);
    assert.equal(service.cancelSchedule(draft.id).status,'draft');service.remove(draft.id);assert.equal(service.list().campaigns.length,0);
  }finally{db.close();}
});

