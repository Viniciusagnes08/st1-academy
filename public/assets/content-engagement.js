export async function mountContentEngagement({api,esc,root,contentId,toast}){
  const endpoint='/api/contents/'+encodeURIComponent(contentId)+'/engagement';
  const active=()=>root.isConnected&&location.hash.startsWith('#material/'+contentId);
  const date=value=>new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'short'}).format(new Date(value));
  const render=(data,keepDraft=false)=>{
    if(!active())return;
    const draft=keepDraft?root.querySelector('textarea')?.value||'':'';
    root.innerHTML=`<div class="content-engagement-heading"><div><span class="overline muted">CONVERSA SOBRE O CONTEÚDO</span><h2>O que você achou?</h2><p>Sua reação e seus comentários ficam visíveis para quem pode acessar este material.</p></div><button type="button" class="content-save-button ${data.saved?'is-saved':''}" data-content-save aria-pressed="${data.saved}">${data.saved?'★ Salvo':'☆ Salvar'}</button></div>
      <div class="content-reactions" role="group" aria-label="Reagir ao conteúdo">${data.reactions.map(reaction=>`<button type="button" data-content-reaction="${esc(reaction.emoji)}" aria-label="${esc(reaction.label)}: ${reaction.count} reações" aria-pressed="${reaction.selected}" class="${reaction.selected?'is-selected':''}"><span aria-hidden="true">${reaction.emoji}</span><strong>${reaction.count}</strong><small>${esc(reaction.label)}</small></button>`).join('')}</div>
      <div class="content-comments"><div class="content-comments-title"><h3>Comentários <span>${data.commentCount}</span></h3><a href="#salvos">Meus salvos →</a></div><form data-content-comment><label for="content-comment-body">Compartilhe o que aprendeu ou deixe uma dúvida</label><textarea id="content-comment-body" name="body" rows="3" maxlength="1000" minlength="2" required placeholder="Escreva seu comentário...">${esc(draft)}</textarea><div><small>Até 1.000 caracteres</small><button type="submit" class="button button-primary">Publicar comentário</button></div></form><div class="content-comment-list">${data.comments.length?data.comments.map(comment=>`<article class="content-comment"><div><strong>${esc(comment.name)}</strong><time datetime="${esc(comment.createdAt)}">${date(comment.createdAt)}</time>${comment.canDelete?`<button type="button" data-delete-content-comment="${esc(comment.id)}" aria-label="Excluir comentário de ${esc(comment.name)}">Excluir</button>`:''}</div><p>${esc(comment.body)}</p></article>`).join(''):'<p class="content-comment-empty">Ainda não há comentários. Comece a conversa.</p>'}${data.commentCount>data.comments.length?'<p class="content-comment-empty">Exibindo os 50 comentários mais recentes.</p>':''}</div></div>`;
  };
  root.addEventListener('click',async event=>{
    const reaction=event.target.closest('[data-content-reaction]'),save=event.target.closest('[data-content-save]'),remove=event.target.closest('[data-delete-content-comment]');
    const button=reaction||save||remove;if(!button)return;
    button.disabled=true;
    try{
      const data=reaction?await api(endpoint+'/reaction',{method:'PUT',body:{emoji:reaction.dataset.contentReaction}}):save?await api(endpoint+'/saved',{method:'PUT',body:{saved:save.getAttribute('aria-pressed')!=='true'}}):await api(endpoint+'/comments/'+encodeURIComponent(remove.dataset.deleteContentComment),{method:'DELETE',body:{}});
      render(data,true);if(save)toast(data.saved?'Conteúdo salvo em Meus salvos.':'Conteúdo removido dos salvos.');if(remove)toast('Comentário excluído.');
    }catch(error){toast(error.message);if(button.isConnected)button.disabled=false;}
  });
  root.addEventListener('submit',async event=>{
    if(!event.target.matches('[data-content-comment]'))return;
    event.preventDefault();const form=event.target,button=form.querySelector('button[type="submit"]');button.disabled=true;
    try{const data=await api(endpoint+'/comments',{method:'POST',body:{body:form.elements.body.value}});render(data);toast('Comentário publicado.');}
    catch(error){toast(error.message);if(button.isConnected)button.disabled=false;}
  });
  try{render(await api(endpoint));}catch(error){if(active())root.innerHTML=`<p class="content-comment-empty">Não foi possível carregar as interações. ${esc(error.message)}</p>`;}
}
