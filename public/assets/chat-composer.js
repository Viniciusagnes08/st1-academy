import {binaryFetch} from './binary-upload.js?v=2.7.0';
export function mountChatComposer({element,squadId,api,esc,icon,toast,onSent}){
  let pending=null,recorder=null,stream=null,ticker=null,chunks=[],started=0,asking=false,sending=false,disposed=false,discard=false,generation=0;
  const emojiOptions=[['😀','sorriso'],['👏','aplausos'],['🎉','comemoração'],['⭐','estrela'],['🔥','energia'],['💪','força'],['🚀','avanço'],['🏆','conquista'],['❤️','coração'],['👍','positivo'],['🙌','celebração'],['✅','concluído'],['🤝','parceria'],['📚','estudo'],['💡','ideia'],['🎯','objetivo']];
  element.innerHTML=`<div class="chat-composer-preview" data-chat-preview hidden></div><div class="chat-record-status" data-chat-record-status role="status" hidden></div><label class="sr-only" for="squad-message">Mensagem para o squad</label><textarea id="squad-message" name="message" rows="2" maxlength="1200" placeholder="Compartilhe uma dúvida, uma dica ou uma conquista..."></textarea><div class="chat-composer-bottom"><div class="chat-tools"><button type="button" data-chat-photo aria-label="Anexar foto">${icon('camera')}</button><button type="button" data-chat-emoji-toggle aria-label="Escolher emoji" aria-expanded="false">${icon('smile')}</button><button type="button" data-chat-record aria-label="Gravar áudio">${icon('mic')}</button><button type="button" data-chat-audio aria-label="Anexar arquivo de áudio">${icon('volume')}</button></div><span class="chat-composer-hint">Seu time evolui com a sua participação.</span><button class="button button-primary chat-send" type="submit" aria-label="Enviar mensagem ao squad" disabled>${icon('arrow')}</button></div><div class="chat-emoji-picker" data-chat-emojis role="group" aria-label="Emojis para a mensagem" hidden>${emojiOptions.map(([value,name])=>`<button type="button" data-chat-emoji="${value}" aria-label="Adicionar emoji ${name}">${value}</button>`).join('')}</div><input type="file" data-chat-image-input class="sr-only" aria-label="Escolher foto para o squad" accept="image/jpeg,image/png,image/webp"><input type="file" data-chat-audio-input class="sr-only" aria-label="Escolher áudio para o squad" accept="audio/webm,audio/ogg,audio/mp4,audio/mpeg,audio/wav,audio/x-wav,.m4a"><p class="form-error chat-composer-error" data-chat-error role="alert" hidden></p>`;
  const field=element.elements.message,send=element.querySelector('[type=submit]'),photoInput=element.querySelector('[data-chat-image-input]'),audioInput=element.querySelector('[data-chat-audio-input]'),preview=element.querySelector('[data-chat-preview]'),status=element.querySelector('[data-chat-record-status]'),error=element.querySelector('[data-chat-error]'),recordButton=element.querySelector('[data-chat-record]'),picker=element.querySelector('[data-chat-emojis]'),emojiButton=element.querySelector('[data-chat-emoji-toggle]');
  const active=()=>!disposed&&element.isConnected;
  const tell=message=>{if(active()){error.textContent=message;error.hidden=false;}};
  const update=()=>{if(!active())return;send.disabled=sending||asking||recorder?.state==='recording'||!field.value.trim()&&!pending;for(const button of element.querySelectorAll('.chat-tools button'))button.disabled=sending||asking;field.disabled=sending;};
  const releaseStream=()=>{stream?.getTracks().forEach(track=>track.stop());stream=null;clearInterval(ticker);ticker=null;};
  const clearPending=()=>{if(pending?.url)URL.revokeObjectURL(pending.url);pending=null;photoInput.value='';audioInput.value='';preview.hidden=true;preview.innerHTML='';update();};
  const choose=(file,kind,duration=0)=>{
    clearPending();pending={file,kind,duration,url:URL.createObjectURL(file)};
    preview.innerHTML=(kind==='image'?`<img src="${pending.url}" alt="Prévia da foto escolhida">`:`<audio controls preload="metadata" src="${pending.url}" aria-label="Ouvir áudio antes de enviar"></audio>`)+`<div><strong>${kind==='image'?'Foto pronta para enviar':'Áudio pronto para enviar'}</strong><span>${esc(file.name)}</span></div><button type="button" data-chat-remove aria-label="Remover anexo">${icon('close')}</button>`;
    preview.hidden=false;status.hidden=true;error.hidden=true;recordButton.setAttribute('aria-label','Gravar áudio');recordButton.innerHTML=icon('mic');update();
  };
  const recordingStatus=()=>{if(!active())return;const elapsed=Math.min(120,Math.floor((Date.now()-started)/1000));status.innerHTML=`<span class="chat-record-dot" aria-hidden="true"></span><strong>Gravando ${String(Math.floor(elapsed/60)).padStart(2,'0')}:${String(elapsed%60).padStart(2,'0')}</strong><span>Até 2 minutos</span><button type="button" data-chat-cancel-record>Cancelar</button>`;status.hidden=false;if(elapsed>=120&&recorder?.state==='recording')recorder.stop();};
  async function record(){
    if(sending||asking)return;
    if(recorder?.state==='recording'){recorder.stop();recordButton.disabled=true;return;}
    if(!navigator.mediaDevices?.getUserMedia||!globalThis.MediaRecorder){tell('Este navegador não oferece gravação. Você pode anexar um arquivo de áudio.');return;}
    const token=++generation;asking=true;error.hidden=true;update();status.textContent='Autorize o microfone para começar a gravação.';status.hidden=false;
    try{
      const acquired=await navigator.mediaDevices.getUserMedia({audio:true});
      if(!active()||token!==generation){acquired.getTracks().forEach(t=>t.stop());return;}
      stream=acquired;const mime=['audio/webm;codecs=opus','audio/mp4','audio/ogg;codecs=opus'].find(type=>MediaRecorder.isTypeSupported(type));
      if(!mime)throw new Error('Este navegador não oferece um formato de gravação compatível. Anexe um arquivo de áudio.');
      recorder=new MediaRecorder(stream,{mimeType:mime});chunks=[];discard=false;started=Date.now();
      const recording=recorder;
      recording.ondataavailable=event=>{if(event.data.size)chunks.push(event.data);if(chunks.reduce((n,c)=>n+c.size,0)>8*1024*1024){discard=true;if(recording.state==='recording')recording.stop();tell('O áudio atingiu 8 MB. Grave uma mensagem mais curta.');}};
      recording.onerror=()=>{discard=true;releaseStream();tell('Não foi possível concluir a gravação. Tente novamente ou anexe o áudio.');};
      recording.onstop=()=>{
        const duration=Math.min(120,(Date.now()-started)/1000),saved=chunks;releaseStream();recorder=null;chunks=[];
        if(!active()||discard||token!==generation){if(active()){status.hidden=true;recordButton.innerHTML=icon('mic');recordButton.setAttribute('aria-label','Gravar áudio');update();}return;}
        const blob=new Blob(saved,{type:mime}),ext=mime.includes('mp4')?'m4a':mime.includes('ogg')?'ogg':'webm';
        if(blob.size<32){status.hidden=true;tell('O áudio ficou vazio. Grave novamente.');update();return;}
        choose(new File([blob],'Audio-ST1-'+Date.now()+'.'+ext,{type:mime}),'audio',duration);
      };
      recorder.start(1000);asking=false;recordingStatus();ticker=setInterval(recordingStatus,1000);recordButton.innerHTML=icon('stop');recordButton.setAttribute('aria-label','Parar gravação');update();
    }catch(problem){releaseStream();recorder=null;status.hidden=true;tell(problem.name==='NotAllowedError'?'Permita o microfone no navegador para gravar. Você também pode anexar um áudio.':problem.name==='NotFoundError'?'Nenhum microfone disponível. Você pode anexar um áudio.':problem.message||'Não foi possível iniciar o microfone.');}
    finally{asking=false;update();}
  }
  function cancelRecording(){discard=true;generation++;if(recorder?.state==='recording')recorder.stop();releaseStream();recorder=null;chunks=[];status.hidden=true;recordButton.innerHTML=icon('mic');recordButton.setAttribute('aria-label','Gravar áudio');update();}
  element.addEventListener('input',()=>{error.hidden=true;update();});
  element.addEventListener('change',event=>{if(![photoInput,audioInput].includes(event.target))return;const file=event.target.files?.[0];if(!file)return;const kind=event.target===photoInput?'image':'audio';if(file.size>(kind==='image'?5:8)*1024*1024){tell(kind==='image'?'Escolha uma foto de até 5 MB.':'Escolha um áudio de até 8 MB.');event.target.value='';return;}if(kind==='image'&&!['image/jpeg','image/png','image/webp'].includes(file.type)){tell('Escolha uma foto JPG, PNG ou WebP.');return;}choose(file,kind);});
  element.addEventListener('click',event=>{
    if(event.target.closest('[data-chat-photo]'))photoInput.click();
    if(event.target.closest('[data-chat-audio]'))audioInput.click();
    if(event.target.closest('[data-chat-record]'))record();
    if(event.target.closest('[data-chat-cancel-record]'))cancelRecording();
    if(event.target.closest('[data-chat-remove]')){clearPending();field.focus();}
    if(event.target.closest('[data-chat-emoji-toggle]')){picker.hidden=!picker.hidden;emojiButton.setAttribute('aria-expanded',String(!picker.hidden));}
    const emoji=event.target.closest('[data-chat-emoji]');if(emoji){const value=emoji.dataset.chatEmoji;if(field.value.length+value.length<=1200)field.setRangeText(value,field.selectionStart,field.selectionEnd,'end');picker.hidden=true;emojiButton.setAttribute('aria-expanded','false');field.focus();update();}
  });
  element.addEventListener('keydown',event=>{if(event.key==='Escape'){picker.hidden=true;emojiButton.setAttribute('aria-expanded','false');}if(event.target===field&&event.key==='Enter'&&!event.shiftKey&&!event.isComposing){event.preventDefault();if(!send.disabled)element.requestSubmit();}});
  element.addEventListener('submit',async event=>{
    event.preventDefault();event.stopPropagation();if(sending||asking||recorder?.state==='recording')return;
    const body=field.value.trim();if(!body&&!pending)return;
    sending=true;error.hidden=true;update();send.innerHTML=icon('clock');
    try{
      if(pending){const payload=new FormData();payload.set('file',pending.file);payload.set('kind',pending.kind);payload.set('duration',String(pending.duration));payload.set('body',body);const response=await binaryFetch('/api/squads/'+squadId+'/messages/media',{method:'POST',credentials:'same-origin',body:payload});const value=await response.json();if(!response.ok)throw new Error(value.message||'Não foi possível enviar o arquivo.');}
      else await api('/api/squads/'+squadId+'/messages',{method:'POST',body:{body}});
      if(active()){field.value='';clearPending();await onSent();field.focus();}
    }catch(problem){tell(problem.message||'Não foi possível enviar. Sua mensagem continua aqui para tentar novamente.');}
    finally{sending=false;if(active()){send.innerHTML=icon('arrow');update();}}
  });
  const onVisibility=()=>{if(document.hidden&&(recorder||asking))cancelRecording();};document.addEventListener('visibilitychange',onVisibility);
  update();
  return ()=>{disposed=true;generation++;discard=true;if(recorder?.state==='recording')recorder.stop();releaseStream();if(pending?.url)URL.revokeObjectURL(pending.url);document.removeEventListener('visibilitychange',onVisibility);};
}
