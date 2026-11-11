import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {createWhatsAppCampaignService} from '../lib/whatsapp-campaigns.mjs';
import {createWhatsAppAutomationService} from '../lib/whatsapp-automations.mjs';
import {createWhatsAppReceipts} from '../lib/whatsapp-receipts.mjs';
import {compatibleAutomationTemplate} from '../lib/whatsapp-provider.mjs';

const approved={name:'st1_academy_welcome',language:'pt_BR',status:'APPROVED',components:[{type:'BODY',text:'Olá, {{1}}! Bem-vindo à ST1 Academy.'}]};

function fixture(){
  const db=new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE user(id TEXT PRIMARY KEY,name TEXT,email TEXT);
    CREATE TABLE academy_member(user_id TEXT PRIMARY KEY,role TEXT,enabled INTEGER);
    CREATE TABLE academy_onboarding(user_id TEXT PRIMARY KEY,completed_at TEXT);
    CREATE TABLE academy_personal_profile(user_id TEXT PRIMARY KEY,phone TEXT);
    INSERT INTO user VALUES('a','Ana Silva','ana@example.test');
    INSERT INTO academy_member VALUES('a','seller',1);
    INSERT INTO academy_onboarding VALUES('a','2026-11-10T14:01:00.000Z');
    INSERT INTO academy_personal_profile VALUES('a','98999999999');`);
  createWhatsAppCampaignService(db,{sendTemplate:async()=> 'manual'});
  const env={WHATSAPP_APP_SECRET:'test-app-secret-1234',WHATSAPP_VERIFY_TOKEN:'test-verify-token-1234'};
  const receipts=createWhatsAppReceipts(db,{env});
  const provider={ready:()=>true,templatesReady:()=>true,templates:async()=>[approved],approvedForAutomation:async(name,language)=>name===approved.name&&language===approved.language};
  let time='2026-11-10T14:00:00.000Z';
  const sent=[];
  const service=createWhatsAppAutomationService(db,{env,baseURL:'https://st1academy.tech',context:{},receipts,provider,clock:()=>time,sendTemplate:async(person,template)=>{sent.push({person,template});return 'wamid.1';}});
  return {db,env,receipts,service,sent,setTime:value=>{time=value;}};
}

test('automação começa pausada, exige modelo compatível e consentimento, e envia uma vez',async()=>{
  const {db,service,sent,setTime}=fixture();
  try{
    assert.equal(service.list().items.length,20);
    assert.equal(service.list().items.filter(x=>x.status==='active').length,0);
    assert.deepEqual(await service.tick(),{queued:0,accepted:0,failed:0});
    service.save('welcome',{templateName:approved.name,language:'pt_BR'});
    await service.activate('welcome');
    setTime('2026-11-10T14:02:00.000Z');
    assert.deepEqual(await service.tick(),{queued:0,accepted:0,failed:0});
    db.prepare("INSERT INTO academy_whatsapp_consent VALUES('a',1,'Aceite no formulário','5598999999999','admin',?)").run('2026-11-10T14:02:00.000Z');
    assert.deepEqual(await service.tick(),{queued:1,accepted:1,failed:0});
    assert.equal(sent.length,1);
    assert.equal(sent[0].person.phone,'5598999999999');
    assert.deepEqual(await service.tick(),{queued:0,accepted:0,failed:0});
    assert.equal(service.list().items.find(x=>x.key==='welcome').accepted,1);
  }finally{db.close();}
});

test('troca de modelo descarta fila antiga e campanha manual impõe intervalo',async()=>{
  const {db,service,setTime}=fixture();
  try{
    service.save('welcome',{templateName:approved.name,language:'pt_BR'});
    await service.activate('welcome');
    db.prepare("INSERT INTO academy_whatsapp_consent VALUES('a',1,'Aceite no formulário','5598999999999','admin',?)").run('2026-11-10T14:02:00.000Z');
    db.prepare("INSERT INTO academy_whatsapp_delivery(id,campaign_id,user_id,name,phone,status,accepted_at) VALUES('manual','campaign','a','Ana','5598999999999','accepted','2026-11-10T14:01:00.000Z')").run();
    setTime('2026-11-10T14:02:00.000Z');
    assert.deepEqual(await service.tick(),{queued:1,accepted:0,failed:0});
    assert.equal(db.prepare("SELECT scheduled_at FROM academy_whatsapp_automation_job WHERE user_id='a'").get().scheduled_at,'2026-11-17T14:01:00.000Z');
    service.save('welcome',{templateName:'outro_modelo',language:'pt_BR'});
    assert.equal(db.prepare("SELECT status FROM academy_whatsapp_automation_job WHERE user_id='a'").get().status,'skipped');
  }finally{db.close();}
});

test('webhook valida assinatura e registra entrega e leitura sem aceitar IDs estranhos',()=>{
  const {db,env,receipts}=fixture();
  try{
    db.prepare("INSERT INTO academy_whatsapp_delivery(id,campaign_id,user_id,name,phone,status,message_id,accepted_at) VALUES('d','c','a','Ana','5598999999999','accepted','wamid.1','2026-11-10T14:00:00.000Z')").run();
    receipts.accepted('wamid.1');
    assert.equal(receipts.verify('subscribe',env.WHATSAPP_VERIFY_TOKEN,'challenge'),'challenge');
    assert.equal(receipts.verify('subscribe','wrong','challenge'),null);
    const body=Buffer.from(JSON.stringify({object:'whatsapp_business_account',entry:[{changes:[{value:{statuses:[{id:'wamid.1',status:'delivered',timestamp:'1794319320'},{id:'unknown',status:'read',timestamp:'1794319321'},{id:'wamid.1',status:'read',timestamp:'1794319322'}]}}]}]}));
    const signature='sha256='+createHmac('sha256',env.WHATSAPP_APP_SECRET).update(body).digest('hex');
    assert.equal(receipts.ingest(body,'sha256='+'0'.repeat(64)),false);
    assert.equal(receipts.ingest(body,signature),true);
    assert.equal(receipts.get('wamid.1').status,'read');
    assert.ok(receipts.get('wamid.1').delivered_at);
    assert.ok(receipts.get('wamid.1').read_at);
    assert.equal(receipts.get('unknown'),null);
  }finally{db.close();}
});

test('automação só aceita modelo aprovado com uma variável no corpo',()=>{
  assert.equal(compatibleAutomationTemplate(approved),true);
  assert.equal(compatibleAutomationTemplate({...approved,status:'PENDING'}),false);
  assert.equal(compatibleAutomationTemplate({...approved,components:[{type:'BODY',text:'Olá, {{1}} e {{2}}'}]}),false);
  assert.equal(compatibleAutomationTemplate({...approved,components:[{type:'BODY',text:'Olá, {{1}}'},{type:'HEADER',text:'{{1}}'}]}),false);
});
