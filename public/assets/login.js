import {invitationTokenFromInput,rememberedLogin,verifySignedInMember} from './login-flow.js';
import {initLoginMotion} from './login-motion.js?v=2.3.3';

const panel=document.querySelector('#entry-content'),params=new URLSearchParams(location.search);
const state={mode:params.has('convite')||params.get('modo')==='cadastro'?'register':'login',invite:null,token:params.get('convite'),user:null,notice:'',pending:false,googleEnabled:false,unavailable:false};
const preferenceKey='st1-academy.remembered-login';
const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const arrow='<svg viewBox="0 0 24 24" class="icon" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';
let preference=null;try{preference=rememberedLogin(localStorage.getItem(preferenceKey));}catch{}
function unavailableError(status){
  state.unavailable=true;
  const local=['localhost','127.0.0.1','[::1]'].includes(location.hostname);
  const error=new Error(local?'A Academy local está indisponível. Abra “Abrir ST1 Academy.cmd” neste computador e tente novamente. Seu login e seu progresso continuam salvos.':'A Academy está temporariamente indisponível. Confira sua conexão e tente novamente. Seu login e seu progresso continuam salvos.');
  error.unavailable=true;if(status)error.status=status;return error;
}
async function api(path,{body,headers={}}={}){
  let response;try{response=await fetch(path,{method:body?'POST':'GET',headers:{...(body?{'Content-Type':'application/json'}:{}),...headers},...(body?{body:JSON.stringify(body)}:{}),credentials:'same-origin'});}catch{throw unavailableError();}
  if(response.status>=500)throw unavailableError(response.status);
  let data;try{data=await response.json();}catch{throw unavailableError();}
  if(!response.ok){const error=new Error(path.includes('/sign-in/')&&response.status===401?'E-mail ou senha incorretos. Confira e tente novamente.':data.message||'Não foi possível concluir. Tente novamente.');error.status=response.status;throw error;}return data;
}
function passwordField(id,label,confirm=false){return `<label for="${id}">${label}</label><div class="entry-password"><input id="${id}" name="${confirm?'confirmation':'password'}" type="password" autocomplete="${state.mode==='register'?'new-password':'current-password'}" required minlength="10" maxlength="128" ${state.mode==='register'?'aria-describedby="password-requirements"':''}><button type="button" data-password-toggle="${id}" aria-label="Mostrar ${confirm?'confirmação da senha':'senha'}" aria-pressed="false">Mostrar</button></div>`;}
function rememberField(){return `<label class="entry-remember"><input type="checkbox" name="remember" ${preference?.remember?'checked':''}><span><strong>Salvar meu login neste dispositivo</strong></span></label>`;}
function errorMarkup(){return '<p class="entry-error" id="entry-error" role="alert" tabindex="-1" hidden></p>';}
function googleButton(){
  return '<div class="entry-google-access"><div class="entry-divider"><span>ou</span></div><button class="entry-google-button" type="button" data-google-login '+(state.googleEnabled&&!state.unavailable?'':'disabled')+'><span aria-hidden="true">G</span> '+(state.mode==='register'?'Criar conta com Google':'Entrar com Google')+'</button><p>'+(state.unavailable?'O acesso Google volta quando a conexão com a Academy for restabelecida.':state.googleEnabled?'Use qualquer conta Google com e-mail verificado.':'Conexão Google em configuração.')+'</p></div>';
}
function render(){
  document.title=`${state.mode==='login'?'Entrar':'Criar conta'} | ST1 Academy`;
  document.body.dataset.entryMode=state.mode;
  document.querySelectorAll('[data-entry-mode]').forEach(tab=>{const selected=tab.dataset.entryMode===state.mode;tab.setAttribute('aria-selected',String(selected));tab.tabIndex=selected?0:-1;});
  panel.setAttribute('aria-labelledby',state.mode==='login'?'login-tab':'register-tab');
  const notice=state.notice?`<div class="entry-notice" role="status"><p>${esc(state.notice)}</p>${state.unavailable?'<button class="button button-secondary" type="button" data-retry-connection>Tentar novamente</button>':''}</div>`:'';
  if(state.mode==='login'){
    panel.innerHTML=`<div class="entry-pane"><h2>${state.user?'Seu acesso.':'Entre na Academy.'}</h2><p class="entry-description">Seu próximo nível começa aqui.</p>${notice}${state.user?`<div class="entry-session"><span class="entry-session-dot"></span><div><strong>Você já está conectado.</strong><p>${esc(state.user.name)}</p></div><a class="button button-primary full-width entry-submit" href="/#inicio">Continuar na Academy ${arrow}</a><button type="button" class="entry-text-button" data-other-account>Entrar com outra conta</button></div>`:`<form id="entry-login-form" class="entry-form"><label for="login-email">Seu e-mail</label><input id="login-email" name="email" type="email" autocomplete="username" inputmode="email" placeholder="nome@st1.net.br" required maxlength="254" value="${esc(preference?.email||state.invite?.email||'')}">${passwordField('login-password','Sua senha')}<button class="entry-forgot" type="button" data-open-help>Esqueci minha senha</button>${rememberField()}${errorMarkup()}<button class="button button-primary full-width entry-submit" type="submit">Entrar na ST1 Academy ${arrow}</button></form>`}</div>`;
  }else if(state.invite){
    const role={seller:'Vendedor',supervisor:'Supervisor',admin:'Admin'}[state.invite.role]||'Participante';
    panel.innerHTML=`<div class="entry-pane"><h2>Ative sua conta.</h2><p class="entry-description">Defina sua senha para começar.</p><div class="entry-invite-status"><span class="entry-invite-check" aria-hidden="true">✓</span><span>Convite pessoal válido</span><strong>${role}</strong></div><form id="entry-register-form" class="entry-form"><div class="entry-identity"><div><label for="register-name">Seu nome</label><input id="register-name" readonly autocomplete="name" value="${esc(state.invite.name)}"></div><div><label for="register-email">Seu e-mail</label><input id="register-email" name="email" readonly autocomplete="username" value="${esc(state.invite.email)}"></div></div>${passwordField('register-password','Crie sua senha')}${passwordField('register-confirmation','Confirme sua senha',true)}<ul class="entry-password-requirements" id="password-requirements"><li id="require-length">Pelo menos 10 caracteres</li><li id="require-match">As duas senhas devem ser iguais</li></ul>${rememberField()}${errorMarkup()}<button class="button button-primary full-width entry-submit" type="submit" disabled>Ativar minha conta ${arrow}</button></form></div>`;
  }else{
    panel.innerHTML=`<div class="entry-pane"><h2>Crie sua conta.</h2><p class="entry-description">Use o convite enviado pelo Admin.</p>${notice}<form id="entry-invite-form" class="entry-form"><label for="invitation-link">Link do seu convite</label><input id="invitation-link" name="invitation" type="text" inputmode="url" autocomplete="off" placeholder="Cole aqui seu convite pessoal" required maxlength="1200">${errorMarkup()}<button class="button button-primary full-width entry-submit" type="submit">Continuar com meu convite ${arrow}</button></form><div class="entry-no-invite"><p>Ainda não recebeu? Peça seu convite ao Admin.</p></div></div>`;
  }
  if(state.mode==='register'&&state.invite&&notice)panel.querySelector('.entry-description').insertAdjacentHTML('afterend',notice);
  if(!state.user)panel.querySelector('.entry-pane').insertAdjacentHTML('beforeend',googleButton());
}
function showError(message){const box=document.querySelector('#entry-error');if(box){box.textContent=message;if(state.unavailable){const retry=document.createElement('button');retry.type='button';retry.className='button button-secondary';retry.dataset.retryConnection='';retry.textContent='Tentar novamente';box.append(document.createElement('br'),retry);}box.hidden=false;box.focus({preventScroll:true});}}
function persistPreference(email,remember){try{if(remember)localStorage.setItem(preferenceKey,JSON.stringify({email,remember:true}));else localStorage.removeItem(preferenceKey);}catch{}}
function openHelp(){const help=document.querySelector('#entry-help');help.open=true;help.scrollIntoView({block:'nearest',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});}
async function loadInvitation(token){
  try{state.invite=await api(`/api/invitation/${encodeURIComponent(token)}`);state.token=token;state.notice='';state.mode='register';const url=new URL(location.href);url.searchParams.set('convite',token);history.replaceState({},'',url.pathname+url.search+url.hash);render();}
  catch(error){if(!error.unavailable){state.invite=null;state.token=null;}state.notice=error.status===404?'Este convite já foi utilizado, venceu ou foi revogado. Se já criou sua conta, use Entrar. Caso contrário, peça um novo convite ao Admin.':error.message;render();}
}
document.querySelector('.entry-tabs').addEventListener('click',event=>{const tab=event.target.closest('[data-entry-mode]');if(!tab||state.pending)return;state.mode=tab.dataset.entryMode;render();});
document.querySelector('.entry-tabs').addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)||state.pending)return;event.preventDefault();const target=event.key==='Home'?'login':event.key==='End'?'register':state.mode==='login'?'register':'login';state.mode=target;render();document.querySelector(`[data-entry-mode="${target}"]`).focus();});
panel.addEventListener('click',async event=>{
  const retry=event.target.closest('[data-retry-connection]');if(retry&&!state.pending){retry.disabled=true;await init();if(retry.isConnected)retry.disabled=false;return;}
  const google=event.target.closest('[data-google-login]');
  if(google&&!google.disabled){
    google.disabled=true;
    try{
      const form=panel.querySelector('#entry-login-form,#entry-register-form'),remember=!!form?.elements.remember?.checked;
      const value=await api('/api/auth/sign-in/social',{body:{provider:'google',callbackURL:location.origin+'/google/connected'},headers:{'x-academy-remember':remember?'1':'0',...(state.mode==='register'&&state.token?{'x-academy-invite':state.token}:{})}});
      if(!value.url?.startsWith('https://accounts.google.com/'))throw new Error('O Google não confirmou o endereço de acesso.');
      location.assign(value.url);
    }catch(error){state.notice=error.message;render();}
    return;
  }
  const toggle=event.target.closest('[data-password-toggle]');if(toggle){const field=document.querySelector('#'+toggle.dataset.passwordToggle),show=field.type==='password';field.type=show?'text':'password';toggle.textContent=show?'Ocultar':'Mostrar';toggle.setAttribute('aria-pressed',String(show));toggle.setAttribute('aria-label',(show?'Ocultar':'Mostrar')+(field.name==='confirmation'?' confirmação da senha':' senha'));return;}
  if(event.target.closest('[data-open-help]'))return openHelp();
  if(event.target.closest('[data-other-account]')){try{await api('/api/auth/sign-out',{body:{}});state.user=null;render();}catch(error){state.notice=error.message;render();}}
});
panel.addEventListener('input',event=>{
  if(!['register-password','register-confirmation'].includes(event.target.id))return;
  const password=document.querySelector('#register-password').value,confirmation=document.querySelector('#register-confirmation').value;
  document.querySelector('#require-length').classList.toggle('met',password.length>=10);document.querySelector('#require-match').classList.toggle('met',confirmation.length>0&&password===confirmation);
  document.querySelector('#entry-register-form [type=submit]').disabled=state.pending||password.length<10||password!==confirmation;
});
panel.addEventListener('submit',async event=>{
  event.preventDefault();if(state.pending)return;const form=event.target,button=form.querySelector('[type=submit]'),errorBox=document.querySelector('#entry-error');if(errorBox)errorBox.hidden=true;state.pending=true;button.disabled=true;button.classList.add('is-loading');button.setAttribute('aria-busy','true');
  try{
    if(form.id==='entry-invite-form'){
      const token=invitationTokenFromInput(form.elements.invitation.value,location.origin);if(!token)throw new Error('Cole o link pessoal da ST1 Academy que você recebeu do Admin.');await loadInvitation(token);return;
    }
    const signup=form.id==='entry-register-form';
    if(signup&&form.elements.password.value!==form.elements.confirmation.value)throw new Error('As senhas precisam ser iguais. Confira a confirmação.');
    const body={email:form.elements.email.value.trim(),password:form.elements.password.value,rememberMe:form.elements.remember.checked};
    if(signup){body.name=state.invite.name;}
    await api(signup?'/api/auth/sign-up/email':'/api/auth/sign-in/email',{body,headers:signup?{'x-academy-invite':state.token}:{}});
    await verifySignedInMember(api);
    persistPreference(body.email,body.rememberMe);form.elements.password.value='';if(form.elements.confirmation)form.elements.confirmation.value='';location.replace(signup?'/#perfil/editar/boas-vindas':'/#inicio');
  }catch(error){showError(error.message);}finally{state.pending=false;if(button.isConnected){button.disabled=false;button.classList.remove('is-loading');button.removeAttribute('aria-busy');}}
});
async function init(){
  if(state.unavailable)state.notice='';state.unavailable=false;
  const [catalog,profile,settings]=await Promise.allSettled([api('/api/catalog'),api('/api/me'),api('/api/auth-settings')]);
  if(settings.status==='fulfilled')state.googleEnabled=settings.value.googleEnabled;
  if(params.get('google')==='error')state.notice='O acesso Google não foi concluído. Use uma conta Google com e-mail verificado ou entre com e-mail e senha.';
  if(profile.status==='fulfilled')state.user=profile.value;else if([401,403].includes(profile.reason.status)){state.user=null;if(profile.reason.status===403)state.notice=profile.reason.message;}
  if(state.unavailable){state.notice=[catalog,profile,settings].find(result=>result.status==='rejected'&&result.reason.unavailable)?.reason.message||unavailableError().message;render();return;}
  if(state.token){const token=invitationTokenFromInput(state.token,location.origin);if(token)await loadInvitation(token);else{state.token=null;state.notice='Este convite não é válido. Peça um novo link ao Admin.';render();}}else render();
}
initLoginMotion();
init();
