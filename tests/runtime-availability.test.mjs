import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,dirname,basename} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createContext,runInContext} from 'node:vm';
import {invitationTokenFromInput,rememberedLogin,verifySignedInMember} from '../public/assets/login-flow.js';

const academySource=await readFile(new URL('../public/assets/academy.js',import.meta.url),'utf8');
const loginSource=await readFile(new URL('../public/assets/login.js',import.meta.url),'utf8');
const member={name:'Admin preservado',role:'admin',tracks:[],permissions:[],certificates:[],attempts:[]};
const catalog={tracks:[],testMode:true};
const json=(data,status=200)=>({status,ok:status>=200&&status<300,json:async()=>data});
const settle=async()=>{for(let i=0;i<4;i++)await new Promise(resolve=>setImmediate(resolve));};

function harness(source,{hostname='localhost',hash='#trilhas',search='',fetcher}={}){
  const elements=new Map(),events=new Map(),navigation=[],storage=new Map([['st1-academy.remembered-login','{"email":"admin@example.test","remember":true}']]);
  const element=key=>{
    if(elements.has(key))return elements.get(key);
    const value={innerHTML:'',textContent:'',hidden:false,disabled:false,dataset:{},style:{},isConnected:true,
      classList:{contains:()=>false,add(){},remove(){},toggle(){}},
      addEventListener(name,handler){events.set(key+':'+name,handler);},setAttribute(){},removeAttribute(){},focus(){},
      querySelector(){return {insertAdjacentHTML:(_where,html)=>{value.innerHTML+=html;}};},
      append(...children){value.innerHTML+=children.map(child=>child.textContent||'').join('');}};
    elements.set(key,value);return value;
  };
  const origin='http://'+hostname+':4177';
  const location={hostname,origin,hash,search,pathname:source==='login'?'/login':'/',href:origin+(source==='login'?'/login':'/')+search+hash,
    assign:url=>navigation.push({kind:'assign',url}),replace:url=>navigation.push({kind:'replace',url})};
  const context=createContext({URL,URLSearchParams,console,fetch:fetcher,location,
    history:{replaceState(_state,_title,url){navigation.push({kind:'history',url});}},
    document:{body:{dataset:{},style:{},classList:{contains:()=>false,remove(){},add(){}}},querySelector:element,querySelectorAll:()=>[],addEventListener(){},createElement:tag=>element('created-'+tag)},
    window:{scrollTo(){}},navigator:{},matchMedia:()=>({matches:false,addEventListener(){}}),
    localStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)},
    addEventListener:(name,handler)=>events.set('window:'+name,handler),setTimeout:()=>0,
    initLoginMotion(){},invitationTokenFromInput,rememberedLogin,verifySignedInMember});
  const code=source==='academy'?academySource.replace(/  init\(\);\s*\}\)\(\);\s*$/,'  globalThis.runtime={state,init,api,render,contextualActions};\n  init();\n})();'):loginSource.replace(/^import .*;\r?$/gm,'')+'\nglobalThis.runtime={state,init,api,render};';
  runInContext(code,context);
  return {context,runtime:context.runtime,elements,events,navigation,storage,location};
}

test('Academy mostra como religar o servidor local sem redirecionar nem perder a página',async()=>{
  const h=harness('academy',{hash:'#cadastros/certificates/novo',fetcher:async()=>{throw new TypeError('Failed to fetch');}});
  await settle();
  const html=h.elements.get('#main').innerHTML;
  assert.match(html,/Abrir ST1 Academy\.cmd/);assert.match(html,/data-retry-connection/);
  assert.doesNotMatch(html,/Failed to fetch|href="\/login"/);
  assert.equal(h.location.hash,'#cadastros/certificates/novo');assert.equal(h.navigation.length,0);
});

test('Ações internas de gestão respeitam o perfil e o acompanhamento liberado',async()=>{
  for(const [role,permissions,canFollow] of [['seller',['materials','assessments','community'],false],['supervisor',['materials','assessments','community'],false],['supervisor',['materials','assessments','team_results'],true],['admin',[],true]]){
    const person={...member,role,permissions};
    const h=harness('academy',{fetcher:async path=>json(path==='/api/me'?person:catalog)});await settle();
    for(const route of ['#cadastros','#conteudos','#perfil']){
      const html=h.runtime.contextualActions(route);
      assert.equal(Boolean(html),role==='admin','Ações de configuração precisam de Admin: '+route);
    }
    const teamHtml=h.runtime.contextualActions('#gestao');
    assert.equal(Boolean(teamHtml),canFollow);
    if(canFollow)assert.match(teamHtml,/#agenda-participacao|#pedidos-squad/);
    const squadHtml=h.runtime.contextualActions('#squad');
    assert.equal(squadHtml.includes('#squads-gestao'),role==='admin');
    assert.equal(squadHtml.includes('#pedidos-squad'),canFollow);
  }
});

test('O mapa admite estudo ou avaliações, e as provas relâmpago exigem avaliações liberadas',async()=>{
  for(const permissions of [[],['materials'],['assessments']]){
    const person={...member,role:'seller',permissions};
    const h=harness('academy',{fetcher:async path=>json(path==='/api/me'?person:catalog)});await settle();
    const html=h.runtime.contextualActions('#trilhas');
    assert.equal(h.elements.get('#knowledge-map-nav').hidden,!permissions.includes('assessments')&&!permissions.includes('materials'));
    assert.equal(html.includes('#conhecimento'),false,'O mapa usa o atalho lateral, sem repetir o botão da página.');
    assert.equal(html.includes('#desafios'),permissions.includes('assessments'));
    assert.equal(h.runtime.contextualActions('#cadastros'), '');
  }
});

test('Queda e retomada do servidor conservam a conta e retomam a rota selecionada',async()=>{
  let online=true;
  const h=harness('academy',{fetcher:async path=>{if(!online)throw new TypeError('network');return json(path==='/api/me'?member:catalog);}});
  await settle();assert.equal(h.runtime.state.user.name,member.name);
  online=false;h.location.hash='#conquistas';await h.events.get('window:hashchange')();
  assert.equal(h.runtime.state.user.name,member.name);assert.match(h.elements.get('#main').innerHTML,/Tentar novamente/);assert.equal(h.navigation.length,0);
  online=true;const retry={disabled:false};await h.events.get('#main:click')({target:{closest:selector=>selector==='[data-retry-connection]'?retry:null}});
  assert.equal(h.location.hash,'#conquistas');assert.match(h.elements.get('#main').innerHTML,/Minhas conquistas/);assert.equal(h.runtime.state.user.name,member.name);
});

test('Erros 503 e respostas HTML não são confundidos com perda da autenticação em um domínio remoto',async()=>{
  for(const response of [503,200,401,403].map(status=>({status,ok:status===200,json:async()=>{throw new SyntaxError('html');}}))){
    const h=harness('academy',{hostname:'academy.example.test',fetcher:async()=>response});await settle();
    const html=h.elements.get('#main').innerHTML;assert.match(html,/temporariamente indisponível/);assert.doesNotMatch(html,/Abrir ST1 Academy|SyntaxError|Unexpected token/);assert.equal(h.navigation.length,0);
  }
});

test('Somente o 401 real encaminha para o login; o 403 real mostra o bloqueio',async()=>{
  for(const status of [401,403]){
    const h=harness('academy',{hash:'#conquistas',fetcher:async path=>json(path==='/api/me'?{message:'Acesso bloqueado pelo gestor'}:catalog,path==='/api/me'?status:200)});await settle();
    if(status===401){assert.equal(h.navigation.length,1);assert.match(h.navigation[0].url,/^\/login\?next=%2F%23conquistas$/);}
    else{assert.equal(h.navigation.length,0);assert.match(h.elements.get('#main').innerHTML,/Seu acesso está bloqueado/);}
  }
});

test('Login com rede indisponível oferece retomada e não apresenta Google como configuração pendente',async()=>{
  const h=harness('login',{fetcher:async()=>{throw new TypeError('network');}});await settle();
  const html=h.elements.get('#entry-content').innerHTML;
  assert.match(html,/Abrir ST1 Academy\.cmd/);assert.match(html,/Tentar novamente/);assert.match(html,/conexão com a Academy/);
  assert.doesNotMatch(html,/Google em configuração/);assert.equal(h.navigation.length,0);assert.equal(h.storage.size,1);
});

test('Retomar o login preserva a conta e a configuração Google já conferidas',async()=>{
  let online=true;
  const h=harness('login',{fetcher:async path=>{if(!online)throw new TypeError('network');return json(path==='/api/me'?member:path==='/api/auth-settings'?{googleEnabled:true}:catalog);}});await settle();
  online=false;await h.runtime.init();assert.equal(h.runtime.state.user.name,member.name);assert.equal(h.runtime.state.googleEnabled,true);assert.match(h.elements.get('#entry-content').innerHTML,/Tentar novamente/);
  online=true;const retry={disabled:false,isConnected:false};await h.events.get('#entry-content:click')({target:{closest:selector=>selector==='[data-retry-connection]'?retry:null}});
  assert.equal(h.runtime.state.unavailable,false);assert.equal(h.runtime.state.user.name,member.name);assert.match(h.elements.get('#entry-content').innerHTML,/Você já está conectado/);assert.doesNotMatch(h.elements.get('#entry-content').innerHTML,/indisponível|Tentar novamente/);assert.equal(h.navigation.length,0);
});

test('Indisponibilidade preserva o convite e mostra instrução genérica no login remoto',async()=>{
  const token='a'.repeat(40);
  const h=harness('login',{hostname:'academy.example.test',search:'?convite='+token,fetcher:async()=>{throw new TypeError('network');}});await settle();
  assert.equal(h.runtime.state.token,token);assert.match(h.elements.get('#entry-content').innerHTML,/temporariamente indisponível/);assert.doesNotMatch(h.elements.get('#entry-content').innerHTML,/Abrir ST1 Academy|Google em configuração/);
});

test('Erro 503 nas configurações não apaga uma conta válida nem declara Google em configuração',async()=>{
  const h=harness('login',{fetcher:async path=>path==='/api/auth-settings'?json({message:'unavailable'},503):json(path==='/api/me'?member:catalog)});await settle();
  assert.equal(h.runtime.state.user.name,member.name);assert.equal(h.runtime.state.unavailable,true);assert.doesNotMatch(h.elements.get('#entry-content').innerHTML,/Google em configuração/);assert.equal(h.navigation.length,0);
});

test('Resposta HTML com 401 ou 403 também conserva a sessão já conhecida no login',async()=>{
  for(const status of [401,403]){
    let online=true;
    const h=harness('login',{fetcher:async path=>online?json(path==='/api/me'?member:path==='/api/auth-settings'?{googleEnabled:true}:catalog):{status,ok:false,json:async()=>{throw new SyntaxError('html');}}});await settle();
    online=false;await h.runtime.init();assert.equal(h.runtime.state.user.name,member.name);assert.equal(h.runtime.state.unavailable,true);assert.equal(h.navigation.length,0);
  }
});

test('Setup lê a mesma configuração privada usada pelo servidor',async()=>{
  const pkg=JSON.parse(await readFile(new URL('../package.json',import.meta.url),'utf8'));
  const directory=await mkdtemp(resolve(tmpdir(),'st1-academy-setup-env-test-'));
  try{
    await mkdir(resolve(directory,'scripts'));
    const setup=(await readFile(new URL('../scripts/setup.mjs',import.meta.url),'utf8')).replace("'../lib/context.mjs'",JSON.stringify(new URL('../lib/context.mjs',import.meta.url).href));
    await writeFile(resolve(directory,'scripts/setup.mjs'),setup);
    await writeFile(resolve(directory,'.env'),`ACADEMY_BASE_URL=http://localhost:4199\nACADEMY_DATA_DIR=${resolve(directory,'data')}\nACADEMY_TEST_MODE=1\n`);
    const env={...process.env,GOOGLE_CLIENT_ID:'',GOOGLE_CLIENT_SECRET:''};for(const key of ['ACADEMY_BASE_URL','ACADEMY_DATA_DIR','ACADEMY_TEST_MODE','VERCEL'])delete env[key];
    const result=await promisify(execFile)(process.execPath,pkg.scripts.setup.split(' ').slice(1).concat('--nome','Gestor de teste isolado','--email','setup-isolated@example.test'),{cwd:directory,env});
    assert.match(result.stdout,/http:\/\/localhost:4199\/login\?convite=/);
    assert.ok((await readFile(resolve(directory,'data/academy.sqlite'))).length>0);
  }finally{assert.equal(dirname(directory),resolve(tmpdir()));assert.ok(basename(directory).startsWith('st1-academy-setup-env-test-'));await rm(directory,{recursive:true,force:true});}
});
