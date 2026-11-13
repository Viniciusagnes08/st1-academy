'use strict';

// No third-party calls or storage: recovery tokens live only in memory.
const requestForm=document.querySelector('#password-recovery-request');
const resetForm=document.querySelector('#password-recovery-reset');
const errorBox=document.querySelector('#recovery-error');
const feedbackBox=document.querySelector('#recovery-feedback');
const params=new URLSearchParams(location.search);
let token=resetForm?params.get('token'):null;
const invalidLink=resetForm&&(!!params.get('error')||!token||!/^[-_a-zA-Z0-9.]+$/.test(token)||token.length>4096);
if(resetForm)history.replaceState({},'',location.pathname+location.hash);

function alertError(message){
  errorBox.textContent=message;errorBox.hidden=false;
  feedbackBox.hidden=true;
  errorBox.focus?.({preventScroll:true});
}
function notify(message,success=false){
  feedbackBox.textContent=message;feedbackBox.hidden=false;
  feedbackBox.dataset.success=success?'true':'false';
  errorBox.hidden=true;
}
async function post(path,body){
  const result=await fetch(path,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  const response=await result.json().catch(()=>({}));
  return {ok:result.ok,status:result.status,response};
}
if(invalidLink){
  token=null;
  resetForm.hidden=true;
  alertError('Este link é inválido ou expirou. Solicite um novo e-mail para redefinir sua senha.');
}
requestForm?.addEventListener('submit',async event=>{
  event.preventDefault();
  if(!requestForm.reportValidity())return;
  const button=requestForm.querySelector('button[type=submit]');
  button.disabled=true;errorBox.hidden=true;
  try{
    const email=requestForm.elements.email.value.trim();
    const r=await post('/api/password-recovery/request',{email});
    if(r.ok){
      notify('Se esse e-mail estiver cadastrado e habilitado para login por senha, você receberá instruções. Verifique também o spam.',true);
      requestForm.elements.email.value='';
    }else alertError('Não foi possível processar a solicitação. Tente novamente mais tarde.');
  }catch{alertError('Não foi possível conectar à Academy. Confira sua conexão e tente novamente.');}
  finally{button.disabled=false;}
});
resetForm?.addEventListener('submit',async event=>{
  event.preventDefault();
  if(!token)return alertError('Solicite outro link para redefinir sua senha.');
  if(!resetForm.reportValidity())return;
  const password=resetForm.elements.password.value,confirmation=resetForm.elements.confirmation.value;
  if(password!==confirmation)return alertError('As senhas informadas não são iguais.');
  if(password.length<12)return alertError('Sua nova senha precisa ter pelo menos 12 caracteres.');
  const button=resetForm.querySelector('button[type=submit]');
  button.disabled=true;errorBox.hidden=true;
  try{
    const r=await post('/api/auth/reset-password',{token,newPassword:password});
    if(r.ok){
      token=null;
      resetForm.reset();resetForm.hidden=true;
      notify('Senha redefinida com sucesso. Todas as sessões anteriores foram encerradas. Entre novamente pela tela de login.',true);
      const link=document.createElement('a');link.href='/login';link.className='button button-primary full-width recovery-login';link.textContent='Entrar na ST1 Academy';feedbackBox.after(link);
      document.querySelector('.recovery-return')?.remove();
    }else{
      alertError(r.status===400||r.status===401||r.status===403?'O link expirou, já foi utilizado ou a senha é inválida. Solicite outro link e escolha uma senha de 12 a 128 caracteres.':'Não foi possível redefinir a senha agora. Tente novamente.');
    }
  }catch{alertError('Não foi possível conectar à Academy. Confira sua conexão e tente novamente.');}
  finally{button.disabled=false;resetForm.elements.password.value='';resetForm.elements.confirmation.value='';}
});
