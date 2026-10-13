import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {annotationBounds,mountReader} from '../public/assets/academy-reader.js';

test('Índice clicável do catálogo usa a API de pontos disponível no PDF.js instalado',async()=>{
  // Polyfill browser byte encoding only in this Node inspection harness.
  const nativeHex=Uint8Array.prototype.toHex;
  if(!nativeHex)Object.defineProperty(Uint8Array.prototype,'toHex',{value(){return Buffer.from(this).toString('hex');},configurable:true});
  const {getDocument}=await import('../public/assets/pdfjs/pdf.mjs');
  const task=getDocument({data:new Uint8Array(await readFile(new URL('../content/library/files/catalogo-pap.pdf',import.meta.url))),isEvalSupported:false,useSystemFonts:true});
  try{
    const document=await task.promise,page=await document.getPage(1),annotations=await page.getAnnotations();
    assert.equal(annotations.filter(a=>a.dest).length,5);
    for(const rotation of [0,90,180,270]){
      const viewport=page.getViewport({scale:1.5,rotation});
      for(const annotation of annotations.filter(a=>a.dest)){
        const bounds=annotationBounds(viewport,annotation.rect);
        assert.ok(bounds.width>0&&bounds.height>0);
        assert.ok(bounds.left>=-1&&bounds.top>=-1);
        assert.ok(bounds.left+bounds.width<=viewport.width+1);
        assert.ok(bounds.top+bounds.height<=viewport.height+1);
      }
    }
  }finally{await task.destroy();if(!nativeHex)delete Uint8Array.prototype.toHex;}
});

test('Anotações sem retângulo válido são ignoradas sem interromper a página',()=>{
  const viewport={convertToViewportPoint(){throw new Error('Invalid rectangles must not reach the renderer.');}};
  for(const rect of [null,undefined,[],[0,1,2],[0,0,NaN,2],[0,0,Infinity,4],['1',2,3,4]])assert.equal(annotationBounds(viewport,rect),null);
});

test('Redimensionar durante a leitura não desfaz uma página solicitada nem sua retomada',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});
  const old={document:globalThis.document,ResizeObserver:globalThis.ResizeObserver,localStorage:globalThis.localStorage,history:globalThis.history,devicePixelRatio:globalThis.devicePixelRatio};
  let resize,releaseText,textPending=true;const written=[],routes=[],nodes=new Map();
  const node=()=>({style:{setProperty(){}},hidden:false,disabled:false,clientWidth:700,children:[],events:{},setAttribute(){},addEventListener(type,fn){this.events[type]=fn;},replaceChildren(...values){this.children=values;},append(value){this.children.push(value);},getContext(){return {};}});
  for(const id of ['reader-stage','reader-canvas','reader-page','reader-text','reader-links','reader-status','reader-prev','reader-next','reader-number','reader-total','reader-label','reader-fit','reader-zoom-out','reader-zoom-in','reader-topic','reader-original'])nodes.set(id,node());
  const element={isConnected:true,querySelector(selector){return nodes.get(selector.slice(1));}};
  globalThis.document={createElement:node};globalThis.ResizeObserver=class{constructor(fn){resize=fn;}observe(){}disconnect(){}};
  globalThis.localStorage={getItem(){return null;},setItem(){}};globalThis.history={replaceState(_state,_title,url){routes.push(url);}};globalThis.devicePixelRatio=1;
  const pendingText=new Promise(resolve=>releaseText=resolve);
  const document={numPages:3,async getPage(number){return {getViewport({scale}){return {width:500*scale,height:700*scale};},render(){return {promise:Promise.resolve(),cancel(){}};},getTextContent(){if(number===1&&textPending){textPending=false;return pendingText;}return Promise.resolve({items:[]});},async getAnnotations(){return [];}};}};
  const pdf={getDocument(){return {promise:Promise.resolve(document),destroy(){}};},TextLayer:class{async render(){}cancel(){}}};
  const turn=()=>new Promise(resolve=>setImmediate(resolve));let reader;
  try{
    reader=mountReader({element,item:{id:'isolated',title:'Material de teste',asset:{id:'pdf-v1'}},userId:'own-account',loadLibrary:async()=>pdf,onProgress:(page,pages)=>written.push({page,pages})});
    await turn();assert.equal(textPending,false);
    nodes.get('reader-next').events.click();resize();t.mock.timers.tick(120);releaseText({items:[]});
    for(let i=0;i<12&&written.at(-1)?.page!==2;i++)await turn();await reader.flush();
    assert.equal(nodes.get('reader-number').value,2);assert.deepEqual(written.at(-1),{page:2,pages:3});assert.equal(routes.at(-1),'#material/isolated/pagina/2');
  }finally{reader?.destroy();for(const [key,value] of Object.entries(old)){if(value===undefined)delete globalThis[key];else globalThis[key]=value;}}
});
