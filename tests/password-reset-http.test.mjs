import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {randomBytes} from 'node:crypto';
import {createApp} from '../server.mjs';

test('recuperação de senha: e-mail, link de uso único, revogação e antienumeração',async t=>{
  const dataDir=await mkdtemp(resolve(tmpdir(),'st1-password-recovery-'));
  const baseURL='http://localhost:4217',messages=[];
  const {app,ctx}=await createApp({dataDir,baseURL,testMode:true,includeLibrary:false,includeLearningFlows:false,
    passwordResetMailer:async message=>{messages.push(message);}
  });
  const server=await new Promise(resolve=>{const instance=app.listen(4217,'127.0.0.1',()=>resolve(instance));});
  const users={seller:{cookie:''}};
  const request=async(client,path,{body,method,headers={}}={})=>{
    const response=await fetch(baseURL+path,{method:method||(body?'POST':'GET'),redirect:'manual',headers:{Origin:baseURL,Connection:'close',...(client?.cookie?{Cookie:client.cookie}:{}),...(body?{'Content-Type':'application/json'}:{}),...headers},...(body?{body:JSON.stringify(body)}:{})});
    const cookies=response.headers.getSetCookie();
    if(client&&cookies.length)client.cookie=cookies.filter(value=>!value.includes('Max-Age=0')).map(value=>value.split(';')[0]).join('; ');
    const text=await response.text();let data;try{data=JSON.parse(text);}catch{}
    return {status:response.status,data,text,location:response.headers.get('location'),cookies,headers:response.headers};
  };
  const waitFor=async predicate=>{for(let i=0;i<60;i++){if(predicate())return;await new Promise(resolve=>setTimeout(resolve,20));}assert.fail('E-mail transacional não foi capturado.');};
  const oldPassword='SenhaInicialForte!2026',newPassword='NovaSenhaFortissima!2026';
  try{
    await t.test('as páginas de recuperação são públicas, mas não podem ser armazenadas em cache',async()=>{
      for(const path of ['/esqueci-senha','/redefinir-senha']){
        const page=await request(null,path);
        assert.equal(page.status,200);
        assert.match(page.headers.get('cache-control')||'',/no-store/);
        assert.match(page.headers.get('referrer-policy')||'',/no-referrer/);
        if(path==='/redefinir-senha')assert.ok(page.text.indexOf('id="recovery-feedback"')>page.text.indexOf('</form>'),'Mensagem de sucesso deve permanecer visível após ocultar o formulário.');
      }
      const source=await request(null,'/assets/password-recovery.js');
      assert.equal(source.status,200);
      assert.match(source.text,/history.replaceState/);
      assert.equal((await request(null,'/api/auth/request-password-reset',{body:{email:'any@example.test'}})).status,404);
      assert.equal((await request(null,'/api/auth/forget-password',{body:{email:'any@example.test'}})).status,404);
    });
    await t.test('nenhuma resposta revela se o endereço existe',async()=>{
      const missing=await request(null,'/api/password-recovery/request',{body:{email:'nao-existe@example.test'}});
      assert.equal(missing.status,202);
      assert.match(missing.data.message,/Se o e-mail estiver cadastrado/);
      assert.equal(messages.length,0);
      const invalid=await request(null,'/api/password-recovery/request',{body:{email:'nao-e-email'}});
      assert.equal(invalid.status,202);
      assert.equal(invalid.data.message,missing.data.message);
    });
    await t.test('senha é redefinida apenas após autenticação pelo link recebido',async()=>{
      const email='recuperacao-st1@example.test',name='Participante ST1';
      const invite=ctx.createInvitation({name,email,role:'seller',tracks:['pap']});
      const token=new URL(invite.url).searchParams.get('convite');
      const registered=await request(users.seller,'/api/auth/sign-up/email',{body:{name,email,password:oldPassword},headers:{'x-academy-invite':token}});
      assert.equal(registered.status,200,JSON.stringify(registered.data));
      const result=await request(null,'/api/password-recovery/request',{body:{email}});
      assert.equal(result.status,202);
      await waitFor(()=>messages.some(m=>m.kind==='reset'&&m.email===email));
      const mail=messages.find(m=>m.kind==='reset'&&m.email===email);
      assert.equal(new URL(mail.url).origin,baseURL);
      const address=new URL(mail.url);
      const redirected=await request(null,address.pathname+address.search);
      assert.ok([302,303,307].includes(redirected.status),JSON.stringify({status:redirected.status,body:redirected.text.slice(0,400)}));
      const redirectedUrl=new URL(redirected.location,baseURL);
      assert.equal(redirectedUrl.pathname,'/redefinir-senha');
      const resetToken=redirectedUrl.searchParams.get('token');
      assert.ok(resetToken?.length>=16);
      const weak=await request(null,'/api/auth/reset-password',{body:{token:resetToken,newPassword:'fraca'}});
      assert.ok(weak.status>=400);
      const reset=await request(null,'/api/auth/reset-password',{body:{token:resetToken,newPassword}});
      assert.equal(reset.status,200,JSON.stringify(reset.data));
      await waitFor(()=>messages.some(m=>m.kind==='changed'&&m.email===email));
      assert.equal((await request(users.seller,'/api/me')).status,401);
      assert.equal((await request(null,'/api/auth/sign-in/email',{body:{email,password:oldPassword}})).status,401);
      assert.equal((await request(null,'/api/auth/sign-in/email',{body:{email,password:newPassword}})).status,200);
      assert.ok((await request(null,'/api/auth/reset-password',{body:{token:resetToken,newPassword:'OutraSenhaSegura!2026'}})).status>=400);
    });
    await t.test('conta sem credencial de senha não recebe link e mantém login Google como único método',async()=>{
      const email='oauth-only@example.test',name='Pessoa Google';
      const invite=ctx.createInvitation({name,email,role:'seller',tracks:['pap']});
      const token=new URL(invite.url).searchParams.get('convite');
      const created=await request(null,'/api/auth/sign-up/email',{body:{name,email,password:oldPassword},headers:{'x-academy-invite':token}});
      assert.equal(created.status,200);
      const userId=created.data.user.id;
      ctx.db.prepare('DELETE FROM account WHERE "userId"=? AND "providerId"=?').run(userId,'credential');
      const before=messages.length;
      const recovery=await request(null,'/api/password-recovery/request',{body:{email}});
      assert.equal(recovery.status,202);
      await new Promise(resolve=>setTimeout(resolve,40));
      assert.equal(messages.length,before);
    });
    await t.test('após três solicitações na mesma hora, não dispara outra mensagem',async()=>{
      const email='recuperacao-st1@example.test';
      // The preceding test already used the first request in this rolling hour.
      await request(null,'/api/password-recovery/request',{body:{email}});
      await request(null,'/api/password-recovery/request',{body:{email}});
      await waitFor(()=>messages.filter(m=>m.kind==='reset'&&m.email===email).length===3);
      const total=messages.length;
      const denied=await request(null,'/api/password-recovery/request',{body:{email}});
      assert.equal(denied.status,202);
      await new Promise(resolve=>setTimeout(resolve,50));
      assert.equal(messages.length,total);
    });
  }finally{
    await new Promise(resolve=>server.close(resolve));
    ctx.db.close();
    await rm(dataDir,{recursive:true,force:true});
  }
});
