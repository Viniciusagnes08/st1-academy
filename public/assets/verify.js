const target=document.querySelector('#verify-card');
const id=new URLSearchParams(location.search).get('id');
let record;
const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
async function load(){
  if(!id||!/^[a-f0-9-]{36}$/i.test(id)){target.textContent='Referência inválida. Use o QR code do certificado.';return;}
  const response=await fetch(`/api/verify/${encodeURIComponent(id)}`,{credentials:'same-origin'});
  if(!response.ok){target.textContent='Certificado não encontrado neste ambiente.';return;}
  record=await response.json();
  target.innerHTML=`<h2>${record.status==='revoked'?'Emissão revogada.':'Registro confirmado.'}</h2>${record.status==='revoked'?'<p>Este reconhecimento foi revogado pela gestão. A referência e o arquivo original permanecem no histórico.</p>':''}<p>${record.kind==='personalized'?'Reconhecimento':'Trilha'}: <strong>${esc(record.track)}</strong><br>Emitido em ${new Date(record.issuedAt).toLocaleDateString('pt-BR',{timeZone:'America/Fortaleza'})}<br>Referência: ${esc(id)}</p><label for="pdf-file">Confira também o arquivo original</label><input id="pdf-file" type="file" accept="application/pdf,.pdf"><p id="pdf-result" role="status">O PDF não é enviado ao servidor. Verificamos neste navegador se o arquivo corresponde ao original registrado.</p>`;
  document.querySelector('#pdf-file').addEventListener('change',async event=>{
    const file=event.target.files[0],result=document.querySelector('#pdf-result');if(!file)return;
    if(file.size>12*1024*1024){result.textContent='Selecione um certificado PDF de até 12 MB.';return;}
    if(!record.pdfSha256){result.textContent='O arquivo original ainda não foi gerado. Peça ao titular para baixar o certificado na Academia.';return;}
    const hash=await crypto.subtle.digest('SHA-256',await file.arrayBuffer());
    const value=[...new Uint8Array(hash)].map(byte=>byte.toString(16).padStart(2,'0')).join('');
    result.textContent=value===record.pdfSha256?(record.status==='revoked'?'O arquivo corresponde ao original, mas a emissão foi revogada.':'Arquivo autêntico: corresponde exatamente ao certificado emitido.'):'Este arquivo não corresponde ao original registrado. Peça o PDF original ao titular.';
  });
}
load().catch(()=>target.textContent='Não foi possível consultar. Abra o endereço no ambiente onde o certificado foi emitido.');
