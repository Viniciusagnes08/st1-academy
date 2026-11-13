import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {createIntegrationOutbox} from '../lib/integration-outbox.mjs';
import {createCircuitBreaker} from '../lib/integration-circuit-breaker.mjs';

test('outbox cria uma entrega independente por provider e preserva o payload do evento',()=>{
  const db=new DatabaseSync(':memory:');
  try{
    let now=Date.parse('2026-11-13T00:00:00.000Z');
    const outbox=createIntegrationOutbox(db,{clock:()=>now});
    const event=outbox.record('academy.trail.completed',{
      entityType:'trail',entityId:'pap-t1',payload:{userId:'u1',trackId:'pap-t1'}
    },['n8n','openpanel']);
    assert.equal(event.eventType,'academy.trail.completed');
    const due=outbox.due();
    assert.equal(due.length,2);
    assert.deepEqual(new Set(due.map(item=>item.provider)),new Set(['n8n','openpanel']));
    assert.deepEqual(due[0].payload,{userId:'u1',trackId:'pap-t1'});
    outbox.succeed(due.find(item=>item.provider==='n8n').id);
    assert.equal(outbox.due().length,1);
    assert.equal(outbox.due()[0].provider,'openpanel');
  }finally{db.close();}
});

test('outbox aplica backoff e envia para dead letter depois da quinta falha',()=>{
  const db=new DatabaseSync(':memory:');
  try{
    let now=Date.parse('2026-11-13T00:00:00.000Z');
    const outbox=createIntegrationOutbox(db,{clock:()=>now});
    outbox.record('academy.integration.test',{entityType:'integration',entityId:'test',payload:{}},['n8n']);
    const expected=[60_000,300_000,1_800_000,7_200_000];
    for(const delay of expected){
      const item=outbox.due()[0];
      outbox.fail(item.id,'provider unavailable');
      assert.equal(outbox.due().length,0);
      now+=delay;
      assert.equal(outbox.due().length,1);
    }
    const fifth=outbox.due()[0];
    outbox.fail(fifth.id,'provider unavailable');
    assert.equal(outbox.due().length,0);
    const row=outbox.list().find(item=>item.id===fifth.id);
    assert.equal(row.status,'dead_letter');
    assert.equal(row.attempts,5);
    assert.match(row.lastError,/provider unavailable/);
  }finally{db.close();}
});

test('retry manual reabre uma dead letter sem apagar o histórico de tentativas',()=>{
  const db=new DatabaseSync(':memory:');
  try{
    const outbox=createIntegrationOutbox(db,{clock:()=>Date.parse('2026-11-13T00:00:00.000Z')});
    outbox.record('academy.integration.test',{entityType:'integration',entityId:'test',payload:{}},['n8n']);
    const id=outbox.due()[0].id;
    for(let i=0;i<5;i++)outbox.fail(id,'boom',{forceDue:true});
    assert.equal(outbox.list()[0].status,'dead_letter');
    outbox.retry(id);
    const reopened=outbox.due()[0];
    assert.equal(reopened.id,id);
    assert.equal(reopened.status,'pending');
    assert.equal(reopened.attempts,5);
  }finally{db.close();}
});

test('circuit breaker abre por provider e volta a permitir tentativa após cooldown',()=>{
  let now=1_000;
  const breaker=createCircuitBreaker({clock:()=>now,threshold:5,cooldownMs:300_000});
  for(let i=0;i<4;i++){assert.equal(breaker.canAttempt('n8n'),true);breaker.failure('n8n');}
  assert.equal(breaker.canAttempt('n8n'),true);
  breaker.failure('n8n');
  assert.equal(breaker.canAttempt('n8n'),false);
  assert.equal(breaker.canAttempt('openpanel'),true);
  now+=300_001;
  assert.equal(breaker.canAttempt('n8n'),true);
  breaker.success('n8n');
  assert.equal(breaker.state('n8n').failures,0);
});
