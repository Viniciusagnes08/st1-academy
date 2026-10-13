import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,sep,basename} from 'node:path';
import {randomBytes} from 'node:crypto';
import {createApp} from '../server.mjs';

test('Chat multimídia e perfis de colegas seguem o squad e as permissões reais',async t=>{
  const dataDir=await mkdtemp(resolve(tmpdir(),'st1-chat-media-')),baseURL='http://localhost:4200',instance=await createApp({dataDir,baseURL,testMode:true,includeLibrary:false}),ctx=instance.ctx;
  const server=await new Promise(resolve=>{const value=instance.app.listen(4200,'127.0.0.1',()=>resolve(value));}),people={};
  const request=async(who,path,{method='GET',body,form,headers={}}={})=>{
    const response=await fetch(baseURL+path,{method,headers:{Origin:baseURL,Connection:'close',...(who?{Cookie:who.cookie}:{}),...(body?{'Content-Type':'application/json'}:{}),...headers},...(form?{body:form}:body?{body:JSON.stringify(body)}:{})});
    const bytes=Buffer.from(await response.arrayBuffer());let data;try{data=JSON.parse(bytes.toString());}catch{}
    return {status:response.status,data,bytes,headers:response.headers};
  };
  const signup=async(key,role,permissions)=>{
    const email=key+'@chat-qa.example',invite=ctx.createInvitation({name:'QA '+key,email,role,tracks:['pap'],permissions}),response=await fetch(baseURL+'/api/auth/sign-up/email',{method:'POST',headers:{Origin:baseURL,'Content-Type':'application/json','x-academy-invite':new URL(invite.url).searchParams.get('convite'),Connection:'close'},body:JSON.stringify({email,name:'QA',password:randomBytes(24).toString('base64url')})});
    assert.equal(response.status,200);const data=await response.json();people[key]={id:data.user.id,cookie:response.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ')};
  };
  const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+X2ioAAAAASUVORK5CYII=','base64');
  const wav=Buffer.alloc(44+16000);wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVE',8);wav.write('fmt ',12);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(8000,24);wav.writeUInt32LE(16000,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(16000,40);
  const form=(bytes=png,name='foto.png',mime='image/png',kind='image',duration=0)=>{const value=new FormData();value.set('file',new Blob([bytes],{type:mime}),name);value.set('kind',kind);value.set('duration',String(duration));value.set('body','Mensagem de QA com anexo.');return value;};
  let squad,other,imageMessage,imageAsset,audioAsset;
  try{
    await signup('admin','admin');await signup('leader','supervisor');await signup('seller','seller');await signup('peer','seller');await signup('outsider','seller');await signup('restricted','seller',['materials']);
    squad=(await request(people.admin,'/api/admin/squads',{method:'POST',body:{name:'Squad de QA',description:'Equipe isolada.',supervisorId:people.leader.id,memberIds:[people.seller.id,people.peer.id],status:'active'}})).data;
    other=(await request(people.admin,'/api/admin/squads',{method:'POST',body:{name:'Outro squad QA',description:'Equipe isolada.',memberIds:[people.outsider.id],status:'active'}})).data;
    await t.test('Supervisor recebe apenas seu squad e a URL de outro time não amplia acesso',async()=>{
      const list=(await request(people.leader,'/api/squads')).data.items;assert.deepEqual(list.map(s=>s.id),[squad.id]);assert.equal((await request(people.leader,'/api/squads/'+other.id)).status,404);assert.equal((await request(people.leader,'/api/squads/'+other.id+'/messages')).status,404);
    });
    await t.test('a lista de perfis permite descobrir colegas sem expor telefone, e-mail ou histórias privadas',async()=>{
      const list=(await request(people.seller,'/api/profiles')).data.items;assert.deepEqual(new Set(list.map(p=>p.id)),new Set([people.peer.id,people.leader.id]));assert.ok(list.every(p=>!('email' in p)&&!('fields' in p)&&!('phone' in p)));assert.equal((await request(people.restricted,'/api/profiles')).status,403);assert.equal((await request(people.seller,'/api/profiles/'+people.outsider.id)).status,404);
    });
    await t.test('envia foto real por multipart e entrega o anexo somente a quem participa do squad',async()=>{
      const posted=await request(people.seller,'/api/squads/'+squad.id+'/messages/media',{method:'POST',form:form()});assert.equal(posted.status,201);imageMessage=posted.data.id;
      const message=(await request(people.peer,'/api/squads/'+squad.id+'/messages')).data.items.find(m=>m.id===imageMessage);imageAsset=message.asset.id;assert.equal(message.kind,'image');assert.equal(message.canViewProfile,true);assert.equal(message.userId,people.seller.id);assert.equal(message.asset.mime,'image/png');
      assert.equal((await request(null,message.asset.url)).status,401);assert.equal((await request(people.outsider,message.asset.url)).status,404);assert.deepEqual((await request(people.peer,message.asset.url)).bytes,png);
    });
    await t.test('o áudio usa armazenamento privado, reprodução por faixa e CSP compatível',async()=>{
      const posted=await request(people.seller,'/api/squads/'+squad.id+'/messages/media',{method:'POST',form:form(wav,'voz.wav','audio/wav','audio',1)});assert.equal(posted.status,201);
      audioAsset=(await request(people.peer,'/api/squads/'+squad.id+'/messages')).data.items.find(m=>m.id===posted.data.id).asset.id;
      const ranged=await request(people.peer,'/api/chat-media/'+audioAsset,{headers:{Range:'bytes=0-15'}});assert.equal(ranged.status,206);assert.equal(ranged.headers.get('content-range'),'bytes 0-15/'+wav.length);assert.deepEqual(ranged.bytes,wav.subarray(0,16));assert.match(ranged.headers.get('content-security-policy'),/media-src 'self' blob:/);
      assert.equal((await request(people.peer,'/api/chat-media/'+audioAsset,{headers:{Range:'bytes=99-2'}})).status,416);
      const suffix=await request(people.peer,'/api/chat-media/'+audioAsset,{headers:{Range:'bytes=-8'}});assert.equal(suffix.status,206);assert.deepEqual(suffix.bytes,wav.subarray(-8));
    });
    await t.test('bloqueia arquivos disfarçados, duração inválida, partes duplicadas e origem externa',async()=>{
      assert.equal((await request(people.seller,'/api/squads/'+squad.id+'/messages/media',{method:'POST',form:form(Buffer.alloc(80,65))})).status,400);
      assert.equal((await request(people.seller,'/api/squads/'+squad.id+'/messages/media',{method:'POST',form:form(wav,'voz.wav','audio/wav','audio',140)})).status,400);
      const duplicate=form();duplicate.append('file',new Blob([png],{type:'image/png'}),'segunda.png');assert.equal((await request(people.seller,'/api/squads/'+squad.id+'/messages/media',{method:'POST',form:duplicate})).status,400);
      assert.equal((await request(people.seller,'/api/squads/'+squad.id+'/messages/media',{method:'POST',form:form(),headers:{Origin:'https://outside.example'}})).status,403);
      assert.equal((await request(people.outsider,'/api/squads/'+squad.id+'/messages/media',{method:'POST',form:form()})).status,404);
    });
    await t.test('a moderação oculta também o arquivo e a restauração recupera a mesma mensagem',async()=>{
      assert.equal((await request(people.leader,'/api/messages/'+imageMessage,{method:'PATCH',body:{hidden:true}})).status,200);
      assert.equal((await request(people.peer,'/api/chat-media/'+imageAsset)).status,404);assert.equal((await request(people.peer,'/api/squads/'+squad.id+'/messages')).data.items.find(m=>m.id===imageMessage).asset,undefined);
      await request(people.leader,'/api/messages/'+imageMessage,{method:'PATCH',body:{hidden:false}});assert.equal((await request(people.peer,'/api/chat-media/'+imageAsset)).status,200);
    });
    await t.test('fotos e áudios compartilham o limite de envio das mensagens de texto',async()=>{
      for(let i=0;i<8;i++)assert.equal((await request(people.seller,'/api/squads/'+squad.id+'/messages',{method:'POST',body:{body:'Texto de QA '+i}})).status,201);
      assert.equal((await request(people.seller,'/api/squads/'+squad.id+'/messages/media',{method:'POST',form:form()})).status,429);
    });
    await t.test('sair do squad revoga simultaneamente arquivos e perfis do time anterior',async()=>{
      await request(people.admin,'/api/admin/squads/'+other.id,{method:'PATCH',body:{...other,revision:other.revision,memberIds:[people.outsider.id,people.peer.id]}});
      assert.equal((await request(people.peer,'/api/chat-media/'+imageAsset)).status,404);assert.equal((await request(people.peer,'/api/chat-media/'+audioAsset)).status,404);assert.equal((await request(people.peer,'/api/profiles/'+people.seller.id)).status,404);assert.ok(!(await request(people.peer,'/api/profiles')).data.items.some(p=>p.id===people.seller.id));
    });
  }finally{
    await new Promise(resolve=>server.close(resolve));ctx.db.close();
    const root=resolve(tmpdir())+sep;assert.ok(resolve(dataDir).startsWith(root)&&basename(dataDir).startsWith('st1-chat-media-'));await rm(dataDir,{recursive:true,force:true});
  }
});
