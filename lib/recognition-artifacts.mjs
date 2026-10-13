import {PDFDocument,rgb} from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import QRCode from 'qrcode';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';

import {badgeSvg,shapes,symbols,colors} from '../public/assets/badge-art.js';
export {badgeSvg};

export async function recognitionPdf({id,name,model,artModel,issuedAt,baseURL,testMode=false}){
  const doc=await PDFDocument.create();doc.registerFontkit(fontkit);
  const fonts=await Promise.all(['regular','bold','extrabold'].map(async weight=>doc.embedFont(await readFile(fileURLToPath(new URL('../public/assets/fonts/poppins-'+weight+'.ttf',import.meta.url))),{subset:true})));
  const [regular,bold,extra]=fonts,page=doc.addPage([841.89,595.28]);
  const hex=v=>rgb(...colors(v).slice(1).match(/../g).map(p=>parseInt(p,16)/255)),ink=hex('#161619'),muted=hex('#696972'),accent=hex(model.color),white=rgb(1,1,1);
  doc.setTitle('Certificado - '+model.title+' - '+name);doc.setAuthor('ST1 Internet');doc.setCreator('ST1 Academy');doc.setCreationDate(new Date(issuedAt));doc.setModificationDate(new Date(issuedAt));doc.setSubject('Reconhecimento registrado pela ST1 Academy. Referência '+id);
  const inline=value=>String(value).replace(/\s+/g,' ').trim();
  const text=(value,x,y,size,font=regular,color=ink)=>page.drawText(inline(value),{x,y,size,font,color});
  const fit=(value,font,size,width,min=6)=>{value=inline(value);while(font.widthOfTextAtSize(value,size)>width&&size>min)size-=.5;return size;};
  // Split oversized words as well as normal prose; every accepted field remains
  // inside its reserved area, including a name or title without spaces.
  const lines=(value,font,size,width)=>{
    const result=[];let line='';
    for(const word of String(value).trim().split(/\s+/).filter(Boolean)){
      if(line&&font.widthOfTextAtSize(line+' '+word,size)<=width){line+=' '+word;continue;}
      if(line){result.push(line);line='';}
      for(const character of word){if(line&&font.widthOfTextAtSize(line+character,size)>width){result.push(line);line='';}line+=character;}
    }
    if(line)result.push(line);return result;
  };
  const block=(value,font,size,width,maxLines,min)=>{let result=lines(value,font,size,width);while(result.length>maxLines&&size>min){size-=.5;result=lines(value,font,size,width);}return {size,lines:result};};
  const nameBlock=block(name,extra,31,580,2,12),titleBlock=block(model.title,extra,29,570,2,10),descriptionBlock=block(model.description,regular,10,725,5,6);
  page.drawRectangle({x:0,y:453,width:842,height:143,color:ink});page.drawRectangle({x:40,y:479,width:5,height:77,color:accent});
  text('ST1 ACADEMY',62,548,11,bold,accent);text('CERTIFICADO',59,493,43,extra,white);
  const logo=await doc.embedPng(await readFile(fileURLToPath(new URL('../public/assets/st1-logo-white.png',import.meta.url))));page.drawImage(logo,{x:695,y:490,width:101,height:69});
  text('CONHECIMENTO QUE VIRA RESULTADO',62,419,9,bold,muted);
  nameBlock.lines.forEach((line,i)=>text(line,60,385-i*(nameBlock.size+3),nameBlock.size,extra));
  page.drawRectangle({x:62,y:337,width:580,height:1,color:hex('#dedee2')});
  const statement=model.rule==='track_certified'?'Conquistou a certificação da trilha vinculada a este reconhecimento.':model.rule==='event_validated'?'Teve sua participação ou entrega validada pela gestão.':'Recebeu este reconhecimento registrado pela gestão da ST1 Academy.';
  lines(statement,regular,11,580).forEach((line,i)=>text(line,62,315-i*14,11,regular,muted));
  titleBlock.lines.forEach((line,i)=>text(line,60,273-i*(titleBlock.size+3),titleBlock.size,extra));
  descriptionBlock.lines.forEach((line,i)=>text(line,62,214-i*12,descriptionBlock.size,regular,muted));
  const badgeColor=hex(artModel.color);page.drawSvgPath(shapes[artModel.shape]||shapes.shield,{x:655,y:357,scale:.8,color:ink,borderColor:badgeColor,borderWidth:2});page.drawSvgPath(symbols[artModel.symbol]||symbols.star,{x:655,y:357,scale:.8,color:badgeColor,borderColor:badgeColor,borderWidth:1});text('ST1',710,249,16,extra,white);
  text('EMISSÃO',62,140,8,bold,muted);text(new Date(issuedAt).toLocaleDateString('pt-BR',{timeZone:'America/Fortaleza'}),62,119,13,bold);
  text('CARGA HORÁRIA',255,140,8,bold,muted);text(model.hours?model.hours.toLocaleString('pt-BR')+' '+(model.hours===1?'hora':'horas'):'Não informada',255,119,13,bold);
  text('VALIDAÇÃO',460,140,8,bold,muted);text(model.rule==='manual'?'Registro da gestão':'Evidência conferida',460,119,13,bold);
  page.drawRectangle({x:62,y:102,width:590,height:1,color:hex('#dedee2')});
  text(model.signature||'ST1 Academy',62,82,fit(model.signature||'ST1 Academy',bold,11,575),bold);
  text(model.signatureRole||'Desenvolvimento do time',62,65,fit(model.signatureRole||'Desenvolvimento do time',regular,9,575),regular,muted);
  text('Referência: '+id,62,44,8,regular,muted);
  const qr=await doc.embedPng(await QRCode.toBuffer(baseURL+'/verificar.html?id='+encodeURIComponent(id),{width:220,margin:1,errorCorrectionLevel:'M'}));page.drawImage(qr,{x:710,y:50,width:76,height:76});text('VERIFICAR',719,37,7,bold,muted);
  if(testMode){page.drawRectangle({x:0,y:0,width:842,height:18,color:accent});text('TESTE INTERNO - VALIDAÇÃO NO AMBIENTE LOCAL',62,5,7,bold,ink);}
  return Buffer.from(await doc.save());
}
