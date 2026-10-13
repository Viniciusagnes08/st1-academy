export function createKnowledgeMapPanel({api,esc,icon,main,commitView,user,toast,heading,star}){
  const labels={not_started:'Não iniciado',studying:'Em estudo',studied:'Estudo concluído',empty:'Em preparação',unmeasured:'Ainda não avaliado',partial:'Avaliação parcial',validated:'Acertos validados',reinforce:'Reforçar'};
  const categories={processos:'Processos',produtos:'Produtos',livros:'Livros',cursos:'Cursos',treinamentos:'Treinamentos'};
  let target=null,branch=null,overview=null,response=null,items=[],mode=matchMedia('(max-width:840px)').matches?'list':'map';
  let filters={q:'',track:'all',category:'all',status:'all'},cursor='0',previous=[],epoch=0,loading=false,timer=null,observer=null,dragController=null,zoom=1;
  const active=()=>location.hash.split('/')[0]==='#conhecimento'&&!!main.querySelector('#knowledge-map');
  const cleanupStage=()=>{observer?.disconnect();observer=null;dragController?.abort();dragController=null;};
  const dispose=()=>{epoch++;clearTimeout(timer);timer=null;cleanupStage();loading=false;};
  const params=()=>new URLSearchParams({userId:target,...filters,cursor,limit:mode==='map'?'6':'24'}).toString();
  const setBusy=busy=>{loading=busy;const shell=main.querySelector('#knowledge-map');if(shell){shell.setAttribute('aria-busy',String(busy));shell.querySelectorAll('.km-node,.km-pagination button').forEach(b=>b.disabled=busy);}const count=main.querySelector('#map-count');if(busy&&count)count.textContent='Carregando este trecho do mapa…';};
  const status=n=>'<span class="km-status state-'+n.status+'">'+icon(n.status==='studied'||n.status==='validated'?'check':n.status==='reinforce'?'shield':n.status==='studying'||n.status==='partial'?'clock':'book')+esc(labels[n.status]||'Disponível')+'</span>';
  const info=n=>n.kind==='module'?(n.total?n.studied+' de '+n.total+' estudos concluídos':'Novos materiais aparecerão aqui'):n.kind==='assessment'?n.validated+' de '+n.total+' temas com acertos validados':n.kind==='material'?n.page?'Página '+n.page+' de '+n.pages:categories[n.category]:n.total?n.correct+' de '+n.total+' acertos · '+n.score+'%':'Construa sua primeira evidência';
  const itemMarkup=(n,i)=>'<button type="button" class="km-node state-'+n.status+'" data-km-index="'+i+'" aria-label="'+esc(n.title)+': '+esc(labels[n.status])+'. '+esc(info(n))+'"><span class="km-node-type">'+icon(n.kind==='assessment'||n.kind==='topic'?'target':'book')+esc(n.kind==='module'?'Módulo':n.kind==='assessment'?'Avaliações':n.kind==='topic'?'Tema avaliado':categories[n.category])+(n.critical?'<strong>Regra crítica</strong>':'')+'</span><strong class="km-node-title">'+esc(n.title)+'</strong><span class="km-node-info">'+esc(info(n))+'</span>'+status(n)+'<span class="km-node-go" aria-hidden="true">'+icon('arrow')+'</span></button>';
  function render(){
    if(!active()||!response)return;cleanupStage();items=response.items;
    const own=overview.own,parent=branch?response.parent:{title:own?'Meu conhecimento':'Conhecimento de '+overview.name,description:'Escolha um módulo para estudar ou uma trilha para conferir as avaliações.'};
    main.querySelector('#map-person').textContent=(own?'Mapa de ':'Acompanhando ')+overview.name;
    main.querySelector('#map-stats').innerHTML=[['Materiais disponíveis',overview.summary.total],['Estudos concluídos',overview.summary.studied],['Temas com acertos validados',overview.summary.validated],['Temas para reforçar',overview.summary.reinforce]].map(([label,value])=>'<div><strong>'+value+'</strong><span>'+label+'</span></div>').join('');
    main.querySelector('#map-breadcrumb').innerHTML='<button type="button" data-km-root '+(!branch?'aria-current="page"':'')+'>'+icon('target')+' Visão geral</button>'+(branch?'<span aria-hidden="true">/</span><strong>'+esc(parent.title)+'</strong>':'');
    main.querySelector('#map-caption').textContent=branch?parent.description:'O mapa acompanha os módulos e materiais publicados para esta conta. Abra um ramo por vez.';
    const begin=Number(response.cursor)+1,end=Math.min(Number(response.cursor)+items.length,response.total);
    main.querySelector('#map-count').textContent=response.total?(branch?'Itens':'Ramos')+' '+begin+'–'+end+' de '+response.total:'Nenhum resultado nesta seleção';
    main.querySelector('#map-search').placeholder=branch?(branch.kind==='module'?'Buscar material neste módulo':'Buscar tema nesta trilha'):'Buscar módulo, material ou tema';
    main.querySelectorAll('[data-km-mode]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.kmMode===mode)));
    const root='<div class="km-root"><span>'+esc(branch?branch.kind==='module'?'MÓDULO DE CONHECIMENTO':'TRILHA DE AVALIAÇÃO':'SEU PERCURSO')+'</span><h2>'+esc(parent.title)+'</h2><p>'+esc(branch?(branch.kind==='module'?'Estudo dos materiais':'Evidências das respostas'):'Estude. Pratique. Evolua.')+'</p></div>';
    const results=items.length?(mode==='map'?'<div class="km-stage" tabindex="0" aria-label="Mapa deste ramo. Arraste o espaço vazio para navegar."><div class="km-tree"><svg class="km-edges" aria-hidden="true"></svg>'+root+'<div class="km-children">'+items.map(itemMarkup).join('')+'</div></div></div>':'<div class="km-list" aria-label="Lista dos itens deste ramo">'+items.map(itemMarkup).join('')+'</div>'):'<div class="km-empty">'+icon('book')+'<h2>'+(response.total?'Continue explorando.':branch&&!filters.q&&filters.status==='all'?'Este ramo está em preparação.':'Vamos encontrar outro caminho.')+'</h2><p>'+(branch&&!filters.q&&filters.status==='all'?'Os materiais publicados e liberados aparecerão automaticamente aqui.':'Experimente outro termo ou limpe os filtros para ver mais conteúdos.')+'</p><button type="button" class="button button-secondary" data-km-clear>Limpar filtros '+icon('arrow')+'</button></div>';
    main.querySelector('#map-content').innerHTML=results+'<nav class="km-pagination" aria-label="Páginas deste ramo"><button type="button" data-km-prev '+(!previous.length?'disabled':'')+'>'+icon('back')+' Anterior</button><span>'+response.total+' '+(branch?(response.total===1?'item':'itens'):(response.total===1?'ramo':'ramos'))+'</span><button type="button" data-km-next '+(!response.nextCursor?'disabled':'')+'>Próximos '+icon('arrow')+'</button></nav>';
    main.querySelector('#map-zoom-tools').hidden=mode!=='map'||!items.length;
    const tags=[];if(filters.q)tags.push('Busca: '+filters.q);if(filters.track!=='all')tags.push(overview.tracks.find(t=>t.id===filters.track)?.name||filters.track);if(filters.category!=='all')tags.push(categories[filters.category]);if(filters.status!=='all')tags.push(labels[filters.status]);
    main.querySelector('#map-filter-summary').textContent=tags.join(' · ');main.querySelector('#map-clear').hidden=!tags.length;main.querySelector('.km-filter-state').hidden=!tags.length;
    if(mode==='map'&&items.length)mountStage();
  }
  function mountStage(){
    const tree=main.querySelector('.km-tree'),stage=main.querySelector('.km-stage'),edges=tree.querySelector('.km-edges');
    const draw=()=>{
      const a=tree.getBoundingClientRect(),root=tree.querySelector('.km-root').getBoundingClientRect(),scale=a.width/tree.offsetWidth;
      const x=(root.left+root.width/2-a.left)/scale,y=(root.bottom-a.top)/scale;
      edges.setAttribute('viewBox','0 0 '+tree.offsetWidth+' '+tree.offsetHeight);
      edges.innerHTML=[...tree.querySelectorAll('.km-node')].map((node,i)=>{const b=node.getBoundingClientRect(),tx=(b.left+b.width/2-a.left)/scale,ty=(b.top-a.top)/scale;return '<path class="state-'+items[i].status+'" d="M '+x+' '+y+' C '+x+' '+(y+26)+' '+tx+' '+(ty-26)+' '+tx+' '+ty+'"/>';}).join('');
    };
    observer=new ResizeObserver(draw);observer.observe(tree);zoom=1;applyZoom();draw();
    dragController=new AbortController();let start=null;const options={signal:dragController.signal};
    stage.addEventListener('pointerdown',event=>{if(event.button!==0||event.target.closest('button,a'))return;start={x:event.clientX,y:event.clientY,left:stage.scrollLeft,top:stage.scrollTop};stage.setPointerCapture(event.pointerId);stage.classList.add('is-dragging');},options);
    stage.addEventListener('pointermove',event=>{if(start){stage.scrollLeft=start.left-event.clientX+start.x;stage.scrollTop=start.top-event.clientY+start.y;}},options);
    const end=()=>{start=null;stage.classList.remove('is-dragging');};
    stage.addEventListener('pointerup',end,options);stage.addEventListener('pointercancel',end,options);stage.addEventListener('lostpointercapture',end,options);
  }
  function applyZoom(){const stage=main.querySelector('.km-stage'),tree=main.querySelector('.km-tree');if(!tree)return;tree.style.zoom=String(zoom);main.querySelector('#map-zoom-value').textContent=Math.round(zoom*100)+'%';if(zoom===1){stage.scrollLeft=0;stage.scrollTop=0;}}
  function details(n){
    const own=overview.own,dialog=main.querySelector('#map-detail'),coverage=n.coverage;
    const message=n.kind==='material'?n.status==='studied'?'A conclusão deste estudo foi registrada na versão atual.':n.status==='studying'?'Este material já foi iniciado. Continue de onde parou.':'Este material está disponível para estudo.':n.status==='partial'?'Há acertos registrados, mas ainda faltam perguntas deste tema para avaliar.':n.status==='reinforce'?'Revise este tema e pratique novamente, com atenção às regras críticas.':n.status==='validated'?'As perguntas registradas deste tema atingiram o critério de acertos.':'Este tema ainda não tem respostas avaliadas.';
    const action=n.kind==='material'?'<a href="'+esc(n.href)+'" class="button button-primary">'+(own&&n.status==='studying'?'Continuar meu estudo':'Explorar conteúdo')+' '+icon('arrow')+'</a>':(own?'<a href="#percurso/'+encodeURIComponent(n.trackId)+'" class="button button-primary">Praticar esta trilha '+icon('arrow')+'</a>':'')+(n.sourceHref?'<a href="'+esc(n.sourceHref)+'" class="button button-secondary">Consultar o ponto no material '+icon('book')+'</a>':'');
    main.querySelector('#map-detail-body').innerHTML='<span class="overline muted">'+esc(n.kind==='material'?categories[n.category]:'EVIDÊNCIA DE AVALIAÇÃO')+'</span><h2 id="map-detail-title">'+esc(n.title)+'</h2>'+status(n)+'<p>'+esc(n.description||message)+'</p>'+(n.description?'<p>'+message+'</p>':'')+'<div class="km-detail-data"><strong>'+esc(info(n))+'</strong>'+(coverage?'<span>'+coverage.answered+' de '+coverage.total+' perguntas deste tema avaliadas.</span>':'')+(n.evidence?'<span>'+esc(n.evidence)+'</span>':'')+'</div>'+(n.kind==='material'?'<progress value="'+n.progress+'" max="100" aria-label="Progresso deste estudo"></progress>':'')+'<p class="km-detail-note">'+(n.kind==='material'?'Concluir o estudo registra a leitura. A avaliação verifica as decisões sobre o conteúdo.':'Os acertos indicam o resultado avaliado. A aplicação na rotina e a progressão profissional exigem evidências próprias.')+'</p><div class="km-detail-actions">'+action+'</div>';
    dialog.showModal();dialog.querySelector('[data-km-close-detail]').focus();
  }
  async function load(){
    clearTimeout(timer);timer=null;const ticket=++epoch;setBusy(true);
    try{
      const url=branch?'/api/knowledge-map/'+branch.kind+'/'+encodeURIComponent(branch.id):'/api/knowledge-map';
      const value=await api(url+'?'+params());if(ticket!==epoch||!active())return;
      response=value;if(!branch){overview=value;const trackSelect=main.querySelector('#map-channel');trackSelect.innerHTML='<option value="all">Todos os canais</option>'+value.tracks.map(t=>'<option value="'+esc(t.id)+'">'+esc(t.name)+'</option>').join('');trackSelect.value=filters.track;}
      render();
    }catch(error){if(ticket!==epoch||!active())return;main.querySelector('#map-content').innerHTML='<div class="km-empty" role="alert"><h2>Não foi possível abrir este trecho.</h2><p>'+esc(error.message)+'</p><button type="button" class="button button-secondary" data-km-root>Voltar à visão geral</button></div>';main.querySelector('#map-count').textContent='Mapa indisponível nesta seleção';}
    finally{if(ticket===epoch&&active())setBusy(false);}
  }
  const resetPage=()=>{cursor='0';previous=[];};
  async function show(userId){
    const next=userId||user().id;if(next!==target){target=next;branch=null;filters={q:'',track:'all',category:'all',status:'all'};overview=null;}
    resetPage();dispose();
    const action=user().role==='admin'?'<a href="#publicar/modulos" class="button button-secondary">Organizar módulos '+icon('book')+'</a>':'';
    const options=(values,selected)=>values.map(([value,label])=>'<option value="'+value+'" '+(value===selected?'selected':'')+'>'+label+'</option>').join('');
    commitView(heading('MAPA DE CONHECIMENTO',next===user().id?'Seu aprendizado, conectado.':'Acompanhe o aprendizado da equipe.','Explore módulos, retome os materiais e encontre os temas que precisam de reforço.',action)+'<section class="wrap km-shell" id="knowledge-map"><p class="km-person-context" id="map-person"></p><div class="km-stats" id="map-stats"></div><div class="km-controls"><label class="km-search"><span class="sr-only">Buscar no mapa</span>'+icon('book')+'<input id="map-search" type="search" value="'+esc(filters.q)+'" maxlength="100" placeholder="Buscar no mapa"></label><button class="km-filter-button" type="button" data-km-filters>'+icon('list')+' Filtros</button><div class="km-modes" aria-label="Visualização do mapa"><button type="button" data-km-mode="map" aria-pressed="'+(mode==='map')+'">Mapa</button><button type="button" data-km-mode="list" aria-pressed="'+(mode==='list')+'">Lista</button></div></div><div class="km-filter-state"><span id="map-filter-summary"></span><button type="button" id="map-clear" data-km-clear hidden>Limpar filtros</button></div><nav class="km-breadcrumb" id="map-breadcrumb" aria-label="Caminho no mapa"></nav><div class="km-view-caption"><p id="map-caption"></p><span id="map-count" role="status" aria-live="polite"></span></div><div class="km-zoom-tools" id="map-zoom-tools"><button type="button" data-km-zoom="-1" aria-label="Diminuir mapa">−</button><span id="map-zoom-value">100%</span><button type="button" data-km-zoom="1" aria-label="Aumentar mapa">+</button><button type="button" data-km-zoom="0">Ajustar</button></div><div id="map-content"></div><p class="km-footnote">Estudo concluído e acertos validados mostram avanços diferentes. O mapa acompanha a versão atual dos materiais e das perguntas.</p><dialog class="workspace-drawer km-filter-dialog" id="map-filters" aria-labelledby="map-filter-title"><div class="drawer-heading"><div><span class="overline muted">FOQUE NO SEU PRÓXIMO PASSO</span><h2 id="map-filter-title">Filtros do mapa</h2></div><button type="button" class="drawer-close" data-km-close-filters aria-label="Fechar filtros">×</button></div><div class="drawer-content"><label for="map-channel">Canal</label><select id="map-channel"><option value="all">Todos os canais</option></select><label for="map-category">Tipo de material</label><select id="map-category">'+options([['all','Todos os tipos'],...Object.entries(categories)],filters.category)+'</select><label for="map-status">Avanço</label><select id="map-status">'+options([['all','Todos os avanços'],...Object.entries(labels)],filters.status)+'</select><p>“Estudo concluído” acompanha os materiais. “Acertos validados” acompanha as perguntas avaliadas.</p></div><div class="drawer-footer"><button type="button" class="button button-secondary" data-km-clear>Limpar filtros</button><button type="button" class="button button-primary" data-km-close-filters>Ver resultados '+icon('arrow')+'</button></div></dialog><dialog class="workspace-drawer km-detail-dialog" id="map-detail" aria-labelledby="map-detail-title"><button type="button" class="drawer-close" data-km-close-detail aria-label="Fechar detalhes">×</button><div id="map-detail-body"></div></dialog></section>');
    const pageHeading=main.querySelector('.content-heading');
    pageHeading.classList.add('km-heading');
    pageHeading.insertAdjacentHTML('beforeend','<button class="km-heading-guide" type="button" data-km-guide aria-label="Dica do Starzinho sobre este mapa"><img class="km-heading-star" src="/assets/starzinho/pose05-point.webp" alt="" width="134" height="156"><span>Dica do Starzinho</span></button>');
    await load();
  }
  main.addEventListener('input',event=>{if(event.target.id!=='map-search')return;filters.q=event.target.value.trim();resetPage();epoch++;setBusy(true);clearTimeout(timer);timer=setTimeout(()=>load(),250);});
  main.addEventListener('change',event=>{const key=({ 'map-channel':'track','map-category':'category','map-status':'status'})[event.target.id];if(!key)return;filters[key]=event.target.value;resetPage();load();});
  main.addEventListener('click',event=>{
    if(!active())return;const node=event.target.closest('[data-km-index]');
    if(event.target.closest('[data-km-guide]')){
      const message=branch?.kind==='module'?'Leia os materiais deste módulo, esclareça as dúvidas e registre a conclusão quando terminar. A prática é o próximo passo.':branch?.kind==='assessment'?'Observe os acertos e a quantidade de perguntas avaliadas. Se o tema estiver parcial ou pedir reforço, consulte o material e pratique novamente.':'O mapa acompanha o seu estudo e as suas avaliações. Escolha um ramo por vez. Cada avanço pode levar você ao próximo aprendizado.';
      main.querySelector('#map-detail-body').innerHTML='<h2 id="map-detail-title">Um próximo passo com o Starzinho.</h2>'+star(message,'present')+'<p class="km-detail-note">Estudo, avaliação e aplicação na rotina ajudam a construir sua evolução.</p>';
      const dialog=main.querySelector('#map-detail');dialog.showModal();dialog.querySelector('[data-km-close-detail]').focus();return;
    }
    if(node&&!loading){const n=items[Number(node.dataset.kmIndex)];if(!n)return;if(n.kind==='module'||n.kind==='assessment'){branch={kind:n.kind,id:n.id};if(n.kind==='assessment'){filters.category='all';main.querySelector('#map-category').value='all';}if(filters.q&&(n.clearSearchOnOpen||n.title.toLowerCase().includes(filters.q.toLowerCase()))){filters.q='';main.querySelector('#map-search').value='';}resetPage();load();}else details(n);return;}
    if(event.target.closest('[data-km-root]')){branch=null;resetPage();load();return;}
    if(event.target.closest('[data-km-clear]')){filters={q:'',track:'all',category:'all',status:'all'};main.querySelector('#map-search').value='';for(const id of ['map-channel','map-category','map-status'])main.querySelector('#'+id).value='all';resetPage();load();return;}
    const view=event.target.closest('[data-km-mode]');if(view){mode=view.dataset.kmMode;resetPage();load();return;}
    if(event.target.closest('[data-km-next]')&&response?.nextCursor){previous.push(cursor);cursor=response.nextCursor;load();return;}
    if(event.target.closest('[data-km-prev]')&&previous.length){cursor=previous.pop();load();return;}
    if(event.target.closest('[data-km-filters]')){main.querySelector('#map-filters').showModal();main.querySelector('#map-channel').focus();return;}
    if(event.target.closest('[data-km-close-filters]')){main.querySelector('#map-filters').close();main.querySelector('[data-km-filters]').focus();return;}
    if(event.target.closest('[data-km-close-detail]')){main.querySelector('#map-detail').close();return;}
    const z=event.target.closest('[data-km-zoom]');if(z){zoom=Number(z.dataset.kmZoom)===0?1:Math.max(.85,Math.min(1.6,zoom+Number(z.dataset.kmZoom)*.15));applyZoom();}
  });
  return {show,dispose};
}
