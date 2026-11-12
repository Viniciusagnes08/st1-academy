import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createContext,runInContext} from 'node:vm';

const source=(await readFile(new URL('../public/assets/knowledge.js',import.meta.url),'utf8')).replace(/^import .*;\r?$/gm,'').replace(/^export /gm,'');
const pending=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
const tick=()=>new Promise(done=>setImmediate(done));
function harness(){
  const library=pending(),game=pending(),views=[],nodes=new Map(),location={hash:'#inicio'};
  const node=key=>{if(!nodes.has(key))nodes.set(key,{innerHTML:'',setAttribute(name,value){this[name]=value;},close(){}});return nodes.get(key);};
  const main={addEventListener(){},querySelector:node};
  const profile={id:'seller',name:'Pessoa de teste',role:'seller',certificates:[],attempts:[]};
  const context=createContext({location,console,URL,Set,Map,trackStudy(){},document:{},Promise});
  runInContext(source+'\nglobalThis.make=createKnowledgePanel;',context);
  const panel=context.make({main,commitView:html=>{views.push(html);nodes.clear();},api:path=>{if(path==='/api/profile')return Promise.resolve({fields:{}});assert.equal(path,'/api/library');return library.promise;},esc:String,icon:()=>'',tracks:()=>[{id:'pap',name:'PAP'}],user:()=>profile,hasAccess:()=>true,engagement:async()=>({journeyMarkup:()=>game.promise}),toast(){}});
  const data={items:[{id:'content-1',title:'Meu próximo estudo',summary:'Resumo',category:'treinamentos',kind:'text',tracks:['pap'],modules:['module-1'],study:{completed:false,started:false}}],modules:[{id:'module-1',title:'Comercial',description:'Descrição do módulo',tracks:['pap']}],reading:null,recent:null};
  return {panel,library,game,views,node,location,data};
}
test('Início aparece antes da biblioteca e preenche módulos sem esperar a gamificação',async()=>{
  const h=harness(),loading=h.panel.home();await tick();
  assert.equal(h.views.length,1);assert.match(h.views[0],/Olá, Pessoa|Starzinho/);assert.match(h.views[0],/Carregando seus módulos/);assert.doesNotMatch(h.views[0],/0 estudos concluídos/);
  h.library.resolve(h.data);await loading;
  assert.equal(h.views.length,2);assert.match(h.views[1],/Meu próximo estudo|Comercial/);assert.match(h.views[1],/Preparando seu próximo passo/);
  h.game.resolve({hero:'<p>Missão pronta</p>',section:'<p>25 XP</p>'});await tick();
  assert.equal(h.node('[data-home-game-hero]').innerHTML,'<p>Missão pronta</p>');assert.equal(h.node('[data-home-game-section]').innerHTML,'<p>25 XP</p>');assert.equal(h.node('[data-home-game-section]')['aria-busy'],'false');
});
test('Solicitações antigas não sobrescrevem a página após a pessoa sair do Início',async()=>{
  const h=harness(),loading=h.panel.home();await tick();h.location.hash='#acessos';
  h.library.resolve(h.data);h.game.resolve({hero:'Resposta antiga',section:'Resposta antiga'});await loading;await tick();
  assert.equal(h.views.length,1);assert.equal(h.node('[data-home-game-section]').innerHTML,'');
});
test('Falha da evolução mantém módulos carregados e oferece retomada',async()=>{
  const h=harness(),loading=h.panel.home();await tick();h.game.reject(new Error('Conexão temporariamente indisponível'));await tick();h.library.resolve(h.data);await loading;
  assert.match(h.views.at(-1),/Meu próximo estudo/);assert.match(h.views.at(-1),/Conexão temporariamente indisponível/);assert.match(h.views.at(-1),/data-retry-connection/);assert.doesNotMatch(h.views.at(-1),/Preparando seu próximo passo/);
});
