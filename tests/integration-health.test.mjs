import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createIntegrationHealth} from '../lib/integration-health.mjs';

test('health expõe configuração, circuito e fila sem segredos',()=>{
  const health=createIntegrationHealth({
    integrations:{list:()=>({glitchtip:{ready:true},n8n:{ready:true},openpanel:{ready:false}})},
    outbox:{counts:()=>({pending:2,retry:1,dead_letter:3})},
    dispatcher:{breaker:{state:provider=>({failures:provider==='n8n'?2:0,openedAt:null})}}
  });
  const value=health.snapshot();
  assert.deepEqual(value.queue,{pending:2,retry:1,dead_letter:3});
  assert.equal(value.providers.glitchtip.ready,true);
  assert.equal(value.providers.n8n.failures,2);
  assert.equal(value.providers.openpanel.ready,false);
  assert.equal(JSON.stringify(value).includes('secret'),false);
});
