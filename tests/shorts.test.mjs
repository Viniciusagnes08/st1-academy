import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {randomBytes} from 'node:crypto';
import {createApp} from '../server.mjs';
import {videoDuration} from '../lib/shorts.mjs';

const sample=seconds=>{
  const ftyp=Buffer.alloc(16);ftyp.writeUInt32BE(16,0);ftyp.write('ftyp',4);ftyp.write('isom',8);
  const mvhd=Buffer.alloc(28);mvhd.writeUInt32BE(28,0);mvhd.write('mvhd',4);mvhd.writeUInt32BE(1000,20);mvhd.writeUInt32BE(seconds*1000,24);
  const moov=Buffer.alloc(8);moov.writeUInt32BE(36,0);moov.write('moov',4);
  const mdat=Buffer.alloc(9);mdat.writeUInt32BE(9,0);mdat.write('mdat',4);mdat[8]=1;
  return Buffer.concat([ftyp,moov,mvhd,mdat]);
};

test('Academy Shorts valida duração e mantém feed, vídeo e interações privados',async()=>{
  assert.equal(videoDuration(sample(60)),60);
  assert.throws(()=>videoDuration(sample(301)),/5 minutos/);
  const directory=await mkdtemp(resolve(tmpdir(),'academy-shorts-')),baseURL='http://127.0.0.1:4199';
  const {app,ctx}=await createApp({dataDir:directory,baseURL,testMode:true,includeLibrary:false});
  const server=await new Promise(resolve=>{const instance=app.listen(4199,'127.0.0.1',()=>resolve(instance));});
  try{
    const invite=ctx.createInvitation({name:'Pessoa Shorts',email:'shorts@example.test',role:'admin'});
    const token=new URL(invite.url).searchParams.get('convite');
    const signup=await fetch(baseURL+'/api/auth/sign-up/email',{method:'POST',headers:{Origin:baseURL,'Content-Type':'application/json','x-academy-invite':token},body:JSON.stringify({name:'Pessoa Shorts',email:'shorts@example.test',password:randomBytes(24).toString('base64url')})});
    assert.equal(signup.status,200);const cookie=signup.headers.getSetCookie().map(value=>value.split(';')[0]).join('; ');
    const request=(path,options={})=>fetch(baseURL+path,{...options,headers:{Origin:baseURL,Cookie:cookie,...options.headers}});
    assert.equal((await request('/api/shorts')).status,403);
    const onboarding=await request('/api/onboarding',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sector:'Gestão',role:'Gerente',squad:'Ainda não sei',challenges:['Organização'],goal:'Gerente',dream:'Crescer na ST1'})});assert.equal(onboarding.status,200);
    const create=await request('/api/shorts',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({title:'Dica de BI',description:'Como ler um indicador',subject:'BI',channel:'Tech',source:'Autoria própria',cover:Buffer.from([137,80,78,71,13,10,26,10]).toString('base64')})});assert.equal(create.status,201);const {id}=await create.json();
    assert.equal((await (await request('/api/shorts')).json()).items.length,0);
    const invalid=await request('/api/shorts/'+id+'/video',{method:'POST',headers:{'Content-Type':'application/octet-stream','x-file-name':'demo.mp4'},body:sample(301)});assert.equal(invalid.status,400);
    const upload=await request('/api/shorts/'+id+'/video',{method:'POST',headers:{'Content-Type':'application/octet-stream','x-file-name':'demo.mp4'},body:sample(60)});assert.equal(upload.status,201);
    const feed=await (await request('/api/shorts')).json();assert.equal(feed.items.length,1);assert.equal(feed.items[0].durationSeconds,60);
    assert.equal((await (await request('/api/shorts/'+id)).json()).title,'Dica de BI');
    const range=await request('/api/shorts/'+id+'/video',{headers:{Range:'bytes=0-3'}});assert.equal(range.status,206);assert.equal((await range.arrayBuffer()).byteLength,4);
    assert.equal((await request('/api/shorts/'+id+'/cover')).status,200);
    assert.equal((await request('/api/shorts/'+id+'/like',{method:'PUT'})).status,200);
    assert.equal((await request('/api/shorts/'+id+'/save',{method:'PUT'})).status,200);
    assert.equal((await request('/api/shorts/'+id+'/view',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).status,200);
    assert.equal((await request('/api/shorts/'+id+'/share',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).status,200);
    const comment=await request('/api/shorts/'+id+'/comments',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({body:'Boa dica!'})});assert.equal(comment.status,201);
    const saved=await (await request('/api/shorts?saved=1')).json();assert.equal(saved.items[0].likes,1);assert.equal(saved.items[0].comments,1);assert.equal(saved.items[0].views,1);assert.equal(saved.items[0].shares,1);
    const imageDraft=await request('/api/shorts',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({description:'Imagem sem campos extras',cover:Buffer.from([137,80,78,71,13,10,26,10]).toString('base64')})});assert.equal(imageDraft.status,201);const imageId=(await imageDraft.json()).id;
    const imageUpload=await request('/api/shorts/'+imageId+'/video',{method:'POST',headers:{'Content-Type':'application/octet-stream','x-file-name':'foto.png'},body:Buffer.from([137,80,78,71,13,10,26,10])});assert.equal(imageUpload.status,201);
    assert.equal((await (await request('/api/shorts/'+imageId)).json()).mediaKind,'image');
    assert.match((await request('/api/shorts/'+imageId+'/video')).headers.get('content-type'),/image\/png/);
    const personalized=await (await request('/api/shorts?session=feed-entrada-aleatoria')).json();assert.equal(personalized.session,'feed-entrada-aleatoria');assert.equal(new Set(personalized.items.map(item=>item.id)).size,personalized.items.length);
    const changedStart=await (await request('/api/shorts?session=feed-outra-entrada&avoid='+id)).json();assert.notEqual(changedStart.items[0].id,id);
    assert.equal((await request('/api/shorts/'+id,{method:'DELETE'})).status,200);
    assert.equal((await request('/api/shorts/'+id+'/video')).status,404);
  }finally{await new Promise(resolve=>server.close(resolve));ctx.db.close();await rm(directory,{recursive:true,force:true});}
});

