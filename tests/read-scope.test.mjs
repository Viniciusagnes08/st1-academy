import test from 'node:test';
import assert from 'node:assert/strict';
import {createReadScope} from '../lib/read-scope.mjs';

const read=(scope,sql,params,perform)=>scope.execute({sql,params},perform);
const response=value=>({rows:[{value}],changes:0});

test('repeated progress projections make one remote read and return independent rows',()=>{
  const scope=createReadScope();let calls=0;
  scope.run(()=>{
    const perform=()=>{calls++;return response({nested:['original'],at:new Date('2026-10-13T12:00:00Z')});};
    const first=read(scope,'SELECT value FROM progress WHERE user_id=?',['seller-a'],perform);
    first.rows[0].value.nested.push('changed');
    for(let i=0;i<200;i++){
      const next=read(scope,'SELECT value FROM progress WHERE user_id=?',['seller-a'],perform);
      assert.deepEqual(next.rows[0].value.nested,['original']);
      assert.ok(next.rows[0].value.at instanceof Date);
    }
  });
  assert.equal(calls,1);
});

test('reads never carry between requests or between different account parameters',()=>{
  const scope=createReadScope();let calls=0;
  const perform=()=>response(++calls);
  const request=()=>read(scope,'SELECT value FROM progress WHERE user_id=?',['seller-a'],perform);
  scope.run(()=>{assert.equal(request().rows[0].value,1);assert.equal(read(scope,'SELECT value FROM progress WHERE user_id=?',['seller-b'],perform).rows[0].value,2);assert.equal(request().rows[0].value,1);});
  scope.run(()=>assert.equal(request().rows[0].value,3));
  assert.equal(request().rows[0].value,4);
});

test('typed parameters keep distinct keys, including dates and large integers',()=>{
  const scope=createReadScope();let calls=0;
  scope.run(()=>{
    const sql='SELECT value FROM progress WHERE at=?',at=new Date('2026-10-13T12:00:00Z');
    const perform=()=>response(++calls);
    assert.equal(read(scope,sql,[at],perform).rows[0].value,1);
    assert.equal(read(scope,sql,[at.toISOString()],perform).rows[0].value,2);
    assert.equal(read(scope,sql,[9007199254740993n],perform).rows[0].value,3);
    assert.equal(read(scope,sql,[9007199254740993n],perform).rows[0].value,3);
  });
});

test('writes and transaction boundaries invalidate projected study and access data',()=>{
  const scope=createReadScope();let value='locked',calls=0;
  const get=()=>read(scope,'SELECT value FROM progress',[],()=>{calls++;return response(value);});
  scope.run(()=>{
    assert.equal(get().rows[0].value,'locked');
    scope.execute({sql:'UPDATE progress SET value=?',params:['available']},()=>{value='available';return {rows:[],changes:1};});
    assert.equal(get().rows[0].value,'available');
    scope.execute({sql:'ROLLBACK'},()=>{value='locked';return {rows:[],changes:0};});
    assert.equal(get().rows[0].value,'locked');
  });
  assert.equal(calls,3);
});

test('volatile and locked reads always reach the database',()=>{
  const scope=createReadScope();
  for(const sql of ['SELECT now()','SELECT random()','SELECT nextval(?)','SELECT value FROM progress FOR UPDATE','WITH updated AS (UPDATE progress SET value=1 RETURNING value) SELECT * FROM updated']){
    let calls=0;scope.run(()=>{for(let i=0;i<3;i++)read(scope,sql,[],()=>response(++calls));});assert.equal(calls,3);
  }
});

test('bounded storage does not retain oversized results or uploaded file bytes',()=>{
  const scope=createReadScope({maxBytes:256,maxEntryBytes:128,maxEntries:1});let calls=0;
  scope.run(()=>{
    for(let i=0;i<2;i++)read(scope,'SELECT bytes FROM file',[],()=>response(Buffer.alloc(4096)));
    for(let i=0;i<2;i++)read(scope,'SELECT large FROM content',[],()=>{calls++;return response('x'.repeat(1024));});
    for(let i=0;i<2;i++)read(scope,'SELECT small FROM content',[],()=>{calls++;return response('small');});
    for(let i=0;i<2;i++)read(scope,'SELECT another FROM content',[],()=>{calls++;return response('another');});
  });
  assert.equal(calls,5);
});

test('exceptions, nested reads, and async continuations cannot retain a scope',async()=>{
  const scope=createReadScope();let calls=0;
  const get=()=>read(scope,'SELECT value FROM progress',[],()=>response(++calls));
  assert.throws(()=>scope.run(()=>{get();scope.run(get);throw new Error('stop');}),/stop/);
  assert.equal(get().rows[0].value,2);
  await scope.run(async()=>{get();await Promise.resolve();assert.equal(get().rows[0].value,4);});
  assert.equal(get().rows[0].value,5);
});
