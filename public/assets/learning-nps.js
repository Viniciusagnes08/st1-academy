const categories=[
  ['clarity','Clareza das explicações'],['examples','Mais exemplos práticos'],['applicability','Aplicação na rotina'],
  ['organization','Organização e sequência'],['pace','Duração ou ritmo'],['materials','Materiais de apoio'],
  ['difficulty','Nível de dificuldade'],['interaction','Exercícios e interatividade'],['other','Outro ponto']
];

export function createLearningNpsPanel({api,esc,main,commitView,onSubmitted}){
  let current=null,saving=false;
  const render=()=>{
    if(!current)return;
    const type=current.sourceType==='material'?'CONTEÚDO':current.sourceType==='certification'?'PROVA DE CERTIFICAÇÃO':'PROVA RELÂMPAGO';
    const scores=Array.from({length:11},(_,score)=>'<label class="learning-nps-score"><input type="radio" name="nps-score" value="'+score+'" required><span>'+score+'</span></label>').join('');
    const options=categories.map(([id,label])=>'<label class="learning-nps-option"><input type="checkbox" name="nps-category" value="'+id+'"><span>'+esc(label)+'</span></label>').join('');
    commitView('<section class="learning-nps-page"><div class="learning-nps-heading"><span class="overline">ST1 ACADEMY · SUA VOZ MELHORA O CONTEÚDO</span><p class="learning-nps-kicker">'+type+' CONCLUÍDO</p><h1>Ajude a gente a melhorar.</h1><p>Antes de continuar, conte como foi sua experiência. Sua resposta vai orientar as próximas melhorias da Academy.</p></div><article class="learning-nps-card"><div class="learning-nps-item"><span class="learning-nps-mark" aria-hidden="true">ST1</span><div><span class="overline muted">AVALIAÇÃO DE CONCLUSÃO</span><h2>'+esc(current.title)+'</h2>'+(current.context?'<p>'+esc(current.context)+'</p>':'')+'</div></div><form id="learning-nps-form" novalidate><fieldset class="learning-nps-rating"><legend>De 0 a 10, quanto você recomendaria este conteúdo ou prova para alguém do seu time?</legend><div class="learning-nps-scores">'+scores+'</div><div class="learning-nps-scale"><span>0 · Não recomendaria</span><span>10 · Recomendaria muito</span></div></fieldset><section class="learning-nps-improvements" id="learning-nps-improvements" hidden><div class="learning-nps-question"><span class="overline muted" id="learning-nps-feedback-label">SUA SUGESTÃO</span><h3 id="learning-nps-feedback-title">O que podemos melhorar?</h3><p id="learning-nps-feedback-copy">Selecione ao menos uma opção e conte o que você mudaria neste item.</p></div><fieldset class="learning-nps-categories"><legend>O que você traria de melhoria?</legend><div class="learning-nps-options">'+options+'</div></fieldset><label class="learning-nps-text-label" for="learning-nps-improvement">Descreva sua sugestão</label><textarea id="learning-nps-improvement" name="improvement" rows="4" maxlength="1200" placeholder="Conte de forma prática o que faria esse conteúdo ou prova ficar melhor."></textarea><div class="learning-nps-text-meta"><span>Escreva pelo menos 10 caracteres quando sugerir melhorias.</span><span id="learning-nps-char-count">0 / 1.200</span></div></section><p class="learning-nps-error" id="learning-nps-error" role="alert" hidden></p><div class="learning-nps-actions"><span>Suas respostas ajudam a orientar os próximos conteúdos.</span><button class="button button-primary" id="learning-nps-submit" type="submit" disabled>Enviar avaliação</button></div></form></article><p class="learning-nps-footnote">A nota e as sugestões ficam vinculadas a este item para a equipe da Academy revisar.</p></section>');
  };
  const updateFeedback=()=>{
    const score=main.querySelector('input[name="nps-score"]:checked'),section=main.querySelector('#learning-nps-improvements'),textarea=main.querySelector('#learning-nps-improvement'),title=main.querySelector('#learning-nps-feedback-title'),copy=main.querySelector('#learning-nps-feedback-copy'),label=main.querySelector('#learning-nps-feedback-label'),submit=main.querySelector('#learning-nps-submit');
    if(!section||!submit)return;
    const value=score?Number(score.value):null,required=value!==null&&value<=8,selected=[...main.querySelectorAll('input[name="nps-category"]:checked')].length>0,text=textarea?.value.trim()||'';
    section.hidden=value===null;textarea.required=required;title.textContent=required?'O que devemos melhorar?':'Tem algum ajuste que deixaria este item melhor?';copy.textContent=required?'Selecione ao menos uma opção e conte o que você mudaria neste item.':'A sugestão é opcional. Se quiser enviar uma, selecione as opções e descreva o ajuste.';label.textContent=required?'SUA SUGESTÃO':'SUGESTÃO OPCIONAL';
    submit.disabled=saving||value===null||(required&&(!selected||text.length<10))||(!required&&(selected||text)&&(!selected||text.length<10));
  };
  main.addEventListener('change',event=>{if(event.target.matches('input[name="nps-score"],input[name="nps-category"]'))updateFeedback();});
  main.addEventListener('input',event=>{if(event.target.id==='learning-nps-improvement'){const count=main.querySelector('#learning-nps-char-count');if(count)count.textContent=event.target.value.length+' / 1.200';updateFeedback();}});
  main.addEventListener('submit',async event=>{
    if(event.target.id!=='learning-nps-form')return;
    event.preventDefault();if(!current||saving)return;
    const score=main.querySelector('input[name="nps-score"]:checked'),categoriesSelected=[...main.querySelectorAll('input[name="nps-category"]:checked')].map(input=>input.value),improvement=main.querySelector('#learning-nps-improvement').value.trim(),error=main.querySelector('#learning-nps-error'),button=main.querySelector('#learning-nps-submit');
    if(!score){error.textContent='Escolha uma nota de 0 a 10 para continuar.';error.hidden=false;return;}
    if(Number(score.value)<=8&&(!categoriesSelected.length||improvement.length<10)||Number(score.value)>=9&&(categoriesSelected.length||improvement)&&(!categoriesSelected.length||improvement.length<10)){error.textContent='Selecione ao menos uma melhoria e descreva sua sugestão com pelo menos 10 caracteres.';error.hidden=false;return;}
    saving=true;button.disabled=true;button.textContent='Enviando…';error.hidden=true;
    try{await api('/api/learning-nps/'+current.id,{method:'POST',body:{score:Number(score.value),categories:categoriesSelected,improvement}});current=null;document.body.classList.remove('learning-nps-active');await onSubmitted?.();}
    catch(cause){error.textContent=cause.message;error.hidden=false;saving=false;button.textContent='Enviar avaliação';updateFeedback();}
  });
  function show(item){current=item;saving=false;document.body.classList.add('learning-nps-active');render();}
  return {show};
}
