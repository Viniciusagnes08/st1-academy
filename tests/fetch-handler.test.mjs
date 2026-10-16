import {test} from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {randomBytes,createHash} from 'node:crypto';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {createFetchHandler} from '../lib/fetch-handler.mjs';
import {createApp} from '../server.mjs';
import {sendStudyFile} from '../lib/private-file.mjs';
import {readPrivateFile} from '../public/assets/binary-read.js';

test('entrada Fetch preserva login, cookies, origem, permissões e gravação da Academy',async()=>{
  const directory=await mkdtemp(resolve(tmpdir(),'academy-fetch-')),baseURL='http://localhost:4292';
  const application=await createApp({dataDir:directory,baseURL,testMode:true,includeLibrary:false,googleConfig:{clientId:'',clientSecret:''}});
  try{
    const handle=createFetchHandler({createApp:async()=>application});
    const request=(path,{method='GET',body,cookie,origin=baseURL}={})=>handle(new Request(baseURL+path,{method,headers:{Origin:origin,...(body?{'Content-Type':'application/json'}:{}),...(cookie?{Cookie:cookie}:{})},...(body?{body:JSON.stringify(body)}:{})}));
    assert.equal((await request('/api/bootstrap')).status,401);
    const email='admin@fetch.example',password=randomBytes(24).toString('base64url');
    const invitation=application.ctx.createInvitation({name:'Admin',email,role:'admin'});
    const enrolled=await handle(new Request(baseURL+'/api/auth/sign-up/email',{method:'POST',headers:{Origin:baseURL,'Content-Type':'application/json','x-academy-invite':new URL(invitation.url).searchParams.get('convite')},body:JSON.stringify({name:'Admin',email,password})}));
    assert.equal(enrolled.status,200);const cookies=enrolled.headers.getSetCookie();assert.ok(cookies.length);const cookie=cookies.map(value=>value.split(';')[0]).join('; ');
    assert.equal((await (await request('/api/bootstrap',{cookie})).json()).user.role,'admin');
    const saved=await request('/api/admin/contents',{method:'POST',cookie,body:{title:'Conteúdo pela entrada Fetch',kind:'text',body:'Material preservado.',tracks:['pap'],audience:['seller'],status:'draft'}});
    assert.equal(saved.status,201);const material=await saved.json();assert.equal(material.title,'Conteúdo pela entrada Fetch');
    assert.equal((await request('/api/admin/contents/'+material.id,{cookie})).status,200);
    assert.equal((await request('/api/admin/contents',{method:'POST',cookie,origin:'https://external.example',body:{}})).status,403);
    const login=await request('/api/auth/sign-in/email',{method:'POST',body:{email,password}});assert.equal(login.status,200);assert.ok(login.headers.getSetCookie().length);
    const redirect=await request('/');assert.equal(redirect.status,302);assert.equal(redirect.headers.get('location'),'/login');
  }finally{application.ctx.db.close();assert.equal(resolve(directory,'..'),resolve(tmpdir()));await rm(directory,{recursive:true,force:true});}
});

test('arquivos privados de 8 MB e 21 MB mantêm os bytes e os cookies na entrada Fetch',async()=>{
  const app=express(),small=randomBytes(8*1024*1024+19),large=randomBytes(21*1024*1024+7),hash=createHash('sha256').update(large).digest('hex');
  app.get('/small',(_,res)=>{res.setHeader('Set-Cookie',['one=1; Path=/; HttpOnly','two=2; Path=/; HttpOnly']);for(let at=0;at<small.length;at+=256*1024)res.write(small.subarray(at,at+256*1024));res.end();});
  app.get('/api/contents/large/file',(req,res)=>{if(req.headers.cookie!=='member=qa')return res.status(401).end();sendStudyFile(req,res,{name:'Grande.pdf',mime:'application/pdf',bytes:large,sha256:hash},{limited:true,contentId:'large'});});
  const handle=createFetchHandler({createApp:async()=>({app})}),request=(path,options={})=>handle(new Request('https://academy.example'+path,options));
  const full=await request('/small');assert.equal(full.headers.getSetCookie().length,2);assert.deepEqual(Buffer.from(await full.arrayBuffer()),small);
  const item={id:'large',asset:{size:large.length,sha256:hash}};
  const normal=await request('/api/contents/large/file',{headers:{Cookie:'member=qa'}});assert.equal(normal.status,302);assert.match(normal.headers.get('location'),/^\/arquivo.html\?/);
  assert.equal((await request('/api/contents/large/file',{headers:{Range:'bytes=0-99'}})).status,401);
  assert.equal((await request('/api/contents/large/file',{headers:{Cookie:'member=qa',Range:'bytes=0-99','If-Match':'"old"'}})).status,412);
  const bytes=await readPrivateFile(item,{fetcher:(path,init)=>request(path,{...init,headers:{...init.headers,Cookie:'member=qa'}})});assert.deepEqual(Buffer.from(bytes),large);
  await assert.rejects(readPrivateFile({...item,asset:{...item.asset,sha256:'f'.repeat(64)}},{fetcher:(path,init)=>request(path,{...init,headers:{...init.headers,Cookie:'member=qa'}})}),/mudou|disponível/);
});
