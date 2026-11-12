export async function showSavedContents({api,esc,main,commitView,toast}){
  commitView('<section class="page-top"><div class="wrap"><span class="overline muted">CENTRAL DE CONHECIMENTO</span><h1>Meus salvos</h1><p>Os conteúdos que você guardou para estudar ou rever.</p></div></section><section class="wrap knowledge-library"><div id="saved-content-list" aria-busy="true"><p role="status">Carregando seus salvos...</p></div></section>');
  const root=main.querySelector('#saved-content-list');
  const draw=async()=>{
    const data=await api('/api/saved-contents');if(!root.isConnected||location.hash!=='#salvos')return;
    root.setAttribute('aria-busy','false');
    root.innerHTML=`<div class="knowledge-saved-head"><p>${data.items.length} ${data.items.length===1?'conteúdo salvo':'conteúdos salvos'}</p><a href="#conteudos">Explorar conteúdos →</a></div>${data.items.length?`<div class="material-grid">${data.items.map(item=>`<article class="material-card"><div class="material-card-top"><span class="material-type">${item.asset?.mime?.startsWith('video/')?'▶ Vídeo':item.kind==='text'?'Leitura':item.kind==='link'?'Link externo':'Arquivo'}</span><span class="material-origin">ST1 ACADEMY</span></div><h2>${esc(item.title)}</h2><p>${esc(item.summary||'Conteúdo da sua Academy.')}</p><div class="content-tracks">${item.tracks.map(track=>`<span class="content-track channel-${esc(track)}">${esc(track)}</span>`).join('')}</div><a class="button button-secondary" href="#material/${encodeURIComponent(item.id)}">Abrir conteúdo →</a><button type="button" class="knowledge-unsave" data-remove-saved="${esc(item.id)}">Remover dos salvos</button></article>`).join('')}</div>`:'<div class="content-empty"><h2>Você ainda não salvou conteúdos.</h2><p>Abra um material e toque em Salvar para encontrá-lo aqui.</p><a href="#conteudos" class="button button-primary">Explorar conteúdos</a></div>'}`;
  };
  root.addEventListener('click',async event=>{
    const button=event.target.closest('[data-remove-saved]');if(!button)return;button.disabled=true;
    try{await api('/api/contents/'+encodeURIComponent(button.dataset.removeSaved)+'/engagement/saved',{method:'PUT',body:{saved:false}});toast('Conteúdo removido dos salvos.');await draw();}
    catch(error){toast(error.message);button.disabled=false;}
  });
  try{await draw();}catch(error){if(root.isConnected){root.setAttribute('aria-busy','false');root.innerHTML=`<p class="content-comment-empty">Não foi possível carregar os salvos. ${esc(error.message)}</p>`;}}
}
