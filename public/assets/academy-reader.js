let libraryPromise;
const library=()=>libraryPromise??=import('./pdfjs/pdf.mjs').then(module=>{module.GlobalWorkerOptions.workerSrc=new URL('./pdfjs/pdf.worker.mjs',import.meta.url).href;return module;});

export function annotationBounds(viewport,rect){
  if(!Array.isArray(rect)||rect.length!==4||rect.some(value=>!Number.isFinite(value)))return null;
  const first=viewport.convertToViewportPoint(rect[0],rect[1]),last=viewport.convertToViewportPoint(rect[2],rect[3]);
  return {left:Math.min(first[0],last[0]),top:Math.min(first[1],last[1]),width:Math.abs(first[0]-last[0]),height:Math.abs(first[1]-last[1])};
}

export function mountReader({element,item,userId,initialPage,onProgress,loadLibrary=library}){
  const find=id=>element.querySelector('#'+id),stage=find('reader-stage'),canvas=find('reader-canvas'),box=find('reader-page'),textBox=find('reader-text'),linksBox=find('reader-links'),status=find('reader-status');
  const storageKey='st1-academy.reading.'+userId+'.'+item.id+'.'+item.asset.id,events=new AbortController();
  let documentPDF,loading,renderTask,textTask,disposed=false,rendering=false,pending=null,zoom=1,pageNumber=1,resizeTimer,progressQueue=Promise.resolve();
  try{pageNumber=Number(initialPage)||Number(localStorage.getItem(storageKey))||1;}catch{pageNumber=Number(initialPage)||1;}
  let targetPage=pageNumber;
  const controls=()=>{find('reader-prev').disabled=!documentPDF||pageNumber<=1;find('reader-next').disabled=!documentPDF||pageNumber>=documentPDF.numPages;find('reader-number').value=pageNumber;find('reader-number').max=documentPDF?.numPages||item.pages||1;find('reader-total').textContent='/ '+(documentPDF?.numPages||item.pages||'—');find('reader-label').textContent='Página '+pageNumber+' de '+(documentPDF?.numPages||item.pages||'—');find('reader-fit').textContent=zoom===1?'Ajustar':Math.round(zoom*100)+'%';find('reader-zoom-out').disabled=zoom<=.75;find('reader-zoom-in').disabled=zoom>=2.5;const current=(item.sections||[]).filter(s=>s.page<=pageNumber).at(-1);find('reader-topic').value=current?.page||pageNumber;find('reader-original').href='/api/contents/'+item.id+'/file#page='+pageNumber;};
  async function annotations(page,viewport){
    for(const annotation of await page.getAnnotations()){
      if(disposed||!annotation.rect)continue;const bounds=annotationBounds(viewport,annotation.rect);if(!bounds)continue;let link;
      if(annotation.dest){let destination=typeof annotation.dest==='string'?await documentPDF.getDestination(annotation.dest):annotation.dest;if(!Array.isArray(destination))continue;const target=typeof destination[0]==='number'?destination[0]+1:(await documentPDF.getPageIndex(destination[0]))+1;link=document.createElement('button');link.type='button';link.setAttribute('aria-label','Ir para a página '+target);link.addEventListener('click',()=>render(target),{signal:events.signal});}
      else if(annotation.url){let url;try{url=new URL(annotation.url);}catch{continue;}if(!['https:','http:'].includes(url.protocol))continue;link=document.createElement('a');link.href=url.href;link.target='_blank';link.rel='noopener noreferrer';link.setAttribute('aria-label','Abrir recurso do material');}else continue;
      link.style.left=bounds.left+'px';link.style.top=bounds.top+'px';link.style.width=bounds.width+'px';link.style.height=bounds.height+'px';linksBox.append(link);
    }
  }
  async function render(number=targetPage){
    if(disposed||!documentPDF||!element.isConnected)return;
    targetPage=Math.max(1,Math.min(documentPDF.numPages,Number(number)||1));pending=targetPage;if(rendering){renderTask?.cancel();textTask?.cancel();return;}
    rendering=true;
    while(pending!==null&&!disposed&&element.isConnected){
      const requested=pending;pending=null;
      try{
        const page=await documentPDF.getPage(requested);if(disposed)break;pageNumber=requested;controls();
        const original=page.getViewport({scale:1}),width=Math.max(160,Math.min(900,stage.clientWidth-32)),scale=width/original.width*zoom,viewport=page.getViewport({scale}),ratio=Math.min(devicePixelRatio||1,2);
        box.style.width=viewport.width+'px';box.style.height=viewport.height+'px';box.style.setProperty('--scale-factor',String(scale));box.style.setProperty('--total-scale-factor',String(scale));
        canvas.width=Math.ceil(viewport.width*ratio);canvas.height=Math.ceil(viewport.height*ratio);canvas.style.width=viewport.width+'px';canvas.style.height=viewport.height+'px';canvas.setAttribute('aria-label',item.title+', página '+pageNumber);
        textBox.replaceChildren();linksBox.replaceChildren();stage.setAttribute('aria-busy','true');
        renderTask=page.render({canvasContext:canvas.getContext('2d'),viewport,transform:ratio===1?null:[ratio,0,0,ratio,0,0]});await renderTask.promise;if(disposed)break;
        status.hidden=true;box.hidden=false;
        const module=await loadLibrary(),text=await page.getTextContent();if(disposed)break;textTask=new module.TextLayer({textContentSource:text,container:textBox,viewport});await textTask.render();await annotations(page,viewport).catch(()=>console.warn('Academy PDF: os links desta página não puderam ser exibidos.'));
        if(disposed)break;try{localStorage.setItem(storageKey,String(pageNumber));}catch{}
        const savedPage=pageNumber,totalPages=documentPDF.numPages;
        progressQueue=progressQueue.then(()=>onProgress?.(savedPage,totalPages)).catch(()=>{});
        history.replaceState({},'','#material/'+item.id+'/pagina/'+pageNumber);stage.scrollTop=0;stage.scrollLeft=0;stage.setAttribute('aria-busy','false');
      }catch(error){if(!disposed&&!['RenderingCancelledException','AbortException'].includes(error.name)){console.warn('Academy PDF:',error.name,error.message);status.hidden=false;status.textContent='Não foi possível renderizar esta página. Você pode abrir o PDF original abaixo.';stage.setAttribute('aria-busy','false');}}
    }
    rendering=false;
  }
  const on=(id,event,handler)=>find(id).addEventListener(event,handler,{signal:events.signal});
  on('reader-prev','click',()=>render(targetPage-1));on('reader-next','click',()=>render(targetPage+1));on('reader-number','change',event=>render(event.target.value));on('reader-topic','change',event=>render(event.target.value));
  on('reader-zoom-in','click',()=>{zoom=Math.min(2.5,zoom+.25);render();});on('reader-zoom-out','click',()=>{zoom=Math.max(.75,zoom-.25);render();});on('reader-fit','click',()=>{zoom=1;render();});
  stage.addEventListener('keydown',event=>{if(event.target!==stage)return;if(event.key==='ArrowRight'){event.preventDefault();render(targetPage+1);}if(event.key==='ArrowLeft'){event.preventDefault();render(targetPage-1);}},{signal:events.signal});
  const observer=new ResizeObserver(()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>render(),120);});observer.observe(stage);
  (async()=>{try{const module=await loadLibrary();if(disposed)return;const source=item.asset.size>18*1024*1024?{data:await (await import('./binary-read.js')).readPrivateFile(item,{signal:events.signal,onProgress:(loaded,total)=>{if(!disposed)status.textContent='Preparando material: '+Math.round(loaded/total*100)+'%';}})}:{url:'/api/contents/'+item.id+'/file',withCredentials:true};if(disposed)return;loading=module.getDocument({...source,isEvalSupported:false});documentPDF=await loading.promise;if(disposed){documentPDF.destroy();return;}const sections=item.sections?.length?item.sections:Array.from({length:documentPDF.numPages},(_,index)=>({page:index+1,title:'Página '+(index+1)}));find('reader-topic').replaceChildren(...sections.map(section=>{const option=document.createElement('option');option.value=section.page;option.textContent=section.page+'. '+section.title;return option;}));render(pageNumber);}catch(error){if(!disposed){status.textContent='Não foi possível abrir o material aqui. Use o PDF original abaixo.';status.hidden=false;}}})();
  return {flush:()=>progressQueue,destroy(){disposed=true;events.abort();observer.disconnect();clearTimeout(resizeTimer);renderTask?.cancel();textTask?.cancel();loading?.destroy();}};
}
