import { PDFDocument, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import QRCode from 'qrcode';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { projectRoot } from './context.mjs';

const fromHex=value=>rgb(...value.replace('#','').match(/../g).map(part=>parseInt(part,16)/255));
export async function certificatePdf({id,name,track,score,issuedAt,baseURL,testMode=false,model=false}) {
  const doc=await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const fonts=await Promise.all(['regular','bold','extrabold'].map(async weight=>doc.embedFont(await readFile(resolve(projectRoot,`public/assets/fonts/poppins-${weight}.ttf`)),{subset:true})));
  const [regular,bold,extra]=fonts;
  const page=doc.addPage([841.89,595.28]);
  const black=fromHex('#111113'),ink=fromHex('#202024'),muted=fromHex('#62626a'),orange=fromHex('#f77716'),accent=fromHex(track.color),white=rgb(1,1,1);
  const issuedDate=new Date(issuedAt);
  doc.setCreationDate(issuedDate);doc.setModificationDate(issuedDate);doc.setTitle(`Certificado - ${track.name} - ${name}`);doc.setAuthor('ST1 Internet');doc.setCreator('Academia ST1');
  page.drawRectangle({x:0,y:453,width:842,height:143,color:black});
  page.drawRectangle({x:42,y:477,width:5,height:81,color:orange});
  page.drawText('ACADEMIA ST1',{x:62,y:548,size:11,font:bold,color:orange});
  page.drawText('CERTIFICADO',{x:59,y:491,size:45,font:extra,color:white});
  const logo=await doc.embedPng(await readFile(resolve(projectRoot,'public/assets/st1-logo-white.png')));
  page.drawImage(logo,{x:694,y:487,width:101,height:69});
  const fit=(text,font,size,maxWidth)=>{while(font.widthOfTextAtSize(text,size)>maxWidth&&size>12)size--;return size;};
  page.drawText(model?'MODELO DE CERTIFICADO':'CERTIFICAÇÃO COMERCIAL',{x:62,y:418,size:10,font:bold,color:muted});
  page.drawText(name,{x:59,y:365,size:fit(name,extra,31,575),font:extra,color:ink});
  page.drawRectangle({x:62,y:347,width:530,height:1,color:fromHex('#d9d9dd')});
  page.drawText(model?'Nome e resultado são preenchidos após a aprovação registrada.':'Concluiu a avaliação prática da trilha abaixo, com aprovação registrada.',{x:62,y:317,size:12,font:regular,color:muted});
  page.drawText(track.name.toUpperCase(),{x:60,y:274,size:30,font:extra,color:ink});
  page.drawText(track.badge,{x:62,y:248,size:14,font:bold,color:accent});
  page.drawText('PLANOS  /  APLICATIVOS  /  CONDUTA DE VENDA',{x:62,y:223,size:9,font:regular,color:muted});
  const badgeX=649,badgeY=302;
  page.drawSvgPath('M 0 0 L 62 -28 L 124 0 L 112 82 L 62 114 L 12 82 Z',{x:badgeX,y:badgeY,scale:1,color:black,borderColor:accent,borderWidth:3});
  page.drawSvgPath('M 0 -22 L 8 -6 L 27 0 L 8 8 L 0 27 L -8 8 L -27 0 L -8 -6 Z',{x:badgeX+62,y:badgeY-23,scale:1,color:accent});
  page.drawText('ST1',{x:badgeX+36,y:badgeY-83,size:25,font:extra,color:white});
  page.drawText('ESPECIALISTA',{x:badgeX+18,y:badgeY-105,size:7,font:bold,color:accent});
  const values=[['RESULTADO',model?'80% ou mais':`${score}% de acertos`],['REGRAS CRÍTICAS',model?'Todas corretas':'Todas corretas'],['EMISSÃO',model?'Após aprovação':issuedDate.toLocaleDateString('pt-BR',{timeZone:'America/Fortaleza'})]];
  values.forEach(([label,value],i)=>{const x=62+i*207;page.drawText(label,{x,y:169,size:8,font:bold,color:muted});page.drawText(value,{x,y:145,size:14,font:bold,color:ink});});
  page.drawRectangle({x:62,y:121,width:717,height:1,color:fromHex('#d9d9dd')});
  page.drawText('ST1 Internet  |  Desenvolvimento do time comercial',{x:62,y:95,size:10,font:bold,color:ink});
  page.drawText(model?'Modelo visual. Não representa uma aprovação nem uma certificação emitida.':`Referência: ${id}`,{x:62,y:75,size:model?9:8,font:regular,color:muted});
  if(!model){
    const qr=await doc.embedPng(await QRCode.toBuffer(`${baseURL}/verificar.html?id=${encodeURIComponent(id)}`,{width:200,margin:1,errorCorrectionLevel:'M'}));
    page.drawImage(qr,{x:711,y:34,width:70,height:70});
    page.drawText('VERIFICAR',{x:715,y:23,size:7,font:bold,color:muted});
  }
  if(testMode||model){
    page.drawRectangle({x:0,y:0,width:842,height:18,color:orange});
    page.drawText(model?'MODELO VISUAL - SEM VALIDADE DE CERTIFICAÇÃO':'TESTE INTERNO - VALIDAÇÃO NO AMBIENTE LOCAL',{x:62,y:5,size:7,font:bold,color:black});
  }
  return Buffer.from(await doc.save());
}
