import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {createIntegrationService} from '../lib/integrations.mjs';

test('GlitchTip n8n e OpenPanel guardam segredos cifrados e podem ser desligados sem apagar credenciais',()=>{
  const db=new DatabaseSync(':memory:');
  try{
    const service=createIntegrationService(db,{secret:'segredo-estavel-com-mais-de-32-caracteres',env:{}});
    assert.equal(service.list().glitchtip.ready,false);assert.equal(service.list().n8n.ready,false);assert.equal(service.list().openpanel.ready,false);
    service.save('admin','glitchtip',{GLITCHTIP_ENABLED:'1',GLITCHTIP_DSN:'https://abc@example.com/1',GLITCHTIP_TRACES_SAMPLE_RATE:'0.01'});
    service.save('admin','n8n',{N8N_ENABLED:'1',N8N_WEBHOOK_URL:'https://automation.example.com/webhook/academy',N8N_WEBHOOK_SECRET:'segredo-n8n-123456789'});
    service.save('admin','openpanel',{OPENPANEL_ENABLED:'1',OPENPANEL_API_URL:'https://analytics.example.com',OPENPANEL_CLIENT_ID:'550e8400-e29b-41d4-a716-446655440000',OPENPANEL_CLIENT_SECRET:'segredo-openpanel-123456'});
    assert.equal(service.list().glitchtip.ready,true);assert.equal(service.list().n8n.ready,true);assert.equal(service.list().openpanel.ready,true);
    assert.equal(service.list().glitchtip.fields.GLITCHTIP_DSN.configured,true);
    assert.equal(service.list().n8n.fields.N8N_WEBHOOK_SECRET.configured,true);
    assert.equal(service.list().openpanel.fields.OPENPANEL_CLIENT_SECRET.configured,true);
    assert.equal(service.list().openpanel.fields.OPENPANEL_CLIENT_ID.value,'550e8400-e29b-41d4-a716-446655440000');
    for(const name of ['GLITCHTIP_DSN','N8N_WEBHOOK_SECRET','OPENPANEL_CLIENT_SECRET']){
      const cipher=db.prepare('SELECT value_cipher FROM academy_integration_setting WHERE name=?').get(name).value_cipher;
      assert.doesNotMatch(cipher,/segredo|example\.com/);
    }
    service.save('admin','n8n',{N8N_ENABLED:'0',N8N_WEBHOOK_URL:'https://automation.example.com/webhook/academy',N8N_WEBHOOK_SECRET:''});
    assert.equal(service.list().n8n.ready,false);
    assert.equal(service.effective().N8N_WEBHOOK_SECRET,'segredo-n8n-123456789');
  }finally{db.close();}
});

test('integrações de produção rejeitam HTTP inseguro, sample rate inválido e segredo curto',()=>{
  const db=new DatabaseSync(':memory:');
  try{
    const service=createIntegrationService(db,{secret:'segredo-estavel-com-mais-de-32-caracteres',env:{}});
    assert.throws(()=>service.save('admin','n8n',{N8N_ENABLED:'1',N8N_WEBHOOK_URL:'http://example.com/hook',N8N_WEBHOOK_SECRET:'segredo-n8n-123456789'}),/HTTPS|n8n/i);
    assert.throws(()=>service.save('admin','n8n',{N8N_ENABLED:'1',N8N_WEBHOOK_URL:'https://127.0.0.1/hook',N8N_WEBHOOK_SECRET:'segredo-n8n-123456789'}),/HTTPS|n8n/i);
    assert.throws(()=>service.save('admin','n8n',{N8N_ENABLED:'1',N8N_WEBHOOK_URL:'https://169.254.169.254/hook',N8N_WEBHOOK_SECRET:'segredo-n8n-123456789'}),/HTTPS|n8n/i);
    assert.throws(()=>service.save('admin','openpanel',{OPENPANEL_ENABLED:'1',OPENPANEL_API_URL:'https://10.0.0.1',OPENPANEL_CLIENT_ID:'550e8400-e29b-41d4-a716-446655440000',OPENPANEL_CLIENT_SECRET:'segredo-openpanel-123456'}),/OpenPanel/i);
    assert.doesNotThrow(()=>service.save('admin','n8n',{N8N_ENABLED:'1',N8N_WEBHOOK_URL:'https://fc-automation.example.com/hook',N8N_WEBHOOK_SECRET:'segredo-n8n-123456789'}));
    assert.throws(()=>service.save('admin','glitchtip',{GLITCHTIP_ENABLED:'1',GLITCHTIP_DSN:'https://abc@example.com/1',GLITCHTIP_TRACES_SAMPLE_RATE:'2'}),/sample|GlitchTip/i);
    assert.throws(()=>service.save('admin','openpanel',{OPENPANEL_ENABLED:'1',OPENPANEL_API_URL:'https://analytics.example.com',OPENPANEL_CLIENT_ID:'id',OPENPANEL_CLIENT_SECRET:'curto'}),/OpenPanel/i);
  }finally{db.close();}
});
