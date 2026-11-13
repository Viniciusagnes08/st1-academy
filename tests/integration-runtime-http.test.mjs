import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {randomBytes} from 'node:crypto';
import {createServer} from 'node:http';
import {createApp} from '../server.mjs';
import {completeOnboardingForTest} from './helpers/academy-fixtures.mjs';

async function freePort(){const probe=createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));const port=probe.address().port;await new Promise(r=>probe.close(r));return port;}

test('Admin configura, testa e inspeciona integrações sem expor segredos',async()=>{
  const directory=await mkdtemp(resolve(tmpdir(),'st1-integrations-http-')),port=await freePort(),baseURL=`http://127.0.0.1:${port}`;
  const outbound=[];
  const integrationFetch=async(url,init={})=>{outbound.push({url:String(url),headers:Object.fromEntries(new Headers(init.headers).entries()),body:init.body});return new Response(null,{status:204});};
  const {app,ctx}=await createApp({dataDir:directory,baseURL,testMode:true,includeLearningFlows:false,integrationFetch});
  const server=await new Promise(r=>{const s=app.listen(port,'127.0.0.1',()=>r(s));});let cookie='';
  const request=async(path,{method='GET',body,headers={}}={})=>{const response=await fetch(baseURL+path,{method,headers:{Origin:baseURL,Connection:'close',...(cookie?{Cookie:cookie}:{}),...(body?{'Content-Type':'application/json'}:{}),...headers},...(body?{body:JSON.stringify(body)}:{})});const set=response.headers.getSetCookie();if(set.length)cookie=set.map(x=>x.split(';')[0]).join('; ');let data=null;try{data=await response.json();}catch{}return {status:response.status,data};};
  try{
    const invite=ctx.createInvitation({name:'Admin Integrações',email:'integrations-admin@example.test',role:'admin'}),token=new URL(invite.url).searchParams.get('convite');
    const signup=await request('/api/auth/sign-up/email',{method:'POST',headers:{'x-academy-invite':token},body:{name:'ignorado',email:'integrations-admin@example.test',password:randomBytes(24).toString('base64url')}});
    assert.equal(signup.status,200,JSON.stringify(signup.data));completeOnboardingForTest(ctx.db,signup.data.user.id);
    const saved=await request('/api/admin/integrations/n8n',{method:'PUT',body:{N8N_ENABLED:'1',N8N_WEBHOOK_URL:'https://automation.example.test/webhook/academy',N8N_WEBHOOK_SECRET:'segredo-de-producao-123456'}});assert.equal(saved.status,200,JSON.stringify(saved.data));
    const health=await request('/api/admin/integrations/health');assert.equal(health.status,200,JSON.stringify(health.data));assert.equal(health.data.providers.n8n.ready,true);
    const sent=await request('/api/admin/integrations/n8n/test',{method:'POST',body:{}});assert.equal(sent.status,200,JSON.stringify(sent.data));assert.equal(sent.data.ok,true);assert.equal(outbound.length,1);assert.equal(outbound[0].headers['x-academy-secret'],'segredo-de-producao-123456');
    const deliveries=await request('/api/admin/integrations/deliveries');assert.equal(deliveries.status,200);assert.equal(deliveries.data.items.length,1);assert.equal('payload' in deliveries.data.items[0],false);
    assert.equal(JSON.stringify(deliveries.data).includes('segredo-de-producao'),false);
  }finally{await new Promise(r=>server.close(r));ctx.db.close();await rm(directory,{recursive:true,force:true});}
});
