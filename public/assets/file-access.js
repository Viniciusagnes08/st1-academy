import {readPrivateFile} from './binary-read.js';
const status=document.querySelector('#status'),bar=document.querySelector('#progress'),link=document.querySelector('#open'),params=new URL(location.href).searchParams;
let objectURL;
addEventListener('pagehide',()=>{if(objectURL)URL.revokeObjectURL(objectURL);});
try{
  const id=params.get('conteudo');if(!id||!/^[a-z0-9][a-z0-9_-]{0,119}$/.test(id))throw new Error('Material não encontrado.');
  const response=await fetch('/api/contents/'+encodeURIComponent(id),{credentials:'same-origin'});
  if(!response.ok)throw new Error(response.status===401?'Entre na Academy para acessar este material.':'O material não está disponível para seu acesso.');
  const item=await response.json();document.title=item.title+' | ST1 Academy';document.querySelector('h1').textContent=item.title;
  const bytes=await readPrivateFile(item,{onProgress:(loaded,total)=>{bar.value=loaded/total*100;status.textContent='Carregando '+Math.round(loaded/total*100)+'%';}});
  objectURL=URL.createObjectURL(new Blob([bytes],{type:item.asset.mime}));link.href=objectURL;
  if(params.get('baixar')==='1'){link.download=item.asset.name;link.textContent='Baixar material';}else{link.target='_blank';link.rel='noopener';link.textContent='Abrir material';}
  link.hidden=false;status.textContent='Material pronto. Clique abaixo para continuar.';
}catch(error){status.textContent=error.message;bar.hidden=true;}
