import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createContext,runInContext} from 'node:vm';
const source=await readFile(new URL('../public/assets/chat-composer.js',import.meta.url),'utf8');
const settle=async()=>{for(let i=0;i<4;i++)await new Promise(r=>setImmediate(r));};
function harness({defer=false,denied=false}={}){
  const listeners=new Map(),nodes=new Map(),timers=new Map(),recorders=[];let calls=0,stops=0,network=0,resolveStream,revoked=0,time=0;
  const node=key=>{if(nodes.has(key))return nodes.get(key);const value={value:'',hidden:true,innerHTML:'',textContent:'',disabled:false,attrs:{},focus(){},setAttribute(k,v){this.attrs[k]=v;}};nodes.set(key,value);return value;};
  const controls=Array.from({length:4},(_,i)=>node('tool'+i));
  const form={isConnected:true,elements:{message:node('message')},innerHTML:'',querySelector:node,querySelectorAll:()=>controls,addEventListener:(k,v)=>listeners.set(k,v)};
  const mediaStream={getTracks:()=>[{stop(){stops++;}}]};
  class Recorder{
    static isTypeSupported(type){return type.startsWith('audio/webm');}
    constructor(){this.state='inactive';recorders.push(this);}
    start(){this.state='recording';}
    stop(){this.state='inactive';this.ondataavailable?.({data:new Blob([Buffer.alloc(64,1)],{type:'audio/webm'})});this.onstop?.();}
  }
  class BrowserURL extends URL{static createObjectURL(){return 'blob:qa-audio';}static revokeObjectURL(){revoked++;}}
  const clock=class extends Date{static now(){return time;}};
  const context=createContext({Blob,File,FormData,Buffer,URL:BrowserURL,Date:clock,MediaRecorder:Recorder,navigator:{mediaDevices:{getUserMedia(){calls++;if(denied)return Promise.reject(Object.assign(new Error('Denied'),{name:'NotAllowedError'}));if(defer)return new Promise(r=>resolveStream=r);return Promise.resolve(mediaStream);}}},document:{addEventListener(){},removeEventListener(){},hidden:false},setInterval:fn=>{timers.set(1,fn);return 1;},clearInterval:id=>timers.delete(id),console,fetch:async()=>{network++;throw new Error('Test must not send.');}});
  runInContext(source.replace('export function','function')+'\nglobalThis.mount=mountChatComposer;',context);
  const dispose=context.mount({element:form,squadId:'qa-squad',api:async()=>network++,esc:v=>v,icon:()=>'',toast(){},onSent(){}});
  const click=selector=>listeners.get('click')({target:{closest:s=>s===selector?{}:null}});
  return {node,form,timers,recorders,click,dispose,setTime:value=>time=value,resolve:()=>resolveStream(mediaStream),stats:()=>({calls,stops,network,revoked})};
}
test('Gravação só pede microfone após clique, gera prévia e libera o dispositivo antes do envio',async()=>{
  const h=harness();assert.equal(h.stats().calls,0);h.click('[data-chat-record]');await settle();assert.equal(h.recorders[0].state,'recording');assert.equal(h.node('[type=submit]').disabled,true);
  h.setTime(5000);h.click('[data-chat-record]');await settle();assert.equal(h.stats().stops,1);assert.equal(h.stats().network,0);assert.match(h.node('[data-chat-preview]').innerHTML,/Áudio pronto para enviar/);assert.equal(h.node('[data-chat-preview]').hidden,false);h.dispose();assert.equal(h.stats().revoked,1);
});
test('Sair da página enquanto o microfone aguarda permissão encerra o acesso tardio sem enviar áudio',async()=>{
  const h=harness({defer:true});h.click('[data-chat-record]');h.dispose();h.form.isConnected=false;h.resolve();await settle();assert.equal(h.stats().stops,1);assert.equal(h.stats().network,0);assert.equal(h.recorders.length,0);
});
test('Limite de dois minutos encerra a gravação; permissão recusada devolve controles utilizáveis',async()=>{
  const h=harness();h.click('[data-chat-record]');await settle();h.setTime(120000);h.timers.get(1)();assert.equal(h.recorders[0].state,'inactive');assert.equal(h.timers.size,0);assert.match(h.node('[data-chat-preview]').innerHTML,/Áudio pronto para enviar/);h.dispose();
  const denied=harness({denied:true});denied.click('[data-chat-record]');await settle();assert.match(denied.node('[data-chat-error]').textContent,/Permita o microfone/);assert.equal(denied.node('[data-chat-record-status]').hidden,true);denied.dispose();
});
