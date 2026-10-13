import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,dirname,basename} from 'node:path';
import {randomBytes} from 'node:crypto';
import {createApp} from '../server.mjs';
import {verifySignedInMember} from '../public/assets/login-flow.js';

test('Uma oscilação da conexão preserva a sessão; uma conta bloqueada encerra o acesso',async()=>{
  for(const status of [undefined,500,503,401,403]){
    const calls=[],error=Object.assign(new Error('Falha simulada'),{status});
    await assert.rejects(verifySignedInMember(async path=>{calls.push(path);if(path==='/api/me')throw error;return {success:true};}),e=>e===error);
    assert.equal(calls.includes('/api/auth/sign-out'),status===403);
  }
});

test('Google aceita novo e-mail verificado sem convite e mantém a governança dos acessos',async t=>{
  const directory=await mkdtemp(resolve(tmpdir(),'st1-google-public-test-')),baseURL='http://localhost:4291';
  let {app,ctx}=await createApp({dataDir:directory,baseURL,testMode:true,includeLibrary:false,googleConfig:{clientId:'TEST-CLIENT',clientSecret:'TEST-SECRET'}});
  let server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
  const endpoint=()=> 'http://127.0.0.1:'+server.address().port;
  const request=async(client,path,{body,headers={}}={})=>{
    const response=await fetch(endpoint()+path,{method:body?'POST':'GET',redirect:'manual',headers:{Origin:baseURL,Connection:'close',...(client.cookies.size?{Cookie:[...client.cookies].map(([k,v])=>k+'='+v).join('; ')}:{}),...(body?{'Content-Type':'application/json'}:{}),...headers},...(body?{body:JSON.stringify(body)}:{})});
    for(const cookie of response.headers.getSetCookie()){const first=cookie.split(';')[0],cut=first.indexOf('='),name=first.slice(0,cut);if(/Max-Age=0/.test(cookie))client.cookies.delete(name);else client.cookies.set(name,first.slice(cut+1));}
    const text=await response.text();let data;try{data=JSON.parse(text);}catch{}
    return {status:response.status,data,location:response.headers.get('location')};
  };
  let rawProfile={sub:'google-new-user',email:'new-google@example.test',name:'Participante Google',email_verified:true};
  const mockProvider=async()=>{
    const authContext=await ctx.auth.$context,provider=authContext.socialProviders.find(p=>p.id==='google');
    provider.validateAuthorizationCode=async()=>({accessToken:'FAKE-ACCESS',refreshToken:'FAKE-REFRESH',accessTokenExpiresAt:new Date(Date.now()+3600000),scopes:['openid','email','profile']});
    provider.getUserInfo=async()=>{const mapped=await ctx.auth.options.socialProviders.google.mapProfileToUser(rawProfile);return {user:{id:rawProfile.sub,emailVerified:rawProfile.email_verified,...mapped},data:rawProfile};};
  };
  const oauth=async(client,token)=>{
    const start=await request(client,'/api/auth/sign-in/social',{body:{provider:'google',role:'admin',requestSignUp:false},headers:token?{'x-academy-invite':token}:{}});
    assert.equal(start.status,200);const state=new URL(start.data.url).searchParams.get('state');
    return request(client,'/api/auth/callback/google?code=QA-CODE&state='+encodeURIComponent(state));
  };
  const fresh=()=>({cookies:new Map()}),publicClient=fresh(),owner=fresh();
  try{
    await mockProvider();
    await t.test('conta nova entra como Vendedor, sem receber áreas ou trilhas de gestão',async()=>{
      const callback=await oauth(publicClient);assert.equal(callback.status,302);assert.ok(callback.location.includes('first=1'));
      const me=await request(publicClient,'/api/me');assert.equal(me.status,200);assert.equal(me.data.role,'seller');assert.deepEqual(me.data.tracks,[]);assert.deepEqual(me.data.permissions,[]);
      assert.equal((await request(publicClient,'/api/admin/access')).status,403);
      assert.equal((await request(publicClient,'/api/contents')).status,403);
    });
    await t.test('cadastro por senha sem convite não usa a abertura do Google para elevar permissões',async()=>{
      const result=await request(fresh(),'/api/auth/sign-up/email',{body:{name:'Forjado',email:'forged@example.test',emailVerified:true,role:'admin',password:randomBytes(24).toString('base64url')}});assert.equal(result.status,403);
    });
    const invite=ctx.createInvitation({name:'Admin de teste',email:'owner-google@example.test',role:'admin'}),token=new URL(invite.url).searchParams.get('convite');
    await t.test('um convite válido conserva o perfil e o nome definidos pela gestão',async()=>{
      rawProfile={sub:'google-owner',email:'owner-google@example.test',name:'Nome diferente no Google',email_verified:true};
      assert.equal((await oauth(owner,token)).status,302);
      const me=await request(owner,'/api/me');assert.equal(me.data.role,'admin');assert.equal(me.data.name,'Admin de teste');
    });
    await t.test('o mesmo cookie continua válido após reiniciar a aplicação',async()=>{
      await new Promise(resolve=>server.close(resolve));ctx.db.close();
      ({app,ctx}=await createApp({dataDir:directory,baseURL,testMode:true,includeLibrary:false,googleConfig:{clientId:'TEST-CLIENT',clientSecret:'TEST-SECRET'}}));
      server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});await mockProvider();
      const me=await request(owner,'/api/me');assert.equal(me.status,200);assert.equal(me.data.role,'admin');assert.equal(me.data.name,'Admin de teste');
    });
    await t.test('Google não reativa uma conta bloqueada nem aceita e-mail não verificado',async()=>{
      const publicId=(await request(publicClient,'/api/me')).data.id;ctx.db.prepare('UPDATE academy_member SET enabled=0 WHERE user_id=?').run(publicId);
      rawProfile={sub:'google-new-user',email:'new-google@example.test',name:'Participante Google',email_verified:true};
      const blocked=await oauth(fresh());assert.notEqual(blocked.location,baseURL+'/google/connected');assert.equal(ctx.db.prepare('SELECT enabled FROM academy_member WHERE user_id=?').get(publicId).enabled,0);
      rawProfile={sub:'not-verified',email:'not-verified@example.test',name:'Não verificado',email_verified:false};
      await oauth(fresh());assert.equal(ctx.db.prepare('SELECT count(*) n FROM user WHERE email=?').get(rawProfile.email).n,0);
    });
  }finally{
    await new Promise(resolve=>server.close(resolve));await ctx.auth.$context;ctx.db.close();
    assert.equal(dirname(directory),resolve(tmpdir()));assert.ok(basename(directory).startsWith('st1-google-public-test-'));await rm(directory,{recursive:true,force:true});
  }
});
