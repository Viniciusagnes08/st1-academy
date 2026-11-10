import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {createIntegrationService} from '../lib/integrations.mjs';

test('integrações cifram segredos, preservam chaves vazias e atualizam o ambiente efetivo',()=>{
  const db=new DatabaseSync(':memory:');
  try{const service=createIntegrationService(db,{secret:'segredo-estavel-com-mais-de-32-caracteres',env:{}});
    assert.equal(service.list().email.ready,false);
    service.save('admin','email',{ACADEMY_SMTP_HOST:'smtp.gmail.com',ACADEMY_SMTP_PORT:'465',ACADEMY_SMTP_USER:'vini@st1.net.br',ACADEMY_MAIL_FROM:'vini@st1.net.br',ACADEMY_SMTP_PASSWORD:'senha-de-teste'});
    assert.equal(service.list().email.ready,true);assert.equal(service.list().email.fields.ACADEMY_SMTP_PASSWORD.configured,true);
    assert.doesNotMatch(db.prepare("SELECT value_cipher FROM academy_integration_setting WHERE name='ACADEMY_SMTP_PASSWORD'").get().value_cipher,/senha-de-teste/);
    service.save('admin','email',{ACADEMY_SMTP_PASSWORD:''});assert.equal(service.effective().ACADEMY_SMTP_PASSWORD,'senha-de-teste');
    const hook=service.addWebhook('admin',{name:'Meu endpoint',url:'https://example.com/webhook',secret:'segredo-do-webhook-123',events:['email.campaign.completed']});assert.equal(hook.enabled,false);assert.equal(service.list().webhooks.length,1);service.removeWebhook(hook.id);assert.equal(service.list().webhooks.length,0);
    const item=service.addCustom('admin',{name:'ST1 Sales',category:'api',endpoint:'https://example.com/api',credential:'chave-de-teste',notes:'Receber aprovações de trilhas'});
    assert.equal(item.status,'draft');assert.equal(item.credentialConfigured,true);assert.equal(service.list().custom[0].name,'ST1 Sales');assert.equal('endpoint' in service.list().custom[0],false);
    assert.doesNotMatch(db.prepare('SELECT credential_cipher FROM academy_custom_integration WHERE id=?').get(item.id).credential_cipher,/chave-de-teste/);
    service.removeCustom(item.id);assert.equal(service.list().custom.length,0);
  }finally{db.close();}
});
