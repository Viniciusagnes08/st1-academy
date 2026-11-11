const $=selector=>document.querySelector(selector);
const api='/api/homologacao/m24';
const labels={legacy_unreviewed:'Legado sem revisão',review_due:'Revisão necessária',pending_review:'Aguardando revisão',approved:'Aprovado',blocked:'Bloqueado'};
const publication={draft:'Rascunho',published:'Publicado',archived:'Arquivado'};
const actionLabels={metadata:'Ficha atualizada',request:'Revisão solicitada',approve:'Aprovado',reject:'Devolvido para correção',block:'Bloqueado'};
let sources=[],detail=null,offset=0,total=0,loadSequence=0,pendingReview=null;
const node=(tag,value,className)=>{const el=document.createElement(tag);if(value!==undefined)el.textContent=String(value);if(className)el.className=className;return el;};
const request=async(path='',options={})=>{
  const response=await fetch(api+path,{credentials:'same-origin',...options,headers:{'Content-Type':'application/json',...options.headers}});
  let result;try{result=await response.json();}catch{throw new Error('Não foi possível ler a resposta. Entre novamente na Academy.');}
  if(!response.ok)throw new Error(result.message||'Não foi possível concluir. Reabra a ficha e tente novamente.');return result;
};
async function run(work){
  document.body.setAttribute('aria-busy','true');$('#feedback').textContent='';$('#dialog-feedback').textContent='';
  const buttons=[...document.querySelectorAll('button')],previous=buttons.map(b=>b.disabled);buttons.forEach(b=>b.disabled=true);
  try{await work();}catch(error){($('#detail-dialog').open?$('#dialog-feedback'):$('#feedback')).textContent=error.message;}
  finally{document.body.removeAttribute('aria-busy');buttons.forEach((b,i)=>b.disabled=previous[i]);$('#previous').disabled=offset===0;$('#next').disabled=offset+50>=total;}
}
function showDetail(value){
  detail=value;$('#detail-title').textContent=value.title;
  $('#detail-state').textContent=`${labels[value.effectiveState]} · Conteúdo v${value.contentRevision} · Ficha v${value.revision}`;
  const form=$('#metadata-form');for(const name of ['curator','criticality','nextReviewOn'])form.elements[name].value=value[name];
  const selected=new Set(value.sources.map(s=>s.id));$('#source-choices').replaceChildren(...sources.map(s=>{
    const label=node('label'),input=document.createElement('input');input.type='checkbox';input.name='sourceIds';input.value=s.id;input.checked=selected.has(s.id);label.append(input,node('span',s.title+' · '+s.version+' (r'+s.revision+')'));return label;
  }));
  if(!sources.length)$('#source-choices').append(node('p','Cadastre uma fonte antes de preencher a ficha.'));
  $('#history').replaceChildren(...value.history.map(event=>{
    const li=node('li');li.append(node('strong',actionLabels[event.action]||event.action),node('div',event.reason),node('small',new Date(event.created_at).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'})+' · ator '+event.actor_id));return li;
  }));
  if(!value.history.length)$('#history').append(node('li','Nenhuma decisão experimental registrada.'));
}
async function load(){
  const sequence=++loadSequence,params=new URLSearchParams(new FormData($('#filters')));params.set('offset',String(offset));params.set('limit','50');
  const [inventory,sourceData]=await Promise.all([request('?'+params),request('/sources')]);
  if(sequence!==loadSequence)return;sources=sourceData.items;total=inventory.total;
  $('#counts').replaceChildren(...Object.entries(labels).map(([state,label])=>{const card=node('div',undefined,'count');card.append(node('strong',inventory.counts[state]),node('span',label));return card;}));
  $('#inventory').replaceChildren(...inventory.items.map(item=>{
    const tr=node('tr'),title=node('td',item.title);title.append(node('small',item.tracks.join(', ')+' · conteúdo v'+item.contentRevision));
    const state=node('td');state.append(node('span',labels[item.effectiveState],'state state-'+item.effectiveState));
    const actions=node('td'),button=node('button','Abrir ficha');button.type='button';button.addEventListener('click',()=>run(async()=>{showDetail(await request('/contents/'+encodeURIComponent(item.contentId)));$('#review-form').reset();pendingReview=null;$('#detail-dialog').showModal();}));actions.append(button);
    tr.append(title,node('td',publication[item.publication]||item.publication),state,node('td',item.curator||'Não atribuído'),node('td',item.nextReviewOn||'Não definida'),actions);return tr;
  }));
  if(!inventory.items.length){const tr=node('tr'),td=node('td','Nenhum material encontrado com estes filtros.');td.colSpan=6;tr.append(td);$('#inventory').append(tr);}
  $('#page-info').textContent=total?`${offset+1}–${Math.min(offset+50,total)} de ${total}`:'0 materiais';
  $('#previous').disabled=offset===0;$('#next').disabled=offset+50>=total;
  $('#source-list').replaceChildren(...sources.map(source=>{
    const li=node('li'),info=node('div',source.title);info.append(node('small',source.version+' · '+source.type+' · revisão '+source.revision),node('small',source.reference));const edit=node('button','Editar fonte');edit.type='button';edit.className='secondary';edit.addEventListener('click',()=>{for(const name of ['id','revision','title','type','reference','version'])$('#source-form').elements[name].value=source[name];$('#source-form').elements.title.focus();});li.append(info,edit);return li;
  }));
  if(!sources.length)$('#source-list').append(node('li','Nenhuma fonte cadastrada nesta homologação.'));
}
$('#filters').addEventListener('submit',event=>{event.preventDefault();offset=0;run(load);});
$('#previous').addEventListener('click',()=>{offset=Math.max(0,offset-50);run(load);});
$('#next').addEventListener('click',()=>{offset+=50;run(load);});
$('#cancel-source').addEventListener('click',()=>$('#source-form').reset());
$('#source-form').addEventListener('submit',event=>{event.preventDefault();run(async()=>{
  const form=event.currentTarget,body=Object.fromEntries(new FormData(form)),id=body.id;delete body.id;
  if(id)body.revision=Number(body.revision);else delete body.revision;
  await request('/sources'+(id?'/'+encodeURIComponent(id):''),{method:id?'PATCH':'POST',body:JSON.stringify(body)});form.reset();await load();$('#feedback').textContent='Fonte salva na governança. Materiais aprovados com versões anteriores precisam de nova revisão.';
});});
$('#metadata-form').addEventListener('submit',event=>{event.preventDefault();run(async()=>{
  const form=new FormData(event.currentTarget),body={revision:detail.revision,contentRevision:detail.contentRevision,curator:form.get('curator'),criticality:form.get('criticality'),nextReviewOn:form.get('nextReviewOn'),sourceIds:form.getAll('sourceIds')};
  const value=await request('/contents/'+encodeURIComponent(detail.contentId),{method:'PUT',body:JSON.stringify(body)});await load();showDetail(value);pendingReview=null;$('#dialog-feedback').textContent='Ficha salva. Solicite uma revisão para registrar sua decisão.';
});});
$('#review-form').addEventListener('submit',event=>{event.preventDefault();run(async()=>{
  const body={...Object.fromEntries(new FormData(event.currentTarget)),revision:detail.revision,contentRevision:detail.contentRevision},signature=JSON.stringify(body);
  if(!pendingReview||pendingReview.signature!==signature)pendingReview={signature,key:crypto.randomUUID()};body.requestKey=pendingReview.key;
  const value=await request('/contents/'+encodeURIComponent(detail.contentId)+'/reviews',{method:'POST',body:JSON.stringify(body)});pendingReview=null;await load();showDetail(value);$('#dialog-feedback').textContent='Decisão experimental registrada. A biblioteca permanece com a publicação original.';
});});
$('#close-dialog').addEventListener('click',()=>$('#detail-dialog').close());
run(load);
