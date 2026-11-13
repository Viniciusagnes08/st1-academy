import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {DatabaseSync} from 'node:sqlite';
import {createN8nIntegration} from '../lib/n8n-integration.mjs';
import {createOpenPanelIntegration} from '../lib/openpanel-integration.mjs';
import {createIntegrationOutbox} from '../lib/integration-outbox.mjs';
import {createIntegrationDispatcher} from '../lib/integration-dispatcher.mjs';

async function server(handler){
  const instance=createServer(handler);await new Promise(resolve=>instance.listen(0,'127.0.0.1',resolve));
  return {url:`http://127.0.0.1:${instance.address().port}`,close:()=>new Promise(resolve=>instance.close(resolve))};
}
const event={id:'evt-1',eventType:'academy.trail.completed',schemaVersion:1,entityType:'trail',entityId:'pap',createdAt:'2026-11-13T00:00:00.000Z',payload:{userId:'user-123',trackId:'pap',squadId:'squad-a'}};

test('n8n envia envelope com headers de idempotência e segredo',async()=>{
  let received;
  const s=await server((req,res)=>{let body='';req.on('data',x=>body+=x);req.on('end',()=>{received={headers:req.headers,body:JSON.parse(body)};res.writeHead(204).end();});});
  try{
    const adapter=createN8nIntegration({webhookUrl:s.url+'/hook',secret:'segredo-de-integracao-123456'});
    const result=await adapter.send(event);
    assert.equal(result.ok,true);
    assert.equal(received.headers['x-academy-event-id'],'evt-1');
    assert.equal(received.headers['x-academy-event-type'],'academy.trail.completed');
    assert.equal(received.headers['x-academy-secret'],'segredo-de-integracao-123456');
    assert.equal(received.body.event.id,'evt-1');
  }finally{await s.close();}
});

test('OpenPanel usa autenticação server-side e pseudonimiza profileId',async()=>{
  let received;
  const s=await server((req,res)=>{let body='';req.on('data',x=>body+=x);req.on('end',()=>{received={url:req.url,headers:req.headers,body:JSON.parse(body)};res.writeHead(202).end();});});
  try{
    const adapter=createOpenPanelIntegration({apiUrl:s.url,clientId:'client-id',clientSecret:'client-secret-123456',profileSalt:'salt-estavel-de-producao'});
    const result=await adapter.send(event);
    assert.equal(result.ok,true);assert.equal(received.url,'/track');
    assert.equal(received.headers['openpanel-client-id'],'client-id');
    assert.equal(received.headers['openpanel-client-secret'],'client-secret-123456');
    assert.equal(received.body.type,'track');
    assert.equal(received.body.payload.name,'academy.trail.completed');
    assert.notEqual(received.body.payload.profileId,'user-123');
    assert.equal(received.body.payload.profileId.length,32);
    assert.equal('userId' in received.body.payload.properties,false);
    assert.deepEqual(received.body.payload.groups,['squad-a']);
  }finally{await s.close();}
});

test('dispatcher isola falha de n8n e entrega OpenPanel',async()=>{
  const db=new DatabaseSync(':memory:');
  try{
    const outbox=createIntegrationOutbox(db,{clock:()=>Date.parse('2026-11-13T00:00:00.000Z')});
    outbox.record('academy.integration.test',{entityType:'integration',entityId:'x',payload:{userId:'u1'}},['n8n','openpanel']);
    const calls=[];
    const dispatcher=createIntegrationDispatcher({outbox,adapters:{n8n:{send:async()=>{calls.push('n8n');throw new Error('offline');}},openpanel:{send:async()=>{calls.push('openpanel');return {ok:true,status:202};}}}});
    const result=await dispatcher.tick();
    assert.deepEqual(calls.sort(),['n8n','openpanel']);
    assert.equal(result.delivered,1);assert.equal(result.failed,1);
    const items=outbox.list();
    assert.equal(items.find(x=>x.provider==='openpanel').status,'delivered');
    assert.equal(items.find(x=>x.provider==='n8n').status,'retry');
  }finally{db.close();}
});
