import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {createIntegrationOutbox} from '../lib/integration-outbox.mjs';

test('entrega sending abandonada por restart volta para retry após cinco minutos',()=>{
  const db=new DatabaseSync(':memory:');
  try{
    let now=Date.parse('2026-11-13T00:00:00.000Z');const outbox=createIntegrationOutbox(db,{clock:()=>now});
    outbox.record('academy.integration.test',{entityType:'integration',entityId:'x',payload:{}},['n8n']);const item=outbox.due()[0];assert.equal(outbox.markSending(item.id),true);assert.equal(outbox.due().length,0);
    now+=5*60*1000+1;const recovered=outbox.due();assert.equal(recovered.length,1);assert.equal(recovered[0].id,item.id);assert.equal(recovered[0].status,'retry');assert.match(recovered[0].lastError,/interrompida/i);
  }finally{db.close();}
});
