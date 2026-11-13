import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createIntegrationEvents} from '../lib/integration-events.mjs';

test('emissor usa providers habilitados dinamicamente e remove campos sensíveis',async()=>{
  let config={n8n:{ready:true},openpanel:{ready:false}};const recorded=[];let ticks=0;
  const events=createIntegrationEvents({
    outbox:{record:(type,data,providers)=>{recorded.push({type,data,providers});return {id:'evt'};}},
    integrations:{list:()=>config},dispatcher:{tick:async()=>{ticks++;}}
  });
  events.emit('academy.nps.submitted',{entityType:'nps',entityId:'n1',payload:{userId:'u1',email:'x@example.com',nested:{token:'abc',score:9}}});
  await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(recorded[0].providers,['n8n']);
  assert.equal('email' in recorded[0].data.payload,false);
  assert.equal('token' in recorded[0].data.payload.nested,false);
  assert.equal(recorded[0].data.payload.nested.score,9);
  assert.equal(ticks,1);
  config={n8n:{ready:false},openpanel:{ready:true}};
  events.emit('academy.integration.test',{entityType:'integration',entityId:'x',payload:{userId:'u1'}});
  assert.deepEqual(recorded[1].providers,['openpanel']);
});

test('emissor não grava evento sem provider e nunca propaga falha do outbox',()=>{
  let calls=0;const errors=[];
  const disabled=createIntegrationEvents({outbox:{record:()=>{calls++;}},integrations:{list:()=>({n8n:{ready:false},openpanel:{ready:false}})},dispatcher:{tick:async()=>{}},logger:{error:(...x)=>errors.push(x)}});
  assert.equal(disabled.emit('academy.integration.test',{entityType:'integration',entityId:'x',payload:{}}),null);assert.equal(calls,0);
  const broken=createIntegrationEvents({outbox:{record:()=>{throw Object.assign(new Error('database secret'),{code:'DB_DOWN'});}},integrations:{list:()=>({n8n:{ready:true},openpanel:{ready:false}})},dispatcher:{tick:async()=>{}},logger:{error:(...x)=>errors.push(x)}});
  assert.doesNotThrow(()=>broken.emit('academy.integration.test',{entityType:'integration',entityId:'x',payload:{password:'nope'}}));
  assert.equal(errors.at(-1)[1],'DB_DOWN');
  assert.equal(errors.flat().join(' ').includes('database secret'),false);
});
