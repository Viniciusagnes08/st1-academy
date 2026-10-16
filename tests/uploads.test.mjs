import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {randomBytes,createHash} from 'node:crypto';
import {createApp} from '../server.mjs';

test('arquivos grandes mantêm integridade, privacidade e revisão com envio em partes',async t=>{
  const directory=await mkdtemp(resolve(tmpdir(),'academy-upload-'));
  let now=Date.now();const baseURL='http://localhost:4274';
  const cronSecret=randomBytes(32).toString('hex');
  const {app,ctx}=await createApp({dataDir:directory,baseURL,testMode:true,includeLibrary:false,clock:()=>now,cronSecret,googleConfig:{clientId:'',clientSecret:''}});
  const server=await new Promise(done=>{const s=app.listen(4274,'127.0.0.1',()=>done(s));});
  const request=async(who,path,{method='GET',body,bytes,headers={}}={})=>{
    const response=await fetch(baseURL+path,{method,headers:{Origin:baseURL,Connection:'close',...(who?{Cookie:who.cookie}:{}),...(body?{'Content-Type':'application/json'}:{}),...(bytes?{'Content-Type':'application/octet-stream'}:{}),...headers},...(body?{body:JSON.stringify(body)}:bytes?{body:bytes}:{})});
    const raw=Buffer.from(await response.arrayBuffer());let data;try{data=JSON.parse(raw);}catch{}return {status:response.status,data,bytes:raw,headers:response.headers};
  };
  const enroll=async(name,role)=>{
    const email=name+'@upload.example',invitation=ctx.createInvitation({name:'QA '+name,email,role,tracks:['pap']});
    const response=await request(null,'/api/auth/sign-up/email',{method:'POST',headers:{'x-academy-invite':new URL(invitation.url).searchParams.get('convite')},body:{name:'QA',email,password:randomBytes(24).toString('base64url')}});
    assert.equal(response.status,200);return {id:response.data.user.id,cookie:response.headers.getSetCookie().map(value=>value.split(';')[0]).join('; ')};
  };
  try{
    await t.test('o agendador exige a chave privada mesmo para quem possui uma conta',async()=>{
      assert.equal((await request(null,'/api/internal/calendar-sync')).status,401);
      assert.equal((await request(null,'/api/internal/calendar-sync',{headers:{Authorization:'Bearer '+randomBytes(32).toString('hex')}})).status,401);
      const allowed=await request(null,'/api/internal/calendar-sync',{headers:{Authorization:'Bearer '+cronSecret}});assert.equal(allowed.status,200);assert.equal(allowed.data.configured,false);
    });
    const admin=await enroll('admin','admin'),seller=await enroll('seller','seller');
    const material=ctx.contents.create(admin.id,{title:'Arquivo grande de QA',kind:'file',category:'processos',tracks:['pap'],audience:['seller'],status:'draft'});
    const file=Buffer.alloc(5*1024*1024+19,97);file.write('%PDF-1.7\n');
    const hash=createHash('sha256').update(file).digest('hex');
    const input={target:'/api/admin/contents/'+material.id+'/file',size:file.length,sha256:hash,headers:{'content-type':'application/octet-stream','x-content-revision':String(material.revision),'x-file-name':'Arquivo-QA.pdf'}};
    let upload;
    await t.test('exige a mesma autorização e origem da operação original',async()=>{
      assert.equal((await request(null,'/api/uploads',{method:'POST',body:input})).status,401);
      assert.equal((await request(seller,'/api/uploads',{method:'POST',body:input})).status,403);
      assert.equal((await request(admin,'/api/uploads',{method:'POST',body:input,headers:{Origin:'https://external.example'}})).status,403);
      assert.equal((await request(admin,'/api/uploads',{method:'POST',body:{...input,target:'https://external.example/file'}})).status,400);
      const response=await request(admin,'/api/uploads',{method:'POST',body:input});assert.equal(response.status,201);upload=response.data;
      assert.equal(upload.chunkBytes,1024*1024);
      assert.equal((await request(seller,'/api/uploads/'+upload.id+'/parts/0',{method:'PUT',bytes:file.subarray(0,upload.chunkBytes)})).status,404);
    });
    await t.test('partes inválidas e conclusão incompleta não criam um arquivo',async()=>{
      assert.equal((await request(admin,'/api/uploads/'+upload.id+'/parts/0',{method:'PUT',bytes:Buffer.from('incompleto')})).status,400);
      assert.equal((await request(admin,'/api/uploads/'+upload.id+'/complete',{method:'POST'})).status,409);
      assert.equal(ctx.db.prepare('SELECT count(*) AS n FROM academy_content_asset WHERE content_id=?').get(material.id).n,0);
    });
    await t.test('confere os bytes, aceita repetição e grava uma única versão',async()=>{
      for(let index=0;index<upload.chunks;index++){
        const bytes=file.subarray(index*upload.chunkBytes,(index+1)*upload.chunkBytes),path='/api/uploads/'+upload.id+'/parts/'+index;
        assert.equal((await request(admin,path,{method:'PUT',bytes})).status,200);
        if(index===0){assert.equal((await request(admin,path,{method:'PUT',bytes})).status,200);const different=Buffer.from(bytes);different[0]=0;assert.equal((await request(admin,path,{method:'PUT',bytes:different})).status,409);}
      }
      const completed=await request(admin,'/api/uploads/'+upload.id+'/complete',{method:'POST'});assert.equal(completed.status,201,JSON.stringify(completed.data));assert.equal(completed.data.asset.sha256,hash);
      const repeated=await request(admin,'/api/uploads/'+upload.id+'/complete',{method:'POST'});assert.equal(repeated.data.asset.id,completed.data.asset.id);
      assert.equal(ctx.db.prepare('SELECT count(*) AS n FROM academy_content_asset WHERE content_id=?').get(material.id).n,1);
      assert.equal(ctx.db.prepare('SELECT count(*) AS n FROM academy_upload_part WHERE upload_id=?').get(upload.id).n,0);
      const downloaded=await request(admin,'/api/contents/'+material.id+'/file');assert.equal(downloaded.status,200);assert.equal(createHash('sha256').update(downloaded.bytes).digest('hex'),hash);assert.equal(downloaded.headers.get('content-length'),null);
      assert.equal((await request(seller,'/api/contents/'+material.id+'/file')).status,404);
    });
    await t.test('mudança de revisão interrompe a gravação final e preserva o arquivo anterior',async()=>{
      const before=ctx.contents.detail({user_id:admin.id,role:'admin',enabled:1},material.id,true),bytes=Buffer.from('%PDF-1.7\nNova versão isolada');
      const staged=(await request(admin,'/api/uploads',{method:'POST',body:{...input,size:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),headers:{...input.headers,'x-content-revision':String(before.revision)}}})).data;
      assert.equal((await request(admin,'/api/uploads/'+staged.id+'/parts/0',{method:'PUT',bytes})).status,200);
      ctx.contents.update(admin.id,material.id,{revision:before.revision,summary:'Outra edição foi salva.'});
      assert.equal((await request(admin,'/api/uploads/'+staged.id+'/complete',{method:'POST'})).status,409);
      assert.equal(ctx.db.prepare('SELECT count(*) AS n FROM academy_content_asset WHERE content_id=?').get(material.id).n,1);
      now+=31*60*1000;assert.equal((await request(admin,'/api/uploads/'+staged.id+'/complete',{method:'POST'})).status,404);
    });
  }finally{await new Promise(done=>server.close(done));ctx.db.close();assert.equal(resolve(directory,'..'),resolve(tmpdir()));assert.match(directory,/academy-upload-/);await rm(directory,{recursive:true,force:true});}
});
