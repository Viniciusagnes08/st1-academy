import {accessCsvTemplate,validateAccessCsv} from './access-import.js?v=20261112-access-bulk-import';

const roleLabels={seller:'Vendedor',supervisor:'Supervisor',admin:'Admin'};
const permissionLabels={materials:'Materiais de estudo',assessments:'Provas',conquests:'Insígnias e certificados',team_results:'Resultados da equipe',community:'Squads, chat e ranking',strategy:'Área Estratégia (BI) — Pesquisa de Mercado'};
const defaults=role=>Object.keys(permissionLabels).filter(id=>role==='admin'||id!=='strategy'&&(role!=='seller'||id!=='team_results'));

export function createAccessPanel({api,esc,icon,main,commitView,tracks,user=()=>null,refreshUser,toast}){
  let organizationAreas=[];
  let directory={users:[],invitations:[]},filter='all',status='all',tab='members',search='',editing=null,page=1,pageSize=10,selectedIds=new Set(),emailCheckSequence=0,importState={fileName:'',rows:null,error:'',results:null,busy:false,checking:false,validationId:0};
  const dialog=document.querySelector('#access-dialog'),confirmDialog=document.querySelector('#access-revoke-dialog');
  const trackNames=ids=>ids.map(id=>tracks().find(t=>t.id===id)?.name||id).join(', ');
  const listPeople=(role,selected,name)=>{
    const people=directory.users.filter(u=>u.role===role);
    return people.length?people.map(person=>`<label><input type="checkbox" name="${name}" value="${esc(person.id)}" ${selected.includes(person.id)?'checked':''}><span>${esc(person.name)}${!person.enabled?'<small>Acesso bloqueado</small>':''}</span></label>`).join(''):`<p class="access-field-note">${role==='seller'?'Os vendedores aparecem aqui depois de ativar a conta.':'Os supervisores aparecem aqui depois de ativar a conta.'}</p>`;
  };
  function controls(value,prefix){
    const isAdmin=value.role==='admin';
    return `<div class="access-admin-note" ${isAdmin?'':'hidden'}>${icon('shield')}<p><strong>Admin tem acesso completo.</strong>Gerencia pessoas, permissões, equipes e resultados de toda a Academia.</p></div><div ${isAdmin?'hidden':''}><fieldset class="access-fieldset"><legend>O que esta pessoa pode acessar</legend><div class="access-checks">${Object.entries(permissionLabels).filter(([id])=>value.role!=='seller'||id!=='team_results').map(([id,label])=>`<label><input type="checkbox" name="permission" value="${id}" ${value.permissions.includes(id)?'checked':''}> ${label}</label>`).join('')}</div></fieldset><fieldset class="access-fieldset"><legend>Trilhas liberadas</legend><p class="access-field-note">As provas e os materiais seguem esta seleção.</p><div class="access-checks">${tracks().map(t=>`<label><input type="checkbox" name="track" value="${t.id}" ${value.tracks.includes(t.id)?'checked':''}> ${esc(t.name)}</label>`).join('')}</div></fieldset>${value.role==='supervisor'?`<div class="access-supervisor-note">${icon('award')}<p><strong>Supervisor também se capacita.</strong>Faz as próprias provas e conquista suas insígnias e certificados.</p></div><fieldset class="access-fieldset"><legend>Vendedores que acompanha</legend><p class="access-field-note">Vê os resultados destes vendedores nas trilhas liberadas acima.</p><div class="access-people-checks">${listPeople('seller',value.sellerIds||[],'seller')}</div></fieldset>`:value.role==='seller'?`<fieldset class="access-fieldset"><legend>Supervisores deste vendedor</legend><div class="access-people-checks">${listPeople('supervisor',value.supervisorIds||[],'supervisor')}</div></fieldset>`:''}</div>`;
  }
  function selection(form){
    const checked=name=>[...form.querySelectorAll(`input[name="${name}"]:checked`)].map(input=>input.value);
    const role=form.elements.role.value;
    return {role,tracks:role==='admin'?tracks().map(t=>t.id):checked('track'),permissions:role==='admin'?defaults(role):checked('permission'),sellerIds:role==='supervisor'?checked('seller'):[],supervisorIds:role==='seller'?checked('supervisor'):[],enabled:form.elements.enabled?form.elements.enabled.checked:true};
  }
  function personRow(person,type,selected=false){
    const pending=type==='invitation',enabled=pending?person.status==='pending':person.enabled;
    const status=pending?({pending:'Convite pendente',expired:'Convite vencido',revoked:'Convite revogado'}[person.status]):enabled?'Ativo':'Bloqueado';
    const supervisors=(person.supervisorIds||[]).map(id=>directory.users.find(u=>u.id===id)?.name).filter(Boolean).join(', ');
    const selectable=!pending||person.status==='pending';
    const accessedDate=pending&&person.linkAccessedAt?new Date(person.linkAccessedAt):null;
    const accessedLabel=accessedDate&&!Number.isNaN(accessedDate.getTime())?new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'short'}).format(accessedDate):null;
    const linkAccessStatus=pending?`<small class="access-invite-link-status" title="O carregamento automático do link por verificadores de segurança também pode ser registrado.">${accessedLabel?`Acesso ao link detectado em ${esc(accessedLabel)}`:'Link ainda não acessado'}</small>`:'';
    return `<article class="access-person access-person-v2"><div class="access-person-main"><label class="access-person-select"><input type="checkbox" data-access-select="${esc(person.id)}" aria-label="Selecionar ${esc(person.name)}" ${selected?'checked':''} ${selectable?'':'disabled'}><span class="sr-only">Selecionar ${esc(person.name)}</span></label><span class="access-avatar" aria-hidden="true">${esc(person.name.split(' ').filter(Boolean).slice(0,2).map(n=>n[0]).join('').toUpperCase())}</span><div><h3>${esc(person.name)} ${!pending&&person.id===user()?.id?'<span class="access-own">Você</span>':''}</h3><p>${esc(person.email)}</p><div class="access-person-tags"><span class="access-role role-${person.role}">${roleLabels[person.role]}</span><span class="status ${enabled?'status-ok':''}">${status}</span></div>${linkAccessStatus}</div></div><div class="access-person-scope"><strong>${person.role==='admin'?'Acesso completo':person.tracks.length+' trilha'+(person.tracks.length===1?'':'s')+' liberada'+(person.tracks.length===1?'':'s')}</strong><span>${person.role==='admin'?'Todas as áreas e pessoas':esc(trackNames(person.tracks))||'Nenhuma trilha liberada'}</span>${person.role==='supervisor'?`<small>${(person.sellerIds||[]).length} vendedores na equipe · provas próprias</small>`:supervisors?`<small>Supervisor: ${esc(supervisors)}</small>`:''}</div><div class="access-person-actions">${!pending||person.status==='pending'?`<button class="button button-secondary button-small" type="button" data-edit-access="${esc(person.id)}" data-access-type="${type}" aria-label="Editar acesso de ${esc(person.name)}">Editar acesso ${icon('edit')}</button>`:'<span class="access-invite-finished">Convite encerrado</span>'}${pending&&person.status==='pending'?`<button class="button button-primary button-small access-resend-invite" type="button" data-resend-access-invite="${esc(person.id)}">Reenviar e-mail de boas-vindas</button>`:''}</div></article>`;
  }
  function renderDirectory(focus=null){
    const matches=person=>(filter==='all'||person.role===filter)&&(status==='all'||(tab==='members'?(status==='active'?person.enabled:!person.enabled):person.status===status))&&`${person.name} ${person.email}`.toLocaleLowerCase('pt-BR').includes(search.toLocaleLowerCase('pt-BR'));
    const users=directory.users.filter(matches),invitations=directory.invitations.filter(matches);
    const target=document.querySelector('#access-people-list');if(!target)return;
    const list=tab==='members'?users:invitations,availableIds=new Set((tab==='members'?directory.users:directory.invitations.filter(person=>person.status==='pending')).map(person=>person.id));for(const id of selectedIds)if(!availableIds.has(id))selectedIds.delete(id);
    const pageCount=Math.max(1,Math.ceil(list.length/pageSize));page=Math.min(page,pageCount);
    const start=(page-1)*pageSize,pageItems=list.slice(start,start+pageSize),selectable=pageItems.filter(person=>tab==='members'||person.status==='pending');
    const allSelected=selectable.length>0&&selectable.every(person=>selectedIds.has(person.id));
    const metrics=main.querySelectorAll('.access-metrics article strong');Object.keys(roleLabels).forEach((role,index)=>{if(metrics[index])metrics[index].textContent=String(directory.users.filter(p=>p.role===role).length).padStart(2,'0');});if(metrics[3])metrics[3].textContent=String(directory.invitations.filter(i=>i.status==='pending').length).padStart(2,'0');
    const selectedCount=selectedIds.size,rangeStart=list.length?start+1:0,rangeEnd=Math.min(start+pageSize,list.length),selectedMembers=tab==='members'?directory.users.filter(person=>selectedIds.has(person.id)):[],selectedRoles=new Set(selectedMembers.map(person=>person.role)),bulkAccessAllowed=selectedMembers.length===selectedCount&&selectedRoles.size===1&&!selectedRoles.has('admin');
    const accessHint=selectedRoles.size>1?'Selecione contas de um único perfil.':selectedRoles.has('admin')?'Admins já têm acesso completo.':'Ajuste disponível para Vendedores ou Supervisores.';
    const selectBar=selectable.length?`<div class="access-selection-row"><label class="access-select-page"><input type="checkbox" data-select-access-page ${allSelected?'checked':''} aria-label="Selecionar pessoas desta página"><span>Selecionar esta página (${selectable.length})</span></label>${selectedCount?`<div class="access-bulkbar" role="region" aria-label="Ações em massa"><div><strong>${selectedCount} ${selectedCount===1?'selecionada':'selecionadas'}</strong><span>A seleção atravessa páginas; alterar busca ou filtros a limpa.${tab==='members'&&!bulkAccessAllowed?` ${accessHint}`:''}</span></div>${tab==='members'?`<button type="button" class="button button-secondary button-small" data-bulk-edit-access ${bulkAccessAllowed?'':`disabled title="${esc(accessHint)}"`}>Ajustar trilhas e permissões</button><button type="button" class="button button-secondary button-small" data-bulk-enable>Ativar selecionadas</button><button type="button" class="button button-danger-outline button-small" data-bulk-disable>Bloquear selecionadas</button>`:`<button type="button" class="button button-danger-outline button-small" data-bulk-revoke>Revogar convites</button>`}<button type="button" class="access-clear-selection" data-clear-access-selection>Limpar seleção</button></div>`:''}</div>`:'';
    const pagination=`<nav class="access-pagination" aria-label="Paginação de pessoas"><span class="access-pagination-summary">Mostrando ${rangeStart}–${rangeEnd} de ${list.length}</span><label>Por página<select data-access-page-size aria-label="Pessoas por página">${[10,25,50].map(size=>`<option value="${size}" ${pageSize===size?'selected':''}>${size}</option>`).join('')}</select></label><div class="access-pagination-controls"><button type="button" class="button button-secondary button-small" data-access-page="prev" ${page<=1?'disabled':''}>Anterior</button><span>Página ${page} de ${pageCount}</span><button type="button" class="button button-secondary button-small" data-access-page="next" ${page>=pageCount?'disabled':''}>Próxima</button></div></nav>`;
    target.innerHTML=`<div class="access-list-title"><div><h2>${tab==='members'?'Pessoas da Academy':'Convites de primeiro acesso'}</h2><p>${tab==='members'?'Escolha uma pessoa para revisar perfil, trilhas e equipe.':'Cada convite é pessoal e permite definir a senha no primeiro acesso. O carregamento automático por filtros de segurança também pode registrar o link.'}</p></div><span>${list.length} ${list.length===1?'registro':'registros'}${search||filter!=='all'||status!=='all'?' encontrados':''}</span></div>${selectBar}<div class="access-people">${pageItems.map(p=>personRow(p,tab==='members'?'member':'invitation',selectedIds.has(p.id))).join('')||`<div class="access-empty-v2">${icon(tab==='members'?'users':'link')}<h3>${search||filter!=='all'||status!=='all'?'Nenhum resultado nesta busca.':tab==='members'?'Seu time começa aqui.':'Nenhum convite nesta seleção.'}</h3><p>${search||filter!=='all'||status!=='all'?'Revise os filtros ou tente outro nome.':'Use Convidar pessoa para preparar um novo acesso.'}</p></div>`}</div>${list.length?pagination:''}`;
    const pageCheckbox=target.querySelector('[data-select-access-page]');if(pageCheckbox)pageCheckbox.indeterminate=selectable.some(person=>selectedIds.has(person.id))&&!allSelected;
    if(focus==='page')target.querySelector('[data-select-access-page]')?.focus();
    else if(focus==='pageSize')target.querySelector('[data-access-page-size]')?.focus();
    else if(focus?.type==='person'){[...target.querySelectorAll('[data-access-select]')].find(input=>input.dataset.accessSelect===focus.id)?.focus();}
    else if(focus==='next')target.querySelector('[data-access-page="next"]')?.focus();
    else if(focus==='prev')target.querySelector('[data-access-page="prev"]')?.focus();
    document.querySelectorAll('[data-access-tab]').forEach(button=>{const selected=button.dataset.accessTab===tab;button.classList.toggle('selected',selected);button.setAttribute('aria-pressed',String(selected));const count=button.querySelector('span');if(count)count.textContent=button.dataset.accessTab==='members'?directory.users.length:directory.invitations.length;});
    document.querySelectorAll('[data-access-filter]').forEach(button=>{const selected=button.dataset.accessFilter===filter;button.classList.toggle('selected',selected);button.setAttribute('aria-pressed',String(selected));});
  }
  function statusOptions(){const field=main.querySelector('#access-status-filter');if(!field)return;field.innerHTML='<option value="all">Todas as situações</option>'+(tab==='members'?'<option value="active">Ativos</option><option value="blocked">Bloqueados</option>':'<option value="pending">Pendentes</option><option value="expired">Vencidos</option><option value="revoked">Revogados</option>');field.value=status;}
  function inviteMarkup(){return `<dialog class="workspace-drawer" id="access-create-dialog" aria-labelledby="access-create-title"><div class="drawer-heading"><div><span class="overline muted">PRIMEIRO ACESSO</span><h2 id="access-create-title">Convidar pessoa</h2><p>O convite é pessoal e vale por 7 dias.</p></div><button type="button" class="drawer-close" data-close-access-invite aria-label="Fechar convite">×</button></div><div class="drawer-content"><form id="access-invite-form" class="invite-form"><label for="access-new-name">Nome completo</label><input id="access-new-name" name="name" required minlength="3" maxlength="80" autocomplete="off"><label for="access-new-email">E-mail</label><input id="access-new-email" name="email" type="email" required autocomplete="off"><p id="access-email-validation" class="access-field-note" role="status" aria-live="polite" hidden></p><label for="access-new-role">Perfil de acesso</label><select id="access-new-role" name="role">${Object.entries(roleLabels).map(([id,label])=>`<option value="${id}">${label}</option>`).join('')}</select><div id="access-new-controls">${controls({role:'seller',tracks:tracks().map(t=>t.id),permissions:defaults('seller')},'new')}</div><button class="button button-primary full-width" type="submit">Gerar convite ${icon('link')}</button><p class="form-error" id="access-invite-error" role="alert" hidden></p></form><div id="access-invite-result" class="invite-result" hidden></div></div><div class="drawer-footer"><button type="button" class="button button-secondary" data-close-access-invite data-access-invite-finish>Cancelar</button></div></dialog>`;}
  function bulkAccessMarkup(){return `<dialog class="workspace-drawer access-import-drawer" id="access-bulk-access-dialog" aria-labelledby="access-bulk-access-title"><div class="drawer-heading"><div><span class="overline muted">ALTERAÇÃO EM LOTE</span><h2 id="access-bulk-access-title">Ajustar trilhas e permissões</h2><p>Altere o acesso de várias contas do mesmo perfil.</p></div><button type="button" class="drawer-close" data-close-bulk-access aria-label="Fechar ajuste em massa">×</button></div><div class="drawer-content"><p class="access-bulk-access-summary" id="access-bulk-access-summary"></p><p class="access-field-note">Os itens atuais não selecionados permanecem iguais. Admins mantêm acesso completo e precisam ser ajustados individualmente.</p><div id="access-bulk-access-controls"></div></div><div class="drawer-footer access-bulk-access-footer"><button type="button" class="button button-secondary" data-close-bulk-access>Cancelar</button><button type="button" class="button button-danger-outline" data-apply-bulk-access="remove">Remover itens</button><button type="button" class="button button-primary" data-apply-bulk-access="add">Adicionar itens</button></div></dialog>`;}
  function importMarkup(){return `<dialog class="workspace-drawer access-import-drawer" id="access-import-dialog" aria-labelledby="access-import-title"><div class="drawer-heading"><div><span class="overline muted">CADASTRO EM LOTE</span><h2 id="access-import-title">Importar pessoas</h2><p>Use o modelo CSV para preparar vários convites de uma vez.</p></div><button type="button" class="drawer-close" data-close-access-import aria-label="Fechar importação">×</button></div><div class="drawer-content"><section class="access-import-model"><div><strong>Modelo de importação</strong><p>O arquivo aceita até 100 pessoas. Baixe o cabeçalho oficial e mantenha os nomes das colunas.</p></div><button type="button" class="button button-secondary button-small" data-download-access-template>${icon('download')} Baixar modelo CSV</button></section><div class="access-import-guide"><strong>Como preencher</strong><p>Colunas obrigatórias: <code>nome</code>, <code>email</code> e <code>perfil</code>. Perfis aceitos: Vendedor, Supervisor e Admin.</p><p>Trilhas e permissões usam valores separados por <code>|</code>. IDs válidos de trilha: ${tracks().map(track=>`<code>${esc(track.id)}</code>`).join(', ')}. Campos vazios não liberam trilhas ou permissões.</p><p>Permissões: ${Object.keys(permissionLabels).map(id=>`<code>${id}</code>`).join(', ')}. <code>team_results</code> só é válido para Supervisores. Supervisores e vendedores podem ser associados pelo e-mail de contas existentes. Admin recebe acesso completo.</p></div><label class="access-import-file"><span>Arquivo CSV</span><input id="access-import-file" type="file" accept=".csv,text/csv"><small>Use um arquivo UTF-8 separado por ponto e vírgula ou vírgula.</small></label><div id="access-import-preview" aria-live="polite"></div><div class="access-import-error" id="access-import-error" role="alert" hidden></div><div class="access-import-confirm"><label><input id="access-import-confirm" type="checkbox"><span>Confirmo a criação dos convites e o envio de um e-mail individual para cada endereço.</span></label><button type="button" class="button button-primary" data-run-access-import disabled>Importar e enviar convites ${icon('arrow')}</button></div></div><div class="drawer-footer"><button type="button" class="button button-secondary" data-close-access-import>Fechar</button></div></dialog>`;}
  function renderImportPreview(){
    const target=main.querySelector('#access-import-preview'),errorBox=main.querySelector('#access-import-error'),runButton=main.querySelector('[data-run-access-import]');if(!target||!errorBox||!runButton)return;
    errorBox.hidden=!importState.error;errorBox.textContent=importState.error||'';
    if(importState.results){
      const result=importState.results;target.innerHTML=`<section class="access-import-results"><div class="access-import-result-heading"><strong>${result.created} convites criados</strong><span>${result.sent} aceitos pelo SMTP · ${result.notSent} sem envio</span></div><p>O aceite pelo servidor de e-mail não confirma a chegada à caixa postal. Os convites estão disponíveis na aba Convites; para mensagens não aceitas, copie o link ou reenvie depois.</p>${result.items.map((item,index)=>`<article><div><strong>${esc(item.name)}</strong><span>${esc(item.email)}</span><small>${esc(item.emailDomainMessage||'O domínio foi verificado; a caixa postal não foi testada.')}</small></div><span class="access-import-delivery ${item.delivery==='sent'?'is-sent':'is-pending'}">${item.delivery==='sent'?'Aceito pelo SMTP':item.delivery==='failed'?'Falha no e-mail':'Envio não configurado'}</span>${item.delivery==='sent'?'':`<div class="access-import-link"><input id="access-import-link-${index}" readonly value="${esc(item.url)}" aria-label="Link do convite de ${esc(item.email)}"><button type="button" class="button button-secondary button-small" data-copy-import-link="${index}">Copiar link</button></div>`}</article>`).join('')}</section>`;
      runButton.disabled=true;main.querySelector('#access-import-confirm').checked=false;return;
    }
    if(!importState.rows){target.innerHTML=importState.fileName?`<p class="access-import-file-name">Arquivo selecionado: <strong>${esc(importState.fileName)}</strong></p>`:'';runButton.disabled=true;return;}
    const valid=importState.rows.filter(row=>!row.errors.length).length,invalid=importState.rows.length-valid,unknownDomains=importState.rows.filter(row=>row.emailDomainStatus==='unknown').length;
    const verificationNote=importState.checking?'Consultando o domínio dos endereços…':unknownDomains?`${unknownDomains} domínio(s) não puderam ser confirmados agora; o servidor fará nova checagem antes de criar os convites.`:'';
    target.innerHTML=`<section class="access-import-preview"><div class="access-import-result-heading"><strong>${valid} prontos para importar</strong><span>${invalid} ${invalid===1?'linha precisa':'linhas precisam'} de ajuste</span></div><p>${esc(importState.fileName)} · ${importState.rows.length} pessoas. ${invalid?'Corrija todas as linhas com erro antes de importar.':'Confira a prévia; nenhum convite será criado até você confirmar.'} ${esc(verificationNote)}</p><div class="access-import-table-wrap"><table class="access-import-table"><thead><tr><th>Linha</th><th>Pessoa</th><th>Perfil</th><th>Acesso</th><th>Situação</th></tr></thead><tbody>${importState.rows.slice(0,10).map(row=>`<tr class="${row.errors.length?'has-error':''}"><td>${row.rowNumber}</td><td><strong>${esc(row.name||'—')}</strong><small>${esc(row.email||'Sem e-mail')}</small>${row.errors.length?`<ul>${row.errors.map(error=>`<li>${esc(error)}</li>`).join('')}</ul>`:''}</td><td>${roleLabels[row.role]||esc(row.role||'—')}</td><td>${row.role==='admin'?'Acesso completo':`<strong>Trilhas:</strong> ${esc(trackNames(row.tracks)||'nenhuma')}<small><strong>Permissões:</strong> ${esc(row.permissions.join(', ')||'nenhuma')}${row.supervisorIds.length||row.sellerIds.length?` · ${row.supervisorIds.length} supervisor(es), ${row.sellerIds.length} vendedor(es) vinculados`:''}</small>`}</td><td>${row.errors.length?'<span class="access-import-delivery is-error">Corrigir</span>':importState.checking?'<span class="access-import-delivery is-pending">Consultando…</span>':row.emailDomainStatus==='unknown'?'<span class="access-import-delivery is-pending" title="A verificação será repetida no servidor antes da criação.">Domínio não confirmado</span>':row.emailDomainStatus==='valid'?'<span class="access-import-delivery is-sent">Servidor do domínio encontrado</span>':'<span class="access-import-delivery is-pending">Formato válido</span>'}</td></tr>`).join('')}</tbody></table></div>${importState.rows.length>10?`<small>Prévia das primeiras 10 linhas; o servidor revalida todos os endereços antes da criação.</small>`:''}</section>`;
    runButton.textContent=`Importar e enviar ${valid} convites`;
    runButton.disabled=invalid>0||valid===0||importState.checking||!main.querySelector('#access-import-confirm').checked||importState.busy;
  }
  function openBulkAccess(){
    const people=directory.users.filter(person=>selectedIds.has(person.id)),roles=new Set(people.map(person=>person.role));
    if(!people.length||people.length!==selectedIds.size||roles.size!==1||roles.has('admin')){toast('Selecione contas Vendedor ou Supervisor de um único perfil.');return;}
    const role=people[0].role,dialog=main.querySelector('#access-bulk-access-dialog'),permissionsForRole=Object.entries(permissionLabels).filter(([id])=>role!=='seller'||id!=='team_results');
    main.querySelector('#access-bulk-access-summary').textContent=`${people.length} contas selecionadas · perfil ${roleLabels[role]}. Escolha trilhas ou permissões para adicionar ou remover.`;
    main.querySelector('#access-bulk-access-controls').innerHTML=`<fieldset class="access-fieldset"><legend>Trilhas</legend><div class="access-checks">${tracks().map(track=>`<label><input type="checkbox" name="bulk-track" value="${esc(track.id)}"> ${esc(track.name)}</label>`).join('')}</div></fieldset><fieldset class="access-fieldset"><legend>Permissões</legend><div class="access-checks">${permissionsForRole.map(([id,label])=>`<label><input type="checkbox" name="bulk-permission" value="${id}"> ${label}</label>`).join('')}</div></fieldset>`;
    dialog.showModal();main.querySelector('#access-bulk-access-controls input')?.focus();
  }
  async function adjustSelectedAccess(operation,button){
    const ids=[...selectedIds],controls=main.querySelector('#access-bulk-access-controls'),tracksSelected=[...controls.querySelectorAll('input[name="bulk-track"]:checked')].map(input=>input.value),permissionsSelected=[...controls.querySelectorAll('input[name="bulk-permission"]:checked')].map(input=>input.value);
    if(!tracksSelected.length&&!permissionsSelected.length){toast('Selecione ao menos uma trilha ou permissão.');return;}
    const action=operation==='add'?'Adicionar':'Remover',effect=operation==='remove'?' Isso pode retirar o acesso dessas pessoas a conteúdos, sem bloquear a conta.':'';if(!confirm(`${action} ${tracksSelected.length} trilha(s) e ${permissionsSelected.length} permissão(ões) em ${ids.length} contas?${effect}`))return;
    const buttons=[...main.querySelectorAll('[data-apply-bulk-access]')];buttons.forEach(item=>item.disabled=true);
    try{const result=await api('/api/admin/members/bulk-access',{method:'POST',body:{userIds:ids,operation,tracks:tracksSelected,permissions:permissionsSelected}});selectedIds.clear();directory=await api('/api/admin/access');main.querySelector('#access-bulk-access-dialog').close();renderDirectory();toast(`${result.updated} contas atualizadas${result.unchanged?`; ${result.unchanged} já estavam assim`:''}.`);}
    catch(error){toast(error.message);}finally{buttons.forEach(item=>item.disabled=false);}
  }
  function organizationMarkup(){
    const departments=organizationAreas.reduce((count,area)=>count+area.departments.length,0);
    return `<section class="access-directory-v2" aria-labelledby="academy-organization-heading" style="margin-top:24px;padding:24px"><div class="access-list-title"><div><h2 id="academy-organization-heading">Setores da ST1 Academy</h2><p>18 áreas organizacionais e suas especialidades. Este catálogo não concede acesso a cursos ou funções administrativas.</p></div><span>${organizationAreas.length} áreas · ${departments} especialidades</span></div><div class="academy-organizational-grid" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:12px">${organizationAreas.map(area=>`<details style="border:1px solid var(--line, #d7dce2);border-radius:12px;padding:12px"><summary style="cursor:pointer;font-weight:700">${esc(area.order+'. '+area.name)} <small>(${area.departments.length})</small></summary><ul style="padding-left:20px;margin:12px 0 0">${area.departments.filter(item=>item.active).map(item=>`<li>${esc(item.name)}</li>`).join('')}</ul></details>`).join('')}</div></section>`;
  }
  async function render(){
    const [accessData,organizationData]=await Promise.all([api('/api/admin/access'),api('/api/admin/organizational-areas')]);
    organizationAreas=organizationData.areas||[];
    directory=accessData;if(location.hash!=='#acessos')return;
    const counts=Object.fromEntries(Object.keys(roleLabels).map(role=>[role,directory.users.filter(u=>u.role===role).length]));
    commitView(`<section class="page-top access-page-top"><div class="wrap content-heading"><div><span class="overline muted">PESSOAS E PERMISSÕES</span><h1>Gestão de pessoas e acessos.</h1><p>Organize pessoas, trilhas e acompanhamento em um só lugar.</p></div><div class="page-heading-actions"><button type="button" class="button button-secondary" data-open-access-import>${icon('download')} Importar em massa</button><button type="button" class="button button-primary" data-open-access-invite>Convidar pessoa ${icon('plus')}</button></div></div></section><section class="wrap access-content access-content-v2"><div class="access-metrics">${Object.entries(roleLabels).map(([role,label])=>`<article><span>${role==='seller'?'Vendedores':role==='supervisor'?'Supervisores':'Admins'}</span><strong>${String(counts[role]).padStart(2,'0')}</strong>${icon(role==='admin'?'shield':'users')}</article>`).join('')}<article><span>Convites pendentes</span><strong>${String(directory.invitations.filter(i=>i.status==='pending').length).padStart(2,'0')}</strong>${icon('link')}</article></div><section class="access-directory-v2"><nav class="access-section-tabs" aria-label="Listas de acesso"><button type="button" data-access-tab="members" aria-pressed="${tab==='members'}">Contas <span>${directory.users.length}</span></button><button type="button" data-access-tab="invitations" aria-pressed="${tab==='invitations'}">Convites <span>${directory.invitations.length}</span></button></nav><div class="access-toolbar-v2"><label class="access-search"><span class="sr-only">Buscar pessoa por nome ou e-mail</span>${icon('users')}<input id="access-search" type="search" placeholder="Buscar nome ou e-mail" value="${esc(search)}"></label><label><span>Perfil</span><select id="access-role-filter"><option value="all">Todos os perfis</option>${Object.entries(roleLabels).map(([id,label])=>`<option value="${id}" ${filter===id?'selected':''}>${label}</option>`).join('')}</select></label><label><span>Situação</span><select id="access-status-filter"></select></label></div><div id="access-people-list"></div></section>${organizationMarkup()}${bulkAccessMarkup()}${inviteMarkup()}${importMarkup()}</section>`);statusOptions();renderDirectory();renderImportPreview();
  }
  function openEditor(id,type){
    const person=(type==='member'?directory.users:directory.invitations).find(u=>u.id===id);if(!person)return;
    editing={id,type};
    const protectedAdmin=type==='member'&&person.id===user()?.id&&person.role==='admin'&&directory.users.filter(p=>p.role==='admin'&&p.enabled).length===1;
    document.querySelector('#access-edit-title').textContent=type==='member'?'Editar acesso':'Editar convite';
    document.querySelector('#access-edit-person').textContent=`${person.name} · ${person.email}`;
    document.querySelector('#access-edit-body').innerHTML=`<label for="access-edit-role">Perfil de acesso</label><select id="access-edit-role" name="role">${Object.entries(roleLabels).map(([role,label])=>`<option value="${role}" ${person.role===role?'selected':''}>${label}</option>`).join('')}</select><div id="access-edit-controls">${controls(person,'edit')}</div>${type==='member'?`<label class="access-enabled"><input type="checkbox" name="enabled" ${person.enabled?'checked':''}><span><strong>Acesso ativo</strong><small>Desmarque para bloquear a conta. O histórico fica preservado.</small></span></label>`:''}`;
    if(protectedAdmin){document.querySelector('#access-edit-role').querySelectorAll('option').forEach(o=>o.disabled=o.value!=='admin');const enabled=document.querySelector('#access-edit-body input[name=enabled]');enabled.disabled=true;enabled.closest('label').querySelector('small').textContent='Este é o único Admin ativo. O acesso administrativo permanece liberado.';}
    document.querySelector('#access-edit-error').hidden=true;document.querySelector('#access-edit-revoke').hidden=type!=='invitation';
    dialog.showModal();document.querySelector('#access-edit-role').focus();
  }
  function roleChange(form,target){
    const value=selection(form);value.permissions=defaults(value.role);value.sellerIds=[];value.supervisorIds=[];
    document.querySelector(target).innerHTML=controls(value,'change');
  }
  async function validateInviteEmail(input){
    const note=main.querySelector('#access-email-validation'),value=input.value.trim(),requestId=++emailCheckSequence;
    if(!note)return;
    note.hidden=true;note.textContent='';delete note.dataset.status;
    if(!value||!input.checkValidity())return;
    note.hidden=false;note.textContent='Consultando o domínio…';
    try{
      const result=await api('/api/admin/invitations/validate',{method:'POST',body:{emails:[value]}});
      if(requestId!==emailCheckSequence||!input.isConnected||input.value.trim()!==value)return;
      note.textContent=result.items?.[0]?.message||'Não foi possível concluir a validação do domínio.';note.dataset.status=result.items?.[0]?.status||'unknown';
    }catch{
      if(requestId!==emailCheckSequence||!input.isConnected)return;
      note.textContent='Não foi possível consultar o domínio agora. O servidor fará nova checagem antes de criar o convite.';note.dataset.status='unknown';
    }
  }
  async function loadImportFile(file){
    const validationId=(importState.validationId||0)+1;
    importState={fileName:file.name,rows:null,error:'',results:null,busy:false,checking:false,validationId};
    if(file.size>1024*1024){importState.error='O arquivo passou de 1 MB. Salve apenas a lista de pessoas no CSV e tente novamente.';main.querySelector('#access-import-confirm').checked=false;renderImportPreview();return;}
    try{
      const rows=validateAccessCsv(await file.text(),directory,tracks(),permissionLabels);
      if(importState.validationId!==validationId)return;
      if(!rows.length)throw new Error('Inclua ao menos uma pessoa depois do cabeçalho.');
      importState.rows=rows;importState.checking=true;main.querySelector('#access-import-confirm').checked=false;renderImportPreview();
      try{
        const result=await api('/api/admin/invitations/validate',{method:'POST',body:{emails:rows.map(row=>row.email)}});
        if(importState.validationId!==validationId)return;
        importState.rows=rows.map((row,index)=>{
          const check=result.items?.[index],status=check?.status||'unknown',message=check?.message||'A verificação do domínio não foi concluída; o servidor fará nova checagem antes de criar o convite.';
          const errors=[...row.errors];if(status==='invalid'&&message&&!errors.includes(message))errors.push(message);
          return {...row,errors,emailDomainStatus:status,emailDomainMessage:message};
        });
      }catch{
        if(importState.validationId!==validationId)return;
        importState.rows=rows.map(row=>({...row,emailDomainStatus:'unknown',emailDomainMessage:'A consulta automática falhou; o servidor verificará novamente antes de criar o convite.'}));
      }
      if(importState.validationId!==validationId)return;
      importState.checking=false;
    }catch(error){
      if(importState.validationId!==validationId)return;
      importState.error=error.message;
    }
    if(importState.validationId!==validationId)return;
    renderImportPreview();
  }
  async function changeMembersStatus(enabled,button){
    const ids=[...selectedIds].filter(id=>directory.users.some(person=>person.id===id));if(!ids.length)return;
    if(!confirm(`${enabled?'Ativar':'Bloquear'} ${ids.length} contas selecionadas?${enabled?'':' As pessoas perderão acesso imediatamente; o histórico será preservado.'}`))return;
    button.disabled=true;
    try{const result=await api('/api/admin/members/bulk-status',{method:'POST',body:{userIds:ids,enabled}});selectedIds.clear();directory=await api('/api/admin/access');renderDirectory();toast(`${result.updated} contas ${enabled?'ativadas':'bloqueadas'}${result.unchanged?`; ${result.unchanged} já estavam nessa situação`:''}.`);}
    catch(error){toast(error.message);}finally{button.disabled=false;}
  }
  async function revokeSelectedInvitations(button){
    const ids=[...selectedIds].filter(id=>directory.invitations.some(invitation=>invitation.id===id&&invitation.status==='pending'));if(!ids.length)return;
    if(!confirm(`Revogar ${ids.length} convites selecionados? Os links deixam de funcionar e não poderão ativar as contas.`))return;
    button.disabled=true;
    try{const result=await api('/api/admin/invitations/bulk-revoke',{method:'POST',body:{invitationIds:ids}});selectedIds.clear();directory=await api('/api/admin/access');statusOptions();renderDirectory();toast(`${result.revoked} convites revogados.`);}
    catch(error){toast(error.message);}finally{button.disabled=false;}
  }
  async function submitAccessImport(button){
    if(importState.busy||!importState.rows?.length||importState.rows.some(row=>row.errors.length)||!main.querySelector('#access-import-confirm').checked)return;
    importState.busy=true;button.disabled=true;button.textContent='Importando e enviando…';
    try{
      const items=importState.rows.map(({errors,...item})=>item),result=await api('/api/admin/invitations/bulk',{method:'POST',body:{items}});
      importState={fileName:'',rows:null,error:'',results:result,busy:false};directory=await api('/api/admin/access');selectedIds.clear();tab='invitations';filter='all';status='all';search='';page=1;statusOptions();
      const searchField=main.querySelector('#access-search'),roleField=main.querySelector('#access-role-filter');if(searchField)searchField.value='';if(roleField)roleField.value='all';
      renderDirectory();renderImportPreview();toast(`${result.created} convites criados; ${result.sent} envios aceitos pelo SMTP.`);
    }catch(error){importState.busy=false;importState.error=error.message;renderImportPreview();}
  }
  main.addEventListener('input',event=>{
    if(event.target.id==='access-search'){search=event.target.value;selectedIds.clear();page=1;renderDirectory();}
    if(event.target.id==='access-new-email'){emailCheckSequence++;const note=main.querySelector('#access-email-validation');if(note){note.hidden=true;note.textContent='';delete note.dataset.status;}}
  });
  main.addEventListener('focusout',event=>{if(event.target.id==='access-new-email')void validateInviteEmail(event.target);});
  main.addEventListener('change',event=>{
    if(event.target.id==='access-new-role')roleChange(event.target.form,'#access-new-controls');
    if(event.target.id==='access-role-filter'){filter=event.target.value;selectedIds.clear();page=1;renderDirectory();}
    if(event.target.id==='access-status-filter'){status=event.target.value;selectedIds.clear();page=1;renderDirectory();}
    if(event.target.id==='access-import-file'){const file=event.target.files?.[0];if(file)void loadImportFile(file);}
    if(event.target.id==='access-import-confirm')renderImportPreview();
    if(event.target.matches('[data-access-page-size]')){pageSize=Number(event.target.value)||10;page=1;renderDirectory('pageSize');}
    if(event.target.matches('[data-access-select]')){if(event.target.checked&&selectedIds.size>=500){event.target.checked=false;toast('Selecione até 500 pessoas por ação em massa.');renderDirectory({type:'person',id:event.target.dataset.accessSelect});return;}if(event.target.checked)selectedIds.add(event.target.dataset.accessSelect);else selectedIds.delete(event.target.dataset.accessSelect);renderDirectory({type:'person',id:event.target.dataset.accessSelect});}
    if(event.target.matches('[data-select-access-page]')){const boxes=[...main.querySelectorAll('#access-people-list [data-access-select]:not(:disabled)')],additions=boxes.filter(box=>event.target.checked&&!selectedIds.has(box.dataset.accessSelect));if(event.target.checked&&selectedIds.size+additions.length>500){toast('O limite é de 500 pessoas por ação em massa. Reduza a seleção e tente novamente.');renderDirectory('page');return;}for(const box of boxes){if(event.target.checked)selectedIds.add(box.dataset.accessSelect);else selectedIds.delete(box.dataset.accessSelect);}renderDirectory('page');}
  });
  main.addEventListener('click',async event=>{
    const toggle=event.target.closest('[data-access-tab]');if(toggle){tab=toggle.dataset.accessTab;status='all';page=1;selectedIds.clear();statusOptions();renderDirectory();return;}
    const invite=event.target.closest('[data-open-access-invite]');if(invite){const form=main.querySelector('#access-invite-form');form.reset();emailCheckSequence++;const emailStatus=main.querySelector('#access-email-validation');emailStatus.hidden=true;emailStatus.textContent='';delete emailStatus.dataset.status;main.querySelector('#access-new-controls').innerHTML=controls({role:'seller',tracks:tracks().map(t=>t.id),permissions:defaults('seller')},'new');form.hidden=false;main.querySelector('[data-access-invite-finish]').textContent='Cancelar';main.querySelector('#access-invite-result').hidden=true;main.querySelector('#access-invite-error').hidden=true;main.querySelector('#access-create-dialog').showModal();main.querySelector('#access-new-name').focus();return;}
    if(event.target.closest('[data-close-access-invite]')){main.querySelector('#access-create-dialog').close();main.querySelector('[data-open-access-invite]').focus();return;}
    const openImport=event.target.closest('[data-open-access-import]');if(openImport){importState={fileName:'',rows:null,error:'',results:null,busy:false,checking:false,validationId:(importState.validationId||0)+1};main.querySelector('#access-import-file').value='';main.querySelector('#access-import-confirm').checked=false;renderImportPreview();main.querySelector('#access-import-dialog').showModal();main.querySelector('#access-import-file').focus();return;}
    if(event.target.closest('[data-close-access-import]')){main.querySelector('#access-import-dialog').close();main.querySelector('[data-open-access-import]')?.focus();return;}
    if(event.target.closest('[data-download-access-template]')){const link=document.createElement('a'),url=URL.createObjectURL(new Blob([accessCsvTemplate()],{type:'text/csv;charset=utf-8'}));link.href=url;link.download='modelo-importacao-pessoas-st1-academy.csv';document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);return;}
    const runImport=event.target.closest('[data-run-access-import]');if(runImport){await submitAccessImport(runImport);return;}
    const copyImport=event.target.closest('[data-copy-import-link]');if(copyImport){const field=main.querySelector(`#access-import-link-${copyImport.dataset.copyImportLink}`);if(field){if(!navigator.clipboard?.writeText){field.select();toast('Link selecionado para cópia.');return;}navigator.clipboard.writeText(field.value).then(()=>toast('Link pessoal copiado.')).catch(()=>{field.select();toast('Link selecionado para cópia.');});}return;}
    const bulkEnable=event.target.closest('[data-bulk-enable]');if(bulkEnable){await changeMembersStatus(true,bulkEnable);return;}
    const bulkDisable=event.target.closest('[data-bulk-disable]');if(bulkDisable){await changeMembersStatus(false,bulkDisable);return;}
    const bulkRevoke=event.target.closest('[data-bulk-revoke]');if(bulkRevoke){await revokeSelectedInvitations(bulkRevoke);return;}
    if(event.target.closest('[data-bulk-edit-access]')){openBulkAccess();return;}
    if(event.target.closest('[data-close-bulk-access]')){main.querySelector('#access-bulk-access-dialog').close();main.querySelector('[data-bulk-edit-access]')?.focus();return;}
    const applyBulkAccess=event.target.closest('[data-apply-bulk-access]');if(applyBulkAccess){await adjustSelectedAccess(applyBulkAccess.dataset.applyBulkAccess,applyBulkAccess);return;}
    if(event.target.closest('[data-clear-access-selection]')){selectedIds.clear();renderDirectory();return;}
    const pageButton=event.target.closest('[data-access-page]');if(pageButton&&!pageButton.disabled){if(pageButton.dataset.accessPage==='next')page++;else page=Math.max(1,page-1);renderDirectory(pageButton.dataset.accessPage);return;}
    const filtered=event.target.closest('[data-access-filter]');if(filtered){filter=filtered.dataset.accessFilter;selectedIds.clear();page=1;renderDirectory();return;}
    const edit=event.target.closest('[data-edit-access]');if(edit)openEditor(edit.dataset.editAccess,edit.dataset.accessType);
    const copy=event.target.closest('[data-copy-access-invite]');if(copy){navigator.clipboard.writeText(document.querySelector('#access-generated-invite').value).then(()=>toast('Convite copiado. Envie somente para esta pessoa.')).catch(()=>document.querySelector('#access-generated-invite').select());}
    const resend=event.target.closest('[data-resend-access-invite]');if(resend){
      if(!confirm('Reenviar o convite por e-mail? O link anterior deixará de funcionar.'))return;
      resend.disabled=true;
      try{const result=await api(`/api/admin/invitations/${resend.dataset.resendAccessInvite}/resend`,{method:'POST',body:{}});if(result.delivery==='sent')toast('O servidor de e-mail aceitou o reenvio.');else{const popup=main.querySelector('#access-create-dialog'),form=popup.querySelector('#access-invite-form'),target=popup.querySelector('#access-invite-result');form.hidden=true;target.innerHTML=`<p>O e-mail não foi enviado. Copie o novo link e confira a configuração SMTP.</p><label for="access-generated-invite">Link pessoal</label><input id="access-generated-invite" readonly value="${esc(result.url)}"><button type="button" class="button button-secondary full-width" data-copy-access-invite>Copiar convite ${icon('link')}</button>`;target.hidden=false;popup.querySelector('[data-access-invite-finish]').textContent='Concluir';popup.showModal();}directory=await api('/api/admin/access');renderDirectory();}
      catch(error){toast(error.message);}finally{resend.disabled=false;}
    }
  });
  main.addEventListener('submit',async event=>{
    if(event.target.id!=='access-invite-form')return;event.preventDefault();
    const form=event.target,button=form.querySelector('[type=submit]'),errorBox=document.querySelector('#access-invite-error');button.disabled=true;errorBox.hidden=true;
    try{
      const result=await api('/api/admin/invitations',{method:'POST',body:{name:form.elements.name.value,email:form.elements.email.value,...selection(form)}});
      const target=document.querySelector('#access-invite-result');const deliveryMessage=result.delivery==='sent'?'O servidor de e-mail aceitou o envio; isso não confirma a chegada à caixa postal.':result.delivery==='failed'?'O convite foi criado, mas o envio falhou. Copie o link e confira a configuração SMTP.':'O convite foi criado, mas o envio de e-mail ainda não está configurado. Copie o link.';target.innerHTML=`<p>${deliveryMessage} ${esc(result.emailDomainMessage||'')}</p><label for="access-generated-invite">Link pessoal</label><input id="access-generated-invite" readonly value="${esc(result.url)}"><button type="button" class="button button-secondary full-width" data-copy-access-invite>Copiar convite ${icon('link')}</button>`;target.hidden=false;
      form.hidden=true;main.querySelector('[data-access-invite-finish]').textContent='Concluir';directory=await api('/api/admin/access');tab='invitations';filter='all';status='all';search='';page=1;selectedIds.clear();statusOptions();main.querySelector('#access-search').value='';main.querySelector('#access-role-filter').value='all';renderDirectory();
    }catch(error){errorBox.textContent=error.message;errorBox.hidden=false;}finally{button.disabled=false;}
  });
  dialog.addEventListener('change',event=>{if(event.target.id==='access-edit-role')roleChange(event.target.form,'#access-edit-controls');});
  document.querySelector('#access-edit-close').addEventListener('click',()=>dialog.close());
  document.querySelector('#access-edit-cancel').addEventListener('click',()=>dialog.close());
  document.querySelector('#access-edit-form').addEventListener('submit',async event=>{
    event.preventDefault();const button=document.querySelector('#access-edit-save'),errorBox=document.querySelector('#access-edit-error');button.disabled=true;errorBox.hidden=true;
    try{
      await api(`/api/admin/${editing.type==='member'?'members':'invitations'}/${editing.id}`,{method:'PATCH',body:selection(event.target)});
      await refreshUser();if(user()?.role!=='admin'){dialog.close();location.hash='#inicio';toast('Acesso atualizado.');return;}await render();dialog.close();toast('Acesso atualizado.');
    }catch(error){errorBox.textContent=error.message;errorBox.hidden=false;}finally{button.disabled=false;}
  });
  document.querySelector('#access-edit-revoke').addEventListener('click',()=>{dialog.close();confirmDialog.showModal();});
  document.querySelector('#access-revoke-cancel').addEventListener('click',()=>{confirmDialog.close();openEditor(editing.id,editing.type);});
  document.querySelector('#access-revoke-confirm').addEventListener('click',async event=>{
    const button=event.currentTarget,errorBox=document.querySelector('#access-revoke-error');button.disabled=true;errorBox.hidden=true;
    try{await api(`/api/admin/invitations/${editing.id}/revoke`,{method:'POST',body:{}});confirmDialog.close();await render();toast('Convite revogado. O link não permite mais ativar a conta.');}catch(error){errorBox.textContent=error.message;errorBox.hidden=false;}finally{button.disabled=false;}
  });
  return {render};
}

