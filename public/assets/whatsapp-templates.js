const categoryLabel=value=>({UTILITY:'Utilidade',MARKETING:'Marketing',AUTHENTICATION:'Autenticação'}[String(value||'').toUpperCase()]||'Categoria não informada');
const statusLabel=value=>({draft:'Rascunho',submit_error:'Revisar envio',submitting:'Em análise',pending:'Em análise',in_review:'Em análise',in_appeal:'Em análise',approved:'Aprovado',rejected:'Rejeitado',paused:'Pausado',disabled:'Desativado',deleted:'Removido',unknown:'Status não informado'}[String(value||'').toLowerCase()]||String(value||'Status não informado').replaceAll('_',' '));
const statusKey=value=>{const status=String(value||'').toLowerCase();if(['pending','in_review','in_appeal','submitting'].includes(status))return 'pending';if(['submit_error','failed'].includes(status))return 'submit_error';return status;};
const variables=value=>[...String(value||'').matchAll(/{{\s*(\d+)\s*}}/g)].map(match=>Number(match[1]));

export function createWhatsAppTemplatePanel({api,esc,main,toast}){
  let data={items:[],providerReady:false},editing=null,filter={query:'',category:'all',status:'all'},buttons=[];
  const root=()=>main.querySelector('#whatsapp-template-root');
  const visibleItems=()=>data.items.filter(item=>{
    const q=filter.query.trim().toLocaleLowerCase('pt-BR');
    return (!q||`${item.name} ${item.bodyText||''} ${item.rejectedReason||''}`.toLocaleLowerCase('pt-BR').includes(q))&&
      (filter.category==='all'||String(item.currentCategory||item.requestedCategory).toUpperCase()===filter.category)&&
      (filter.status==='all'||statusKey(item.status)===filter.status);
  });
  function cards(){
    const target=root()?.querySelector('#whatsapp-template-list');if(!target)return;
    const items=visibleItems();
    target.innerHTML=items.length?items.map(item=>{
      const category=String(item.currentCategory||item.requestedCategory||'').toUpperCase(),changed=category&&category!==String(item.requestedCategory||'').toUpperCase();
      const editable=item.origin==='academy'&&['draft','submit_error'].includes(String(item.status).toLowerCase());
      return `<article class="wa-template-card"><div class="wa-template-card-head"><div><div class="wa-template-tags"><span class="wa-template-status wa-status-${esc(statusKey(item.status))}">${esc(statusLabel(item.status))}</span><span class="wa-template-category">${esc(categoryLabel(category))}${changed?` · solicitado como ${esc(categoryLabel(item.requestedCategory))}`:''}</span></div><h3>${esc(item.name)}</h3><p>${esc(item.language)} · ${item.origin==='meta'?'Importado da Meta':'Criado na Academy'}${item.submittedAt?` · Enviado ${esc(new Date(item.submittedAt).toLocaleString('pt-BR'))}`:''}</p></div>${editable?`<div class="wa-template-actions"><button type="button" class="button" data-edit-template="${esc(item.id)}">Editar</button><button type="button" class="button button-primary" data-submit-template="${esc(item.id)}">Enviar para aprovação</button></div>`:''}</div><p class="wa-template-body">${esc(item.bodyText||'Modelo cadastrado diretamente na Meta.')}</p>${item.rejectedReason?`<p class="wa-template-rejection"><strong>Motivo informado pela Meta:</strong> ${esc(item.rejectedReason)}</p>`:''}${item.submissionError?`<p class="wa-template-rejection"><strong>Não foi possível concluir o envio:</strong> ${esc(item.submissionError)}</p>`:''}${item.lastSyncedAt?`<small class="wa-template-synced">Status atualizado em ${esc(new Date(item.lastSyncedAt).toLocaleString('pt-BR'))}</small>`:''}</article>`;
    }).join(''):'<p class="campaign-empty">Nenhum modelo corresponde aos filtros selecionados.</p>';
    const count=root()?.querySelector('#wa-template-count');if(count)count.textContent=`${items.length} de ${data.items.length} modelo${data.items.length===1?'':'s'}`;
  }
  function sampleInputs(text,kind,existing=[]){
    const list=variables(text),unique=[...new Set(list)].sort((a,b)=>a-b);
    if(!unique.length)return '';
    if(unique.some((value,index)=>value!==index+1))return '<p class="wa-template-help is-error">Use variáveis em sequência: {{1}}, {{2}}...</p>';
    return `<div class="wa-template-samples"><span>Exemplos para a Meta</span>${unique.map((number,index)=>`<label>Exemplo {{${number}}}<input data-sample="${kind}" data-index="${index}" value="${esc(existing[index]||'')}" maxlength="80" placeholder="Ex.: Ana"></label>`).join('')}</div>`;
  }
  function buttonRows(){
    const host=main.querySelector('#wa-template-buttons');if(!host)return;
    host.innerHTML=buttons.map((item,index)=>`<div class="wa-template-button-row" data-template-button="${index}"><label>Tipo<select data-button-field="type"><option value="QUICK_REPLY" ${item.type==='QUICK_REPLY'?'selected':''}>Resposta rápida</option><option value="URL" ${item.type==='URL'?'selected':''}>Abrir link</option><option value="PHONE_NUMBER" ${item.type==='PHONE_NUMBER'?'selected':''}>Ligar</option></select></label><label>Texto do botão<input data-button-field="text" maxlength="25" value="${esc(item.text||'')}" placeholder="Ex.: Ver trilha"></label>${item.type==='URL'?`<label class="wa-button-destination">URL HTTPS<input data-button-field="url" type="url" value="${esc(item.url||'')}" placeholder="https://st1academy.tech/..." required></label>`:item.type==='PHONE_NUMBER'?`<label class="wa-button-destination">Telefone internacional<input data-button-field="phoneNumber" type="tel" value="${esc(item.phoneNumber||'')}" placeholder="+5511999999999" required></label>`:''}<button type="button" class="wa-template-remove" data-remove-template-button="${index}" aria-label="Remover botão ${index+1}">Remover</button></div>`).join('');
  }
  function form(){
    const model=editing||{name:'',language:'pt_BR',category:'MARKETING',headerText:'',bodyText:'',footerText:'',headerSamples:[],bodySamples:[],buttons:[]};
    buttons=(model.buttons||[]).map(item=>({...item}));
    return `<section class="wa-template-editor" aria-labelledby="wa-template-editor-title"><div class="wa-template-editor-head"><div><span class="overline muted">${editing?'EDITAR RASCUNHO':'NOVO MODELO'}</span><h3 id="wa-template-editor-title">${editing?'Revise o modelo':'Monte o modelo de mensagem'}</h3><p>O envio abre uma análise da Meta. Depois, o status e a categoria reconhecidos pela conta podem mudar.</p></div><button type="button" class="button" data-close-template-editor>Fechar</button></div><form id="wa-template-form"><div class="wa-template-grid"><label>Nome do modelo<input name="name" required minlength="3" maxlength="512" pattern="[a-z0-9_]+" value="${esc(model.name)}" placeholder="Ex.: st1_academy_boas_vindas"><small>Minúsculas, números e sublinhado; sem espaços.</small></label><label>Idioma<select name="language"><option value="pt_BR" ${model.language==='pt_BR'?'selected':''}>Português (Brasil) · pt_BR</option><option value="pt_PT" ${model.language==='pt_PT'?'selected':''}>Português (Portugal) · pt_PT</option><option value="en_US" ${model.language==='en_US'?'selected':''}>Inglês (EUA) · en_US</option><option value="es_ES" ${model.language==='es_ES'?'selected':''}>Espanhol · es_ES</option></select></label></div><fieldset class="wa-template-categories"><legend>Categoria solicitada</legend><label class="wa-category-choice ${model.category==='UTILITY'?'selected':''}"><input type="radio" name="category" value="UTILITY" ${model.category==='UTILITY'?'checked':''}><span><strong>Utilidade</strong><small>Atualizações práticas ligadas a uma solicitação, conta ou atividade existente.</small></span></label><label class="wa-category-choice ${model.category==='MARKETING'?'selected':''}"><input type="radio" name="category" value="MARKETING" ${model.category==='MARKETING'?'checked':''}><span><strong>Marketing</strong><small>Incentivos, divulgação e mensagens para engajar ou apresentar novidades.</small></span></label><p class="wa-template-help">A Meta analisa o conteúdo e pode reclassificar a categoria.</p></fieldset><div class="wa-template-grid"><div><label>Cabeçalho opcional<input name="headerText" maxlength="60" value="${esc(model.headerText)}" placeholder="Ex.: Sua evolução na ST1 Academy"></label><div id="wa-header-samples">${sampleInputs(model.headerText,'header',model.headerSamples)}</div></div><div class="wa-template-preview"><span>PRÉVIA DA MENSAGEM</span><p id="wa-template-preview-header" ${model.headerText?'':'hidden'}>${esc(model.headerText)}</p><p id="wa-template-preview-body">${esc(model.bodyText||'O texto do modelo aparecerá aqui.')}</p><small id="wa-template-preview-footer" ${model.footerText?'':'hidden'}>${esc(model.footerText)}</small><div id="wa-template-preview-buttons">${model.buttons.map(x=>`<span>${esc(x.text||'Botão')}</span>`).join('')}</div></div></div><label>Corpo da mensagem<textarea name="bodyText" rows="6" required maxlength="1024" placeholder="Olá, {{1}}! Sua próxima etapa já está disponível na ST1 Academy.">${esc(model.bodyText)}</textarea><small>Até 1.024 caracteres. Use variáveis numeradas como {{1}} e {{2}}.</small></label><div id="wa-body-samples">${sampleInputs(model.bodyText,'body',model.bodySamples)}</div><label>Rodapé opcional<input name="footerText" maxlength="60" value="${esc(model.footerText)}" placeholder="Ex.: ST1 Academy · Conhecimento que vira resultado"></label><section class="wa-template-buttons"><div class="wa-template-buttons-head"><div><strong>Botões opcionais</strong><small>Resposta rápida, link HTTPS ou ligação.</small></div><button type="button" class="button" data-add-template-button ${buttons.length>=3?'disabled':''}>Adicionar botão</button></div><div id="wa-template-buttons"></div></section><p class="wa-template-help">Utilidade não deve incluir oferta ou incentivo promocional. A Meta define a aprovação final; modelos só poderão ser usados nos disparos após aprovação.</p><div class="wa-template-form-actions"><button type="button" class="button" data-save-template-draft>Salvar rascunho</button><button type="submit" class="button button-primary" name="templateAction" value="submit">Revisar e enviar à Meta</button></div><p class="form-error" id="wa-template-error" role="alert" hidden></p></form></section>`;
  }
  function render(){
    const host=root();if(!host)return;
    const items=visibleItems(),counts={all:data.items.length,pending:data.items.filter(x=>statusKey(x.status)==='pending').length,approved:data.items.filter(x=>statusKey(x.status)==='approved').length,rejected:data.items.filter(x=>statusKey(x.status)==='rejected').length};
    host.innerHTML=`<section class="campaign-history wa-template-manager"><div class="campaign-history-head"><div><span class="overline muted">MODELOS · META</span><h2>Modelos do WhatsApp</h2><p>Crie, envie para análise e acompanhe a aprovação na conta ST1 Academy.</p></div><div class="wa-template-manager-actions"><button type="button" class="button" data-sync-templates ${data.providerReady?'':'disabled'}>Atualizar status na Meta</button><button type="button" class="button button-primary" data-create-template ${editing?'hidden':''}>Criar modelo</button></div></div><div class="wa-template-summary"><article><strong>${counts.all}</strong><span>modelos na Academy/Meta</span></article><article><strong>${counts.pending}</strong><span>em análise</span></article><article><strong>${counts.approved}</strong><span>aprovados</span></article><article><strong>${counts.rejected}</strong><span>rejeitados</span></article></div>${!data.providerReady?'<p class="whatsapp-connection">Configure o canal WhatsApp em Integrações para enviar modelos à Meta.</p>':''}<div class="wa-template-filters"><label class="wa-template-search">Pesquisar<input type="search" data-template-filter="query" value="${esc(filter.query)}" placeholder="Nome ou conteúdo"></label><label>Categoria<select data-template-filter="category"><option value="all">Todas</option><option value="UTILITY" ${filter.category==='UTILITY'?'selected':''}>Utilidade</option><option value="MARKETING" ${filter.category==='MARKETING'?'selected':''}>Marketing</option></select></label><label>Status<select data-template-filter="status"><option value="all">Todos</option><option value="draft" ${filter.status==='draft'?'selected':''}>Rascunho</option><option value="submit_error" ${filter.status==='submit_error'?'selected':''}>Falha no envio</option><option value="pending" ${filter.status==='pending'?'selected':''}>Em análise</option><option value="approved" ${filter.status==='approved'?'selected':''}>Aprovado</option><option value="rejected" ${filter.status==='rejected'?'selected':''}>Rejeitado</option></select></label><span id="wa-template-count">${items.length} de ${data.items.length} modelos</span></div>${editing?form():''}<div id="whatsapp-template-list" class="wa-template-list"></div><p class="wa-template-footnote">A categoria e a aprovação finais pertencem à Meta. Um modelo Utilidade pode voltar com a categoria Marketing; confira a classificação antes de associá-lo a uma automação ou campanha.</p></section>`;
    cards();buttonRows();
  }
  async function load(){data=await api('/api/admin/whatsapp-templates');render();}
  function draftFromForm(){
    const form=main.querySelector('#wa-template-form');if(!form)return null;
    const samples=kind=>[...form.querySelectorAll(`[data-sample="${kind}"]`)].map(input=>input.value.trim());
    const buttonRows=[...form.querySelectorAll('[data-template-button]')].map(row=>{const value=name=>row.querySelector(`[data-button-field="${name}"]`)?.value?.trim()||'';return {type:value('type'),text:value('text'),url:value('url'),phoneNumber:value('phoneNumber')};});
    return {name:form.elements.name.value,language:form.elements.language.value,category:form.elements.category.value,headerText:form.elements.headerText.value,bodyText:form.elements.bodyText.value,footerText:form.elements.footerText.value,headerSamples:samples('header'),bodySamples:samples('body'),buttons:buttonRows};
  }
  function updatePreview(){
    const form=main.querySelector('#wa-template-form');if(!form)return;
    const sample=(kind,index)=>form.querySelector(`[data-sample="${kind}"][data-index="${index}"]`)?.value||`{{${index+1}}}`;
    const fill=(value,kind)=>String(value||'').replace(/{{\s*(\d+)\s*}}/g,(_,number)=>sample(kind,Number(number)-1));
    const header=main.querySelector('#wa-template-preview-header'),body=main.querySelector('#wa-template-preview-body'),footer=main.querySelector('#wa-template-preview-footer'),headerText=form.elements.headerText.value.trim(),bodyText=form.elements.bodyText.value.trim(),footerText=form.elements.footerText.value.trim();
    if(header){header.hidden=!headerText;header.textContent=fill(headerText,'header');}if(body)body.textContent=fill(bodyText,'body')||'O texto do modelo aparecerá aqui.';if(footer){footer.hidden=!footerText;footer.textContent=footerText;}
    const previewButtons=main.querySelector('#wa-template-preview-buttons');if(previewButtons)previewButtons.innerHTML=[...form.querySelectorAll('[data-template-button]')].map(row=>`<span>${esc(row.querySelector('[data-button-field="text"]')?.value||'Botão')}</span>`).join('');
  }
  async function persist(action){
    const form=main.querySelector('#wa-template-form'),error=form?.querySelector('#wa-template-error');if(!form||!form.reportValidity())return;
    const value=draftFromForm();if(action==='submit'&&!confirm(`Enviar “${value.name}” para análise da Meta como ${categoryLabel(value.category)}?\n\nA Meta define a decisão e pode alterar a categoria. O envio não dispara mensagens.`))return;
    const buttons=[...form.querySelectorAll('button')];buttons.forEach(button=>button.disabled=true);if(error)error.hidden=true;
    try{
      let saved;if(editing?.id)saved=await api(`/api/admin/whatsapp-templates/${encodeURIComponent(editing.id)}`,{method:'PATCH',body:value});else saved=await api('/api/admin/whatsapp-templates',{method:'POST',body:value});
      if(action==='submit'){
        try{const result=await api(`/api/admin/whatsapp-templates/${encodeURIComponent(saved.id)}/submit`,{method:'POST',body:{}});toast(result.alreadyInMeta?`O modelo já estava na Meta. Status atualizado: ${statusLabel(result.status)}.`:`Modelo enviado à Meta. Status: ${statusLabel(result.status)}.`);}
        catch(submitError){toast(`Rascunho salvo. A Meta não confirmou o envio: ${submitError.message}`);}
      }else toast('Rascunho do modelo salvo.');
      editing=null;await load();
    }catch(failure){if(error){error.textContent=failure.message;error.hidden=false;}buttons.forEach(button=>button.disabled=false);}
  }
  main.addEventListener('input',event=>{
    if(event.target.matches('[data-template-filter="query"]')){filter.query=event.target.value;cards();return;}
    const form=event.target.closest('#wa-template-form');if(!form)return;
    const samples=kind=>[...form.querySelectorAll(`[data-sample="${kind}"]`)].map(input=>input.value);
    if(event.target.name==='headerText')main.querySelector('#wa-header-samples').innerHTML=sampleInputs(form.elements.headerText.value,'header',samples('header'));
    if(event.target.name==='bodyText')main.querySelector('#wa-body-samples').innerHTML=sampleInputs(form.elements.bodyText.value,'body',samples('body'));
    updatePreview();
  });
  main.addEventListener('change',event=>{
    if(event.target.matches('[data-template-filter]')){filter[event.target.dataset.templateFilter]=event.target.value;cards();return;}
    if(event.target.name==='category'){main.querySelectorAll('.wa-category-choice').forEach(choice=>choice.classList.toggle('selected',choice.querySelector('input').checked));}
    const row=event.target.closest('[data-template-button]');if(row&&event.target.matches('[data-button-field="type"]')){const index=Number(row.dataset.templateButton);buttons[index]={type:event.target.value,text:row.querySelector('[data-button-field="text"]')?.value||''};buttonRows();}
    updatePreview();
  });
  main.addEventListener('submit',event=>{if(event.target.id==='wa-template-form'){event.preventDefault();persist(event.submitter?.value||'submit');}});
  main.addEventListener('click',async event=>{
    if(location.hash!=='#campanhas-whatsapp')return;
    if(event.target.closest('[data-create-template]')){editing=null;render();main.querySelector('#wa-template-form [name=name]')?.focus();return;}
    if(event.target.closest('[data-close-template-editor]')){editing=null;render();return;}
    if(event.target.closest('[data-save-template-draft]')){persist('draft');return;}
    const remove=event.target.closest('[data-remove-template-button]');if(remove){buttons.splice(Number(remove.dataset.removeTemplateButton),1);buttonRows();updatePreview();return;}
    if(event.target.closest('[data-add-template-button]')){if(buttons.length>=3)return;buttons.push({type:'QUICK_REPLY',text:''});buttonRows();updatePreview();return;}
    const edit=event.target.closest('[data-edit-template]');if(edit){editing=data.items.find(item=>item.id===edit.dataset.editTemplate);render();main.querySelector('#wa-template-form [name=name]')?.focus();return;}
    const submit=event.target.closest('[data-submit-template]');if(submit){const item=data.items.find(row=>row.id===submit.dataset.submitTemplate);if(!item||!confirm(`Enviar “${item.name}” à Meta para aprovação?`))return;submit.disabled=true;try{const result=await api(`/api/admin/whatsapp-templates/${encodeURIComponent(item.id)}/submit`,{method:'POST',body:{}});toast(result.alreadyInMeta?`O modelo já estava na Meta. Status atualizado: ${statusLabel(result.status)}.`:`Modelo enviado à Meta. Status: ${statusLabel(result.status)}.`);await load();}catch(error){toast(error.message);submit.disabled=false;}return;}
    const syncButton=event.target.closest('[data-sync-templates]');if(syncButton){syncButton.disabled=true;try{const result=await api('/api/admin/whatsapp-templates/sync',{method:'POST',body:{}});data=result;toast(`${result.remoteCount} modelo(s) consultado(s) na Meta.`);render();}catch(error){toast(`Não foi possível atualizar: ${error.message}`);syncButton.disabled=false;}}
  });
  async function renderInitial(){const host=root();if(!host)return;data=await api('/api/admin/whatsapp-templates');render();}
  return {render:renderInitial};
}
