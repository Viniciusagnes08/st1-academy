import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Worker} from 'node:worker_threads';
import {waitForPostgresResponse} from '../lib/postgres-channel.mjs';

test('notificação atrasada da consulta anterior não libera uma resposta ainda não recebida',async()=>{
  const shared=new SharedArrayBuffer(16),control=new Int32Array(shared);
  Atomics.store(control,0,1);
  const worker=new Worker(`
    const {workerData}=require('node:worker_threads');
    const control=new Int32Array(workerData);
    Atomics.notify(control,0);
    setTimeout(()=>{Atomics.store(control,3,777);Atomics.store(control,0,2);Atomics.notify(control,0);},100);
  `,{eval:true,workerData:shared});
  try{
    waitForPostgresResponse(control,5000);
    assert.equal(Atomics.load(control,3),777);
    assert.equal(Atomics.load(control,0),2);
  }finally{await worker.terminate();}
});
