import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,dirname,basename} from 'node:path';
import {randomBytes} from 'node:crypto';
import {createApp} from '../server.mjs';
import {safeNextPath,invitationTokenFromInput,rememberedLogin} from '../public/assets/login-flow.js';

test('A tela de acesso não redireciona para destinos externos e aceita somente convites da própria ST1 Academy',()=>{
  const origin='http://localhost:4187',token=randomBytes(32).toString('base64url');
  assert.equal(safeNextPath('/#acessos',origin),'/#acessos');
  assert.equal(safeNextPath('/index.html#prova/identificacao',origin),'/index.html#prova/identificacao');
  for(const input of ['https://outro.example/','//outro.example/','javascript:alert(1)','/login?next=/login','/api/admin/report'])assert.equal(safeNextPath(input,origin),'/#inicio');
  assert.equal(invitationTokenFromInput(origin+'/login?convite='+token,origin),token);
  assert.equal(invitationTokenFromInput(origin+'/?convite='+token,origin),token);
  assert.equal(invitationTokenFromInput(token,origin),token);
  assert.equal(invitationTokenFromInput('https://outro.example/login?convite='+token,origin),null);
  assert.equal(invitationTokenFromInput(origin+'/api/verify?convite='+token,origin),null);
  assert.equal(invitationTokenFromInput('convite-invalido',origin),null);
});

test('Preferência de login contém somente e-mail e consentimento',()=>{
  assert.deepEqual(rememberedLogin(JSON.stringify({email:'vendedor@example.test',remember:true,password:'não deve ser lida'})),{email:'vendedor@example.test',remember:true});
  assert.equal(rememberedLogin('{malformed'),null);
  assert.equal(rememberedLogin(JSON.stringify({email:'vendedor@example.test',remember:false})),null);
  assert.equal(rememberedLogin(JSON.stringify({email:'inválido',remember:true})),null);
});

test('Login e primeiro acesso funcionam com sessões persistentes opcionais e mantêm o perfil definido no convite',async t=>{
  const directory=await mkdtemp(resolve(tmpdir(),'st1-academy-login-test-'));
  const baseURL='http://localhost:4187';
  const {app,ctx}=await createApp({dataDir:directory,baseURL,testMode:true});
  const server=await new Promise(resolve=>{const instance=app.listen(4187,'127.0.0.1',()=>resolve(instance));});
  const clients={remembered:{cookie:''},temporary:{cookie:''}};
  const passwords={remembered:randomBytes(24).toString('base64url'),temporary:randomBytes(24).toString('base64url')};
  const request=async(client,path,{body,headers={}}={})=>{
    const response=await fetch(baseURL+path,{method:body?'POST':'GET',redirect:'manual',headers:{Origin:baseURL,Connection:'close',...(client?.cookie?{Cookie:client.cookie}:{}),...(body?{'Content-Type':'application/json'}:{}),...headers},...(body?{body:JSON.stringify(body)}:{})});
    const cookies=response.headers.getSetCookie();if(client&&cookies.length)client.cookie=cookies.filter(c=>!c.includes('Max-Age=0')).map(c=>c.split(';')[0]).join('; ');
    const text=await response.text();let data;try{data=JSON.parse(text);}catch{}
    return {status:response.status,location:response.headers.get('location'),text,data,cookies};
  };
  try{
    await t.test('a página de login é pública e a entrada da Academy exige uma conta',async()=>{
      const login=await request(null,'/login');assert.equal(login.status,200);assert.match(login.text,/Entrar \| ST1 Academy/);assert.match(login.text,/Criar conta/);
      assert.equal((await request(null,'/')).location,'/login');assert.equal((await request(null,'/index.html')).status,302);
    });
    for(const [key,rememberMe] of [['remembered',true],['temporary',false]]){
      await t.test(`primeiro acesso com salvar login ${rememberMe?'marcado':'desmarcado'} respeita perfil e cookie`,async()=>{
        const email=key+'-login@example.test',invite=ctx.createInvitation({name:'Participante de teste '+key,email,role:key==='remembered'?'supervisor':'seller',tracks:['pap']});
        const token=new URL(invite.url).searchParams.get('convite');assert.equal(new URL(invite.url).pathname,'/login');
        const oldLink=await request(null,'/?convite='+token);assert.equal(oldLink.status,302);assert.equal(oldLink.location,'/login?convite='+token);
        const register=await request(clients[key],'/api/auth/sign-up/email',{body:{name:'Nome adulterado',email,password:passwords[key],rememberMe,role:'admin'},headers:{'x-academy-invite':token}});assert.equal(register.status,200);
        const sessionCookie=register.cookies.find(c=>c.includes('.session_token='));assert.ok(sessionCookie);assert.equal(/Max-Age=\d+/.test(sessionCookie),rememberMe);
        const profile=(await request(clients[key],'/api/me')).data;assert.equal(profile.role,key==='remembered'?'supervisor':'seller');assert.equal(profile.name,'Participante de teste '+key);
        const googleReturn=await request(clients[key],'/google/connected?first=1');assert.equal(googleReturn.status,302);assert.ok(googleReturn.location?.startsWith('/'));
        assert.equal((await request(clients[key],'/api/profile')).status,403);
        assert.equal((await request(clients[key],'/')).status,200);
        await request(clients[key],'/api/auth/sign-out',{body:{}});
        const signin=await request(clients[key],'/api/auth/sign-in/email',{body:{email,password:passwords[key],rememberMe}});assert.equal(signin.status,200);
        const signinCookie=signin.cookies.find(c=>c.includes('.session_token='));assert.equal(/Max-Age=\d+/.test(signinCookie),rememberMe);
      });
    }
    await t.test('sair impede reabrir o painel, e cadastro sem convite continua bloqueado',async()=>{
      await request(clients.remembered,'/api/auth/sign-out',{body:{}});
      assert.equal((await request(clients.remembered,'/')).status,302);
      assert.equal((await request(null,'/api/auth/sign-up/email',{body:{name:'Sem convite',email:'login-without-invite@example.test',password:randomBytes(24).toString('base64url'),rememberMe:true,role:'admin'}})).status,403);
      assert.equal((await request(null,'/api/auth/sign-in/email',{body:{email:'remembered-login@example.test',password:'SenhaIncorretaDeTeste',rememberMe:true}})).status,401);
    });
  }finally{await new Promise(resolve=>server.close(resolve));ctx.db.close();assert.equal(dirname(directory),resolve(tmpdir()));assert.ok(basename(directory).startsWith('st1-academy-login-test-'));await rm(directory,{recursive:true,force:true});}
});
