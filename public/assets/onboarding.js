export function createOnboarding({api,esc,user,catalog}){
  let data=null,step=0,answers={},open=false;
  const questions=[
    {key:'sector',title:'Onde você atua hoje?',hint:'Isso ajuda a destacar o conteúdo do seu canal.',choices:'sectors'},
    {key:'role',title:'Qual é sua cadeira hoje?',hint:'Seu ponto de partida para evoluir.',choices:'roles'},
    {key:'squad',title:'Qual é o seu squad?',hint:'Escolha sua equipe ou indique que ainda não sabe.',choices:'squads'},
    {key:'challenges',title:'O que mais te desafia agora?',hint:'Escolha até três pontos para priorizarmos seu aprendizado.',choices:'challenges',multi:true},
    {key:'goal',title:'Qual cadeira você quer alcançar?',hint:'Vamos mostrar o que estudar para chegar lá.',choices:'goals'},
    {key:'dream',title:'O que mais te move?',hint:'Sua resposta também entra na sua história na Academy.',choices:'dreams'}
  ];
  const host=()=>document.querySelector('#academy-onboarding');
  const choices=q=>q.key==='squad'?(data.squads?.length?data.squads:['Ainda não sei']):data.choices[q.choices];
  const render=()=>{
    if(!open)return;const q=questions[step],selected=answers[q.key],percent=Math.round((step+1)/questions.length*100);
    host().innerHTML=`<div class="onboarding-backdrop"></div><section class="onboarding-card" role="dialog" aria-modal="true" aria-labelledby="onboarding-title"><div class="onboarding-top"><span>ST1 ACADEMY · SEU PERCURSO</span><strong>${step+1} de ${questions.length}</strong></div><div class="onboarding-progress" role="progressbar" aria-label="Progresso do primeiro acesso" aria-valuenow="${percent}" aria-valuemin="0" aria-valuemax="100"><span style="width:${percent}%"></span></div><div class="onboarding-content"><span class="onboarding-eyebrow">Seu próximo capítulo começa aqui</span><h2 id="onboarding-title">${esc(q.title)}</h2><p>${esc(q.hint)}</p><div class="onboarding-options">${choices(q).map(v=>`<button type="button" class="onboarding-option ${(q.multi?(selected||[]).includes(v):selected===v)?'selected':''}" data-answer="${esc(v)}" aria-pressed="${q.multi?(selected||[]).includes(v):selected===v}">${esc(v)}</button>`).join('')}</div><p class="onboarding-error" role="alert" hidden></p></div><div class="onboarding-actions">${step?'<button type="button" class="button button-secondary" data-back>Voltar</button>':'<span></span>'}<button type="button" class="button button-primary" data-next>${step===questions.length-1?'Ver meu percurso':'Continuar'} →</button></div></section>`;
    host().querySelector('#onboarding-title').focus?.();
  };
  const hide=()=>{open=false;host()?.remove();document.body.classList.remove('onboarding-open');};
  const show=()=>{if(host())return;const element=document.createElement('div');element.id='academy-onboarding';document.body.append(element);document.body.classList.add('onboarding-open');open=true;render();};
  document.addEventListener('click',async event=>{
    if(!open)return;const option=event.target.closest('[data-answer]');if(option){const q=questions[step],value=option.dataset.answer;if(q.multi){const values=new Set(answers[q.key]||[]);values.has(value)?values.delete(value):values.size<3&&values.add(value);answers[q.key]=[...values];}else answers[q.key]=value;render();return;}
    if(event.target.closest('[data-back]')){step--;render();return;}
    const next=event.target.closest('[data-next]');if(!next)return;
    const q=questions[step],value=answers[q.key];if(!value||(q.multi&&!value.length)){const error=host().querySelector('.onboarding-error');error.textContent='Escolha uma opção para continuar.';error.hidden=false;return;}
    if(step<questions.length-1){step++;render();return;}
    next.disabled=true;try{const result=await api('/api/onboarding',{method:'POST',body:answers});data.record=result.record;data.recommendations=result.recommendations;hide();location.hash='inicio';window.dispatchEvent(new HashChangeEvent('hashchange'));}catch(error){const node=host().querySelector('.onboarding-error');node.textContent=error.message;node.hidden=false;next.disabled=false;}
  });
  const init=async()=>{data=await api('/api/onboarding');try{const squads=await api('/api/squads');data.squads=(squads.items||[]).map(s=>s.name);data.squads.push('Ainda não sei');}catch{data.squads=['Ainda não sei'];}if(!data.record)show();return data;};
  const summary=()=>{if(!data?.record)return '';const a=data.record.answers,r=data.recommendations;return `<section class="wrap onboarding-summary"><span class="overline muted">SEU PLANO DE EVOLUÇÃO</span><h2>Seu próximo passo começa aqui.</h2><p>Hoje: <strong>${esc(a.sector)} · ${esc(a.role)}</strong>. Próxima cadeira: <strong>${esc(a.goal)}</strong>.</p><div class="onboarding-summary-grid"><div><h3>Prioridade para sua cadeira</h3>${r.current.length?r.current.slice(0,3).map(t=>`<a href="#trilha/${encodeURIComponent(t.id)}">${esc(t.name)} →</a>`).join(''):'<p>A gestão ainda vai liberar as trilhas do seu percurso.</p>'}</div><div><h3>Para onde você quer ir</h3><p>${esc(a.goal)} · ${esc(a.dream)}</p>${r.next.length?`<small>Próximas trilhas para solicitar à gestão: ${r.next.map(t=>esc(t.name)).join(', ')}.</small>`:''}</div></div><button type="button" class="onboarding-edit" data-onboarding-edit>Atualizar meu percurso</button></section>`;};
  document.addEventListener('click',event=>{if(event.target.closest('[data-onboarding-edit]')){step=0;answers={...data.record.answers};show();}});
  return {init,summary};
}

