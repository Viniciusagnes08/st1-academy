import {createHash} from 'node:crypto';
import {mkdirSync,readFileSync,writeFileSync,unlinkSync} from 'node:fs';
import {resolve,dirname,basename} from 'node:path';
import {fileURLToPath} from 'node:url';
import {PDFDocument,rgb} from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import {biModules,biQuizzes,biContents} from '../content/bi-course.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const sourceDir=process.argv[2];
if(!sourceDir)throw new Error('Informe a pasta com os PDFs originais.');
const filesDir=resolve(root,'content/library/files');
const manifestPath=resolve(root,'content/library/manifest.json');
const legacy=JSON.parse(readFileSync(resolve(root,'content/library/bi-legacy-manifest.json'),'utf8'));
const manifest=JSON.parse(readFileSync(manifestPath,'utf8'));
const biItems=manifest.filter(item=>item.id.startsWith('st1-bi-'));
const legacyItems=legacy.contents;
const courseModuleById=new Map(biModules.map(item=>[item.id,item]));
const moduleById=new Map(biItems.filter(item=>/^st1-bi-m\d{2}$/.test(item.id)).map(item=>[item.id,item]));
const courseContents=biItems.filter(item=>/^st1-bi-m\d{2}-(?:a\d{2}|lab)$/.test(item.id));

const navy=rgb(17/255,17/255,50/255),orange=rgb(247/255,119/255,22/255),white=rgb(1,1,1);
const muted=rgb(196/255,200/255,219/255),soft=rgb(226/255,229/255,242/255),footerBlue=rgb(52/255,59/255,153/255);
const fontPaths={
  regular:resolve(root,'public/assets/fonts/poppins-regular.ttf'),
  medium:resolve(root,'public/assets/fonts/poppins-medium.ttf'),
  bold:resolve(root,'public/assets/fonts/poppins-bold.ttf'),
  extra:resolve(root,'public/assets/fonts/poppins-extrabold.ttf')
};
const fontBytes=Object.fromEntries(Object.entries(fontPaths).map(([key,path])=>[key,readFileSync(path)]));
const logoBytes=readFileSync(resolve(root,'public/assets/st1-logo-white.png'));
const artBytes=readFileSync(resolve(root,'content/library/covers/bi-dashboard.jpg'));
const imageHash=bytes=>createHash('sha256').update(bytes).digest('hex');
const wrap=(text,font,size,width)=>{
  const lines=[];let line='';
  for(const word of String(text||'').split(/\s+/).filter(Boolean)){
    const next=line?`${line} ${word}`:word;
    if(line&&font.widthOfTextAtSize(next,size)>width){lines.push(line);line=word;}else line=next;
  }
  if(line)lines.push(line);return lines;
};
const drawLines=(page,lines,x,y,font,size,color,lineHeight)=>{
  for(const line of lines){page.drawText(line,{x,y,font,size,color});y-=lineHeight;}
  return y;
};
const drawBrandHeader=(page,fonts,logo,pageWidth,pageHeight)=>{
  const logoDims=logo.scale(0.12);
  page.drawImage(logo,{x:42,y:pageHeight-98,width:logoDims.width,height:logoDims.height});
  page.drawText('ST1 ACADEMY',{x:pageWidth-151,y:pageHeight-64,font:fonts.bold,size:10,color:white});
  page.drawText('FORMAÇÃO EM DADOS',{x:pageWidth-151,y:pageHeight-81,font:fonts.regular,size:7.5,color:muted});
  page.drawLine({start:{x:42,y:pageHeight-117},end:{x:pageWidth-42,y:pageHeight-117},thickness:0.7,color:rgb(58/255,59/255,96/255)});
};
const drawFooter=(page,fonts,pageWidth,pageNumber='01')=>{
  page.drawLine({start:{x:42,y:42},end:{x:pageWidth-42,y:42},thickness:0.5,color:rgb(58/255,59/255,96/255)});
  page.drawText('Uso interno · Formação em dados',{x:42,y:24,font:fonts.regular,size:7,color:muted});
  page.drawText(pageNumber,{x:pageWidth-61,y:22,font:fonts.bold,size:8,color:orange});
};
const drawCover=async(doc,item)=>{
  doc.registerFontkit(fontkit);
  const fonts={};for(const [key,bytes] of Object.entries(fontBytes))fonts[key]=await doc.embedFont(bytes,{subset:true});
  const logo=await doc.embedPng(logoBytes),art=await doc.embedJpg(artBytes);
  const [pageWidth,pageHeight]=[595.276,841.89];
  const page=doc.addPage([pageWidth,pageHeight]);
  page.drawRectangle({x:0,y:0,width:pageWidth,height:pageHeight,color:navy});
  drawBrandHeader(page,fonts,logo,pageWidth,pageHeight);

  const isModule=moduleById.has(item.id);
  const childModuleId=(item.modules||[]).find(id=>moduleById.has(id));
  const parent=childModuleId?moduleById.get(childModuleId):null;
  const parentCourse=childModuleId?courseModuleById.get(childModuleId):null;
  const levelSource=parent?.summary||item.summary||'';
  const level=(levelSource.split('|')[1]||'FORMAÇÃO').trim().toUpperCase();
  const tag=isModule?`FORMAÇÃO BI · ${level}`:item.id.endsWith('-lab')?'LABORATÓRIO APLICADO · BI / POWER BI':'AULA PRÁTICA · BI / POWER BI';
  page.drawRectangle({x:42,y:pageHeight-154,width:3,height:17,color:orange});
  page.drawText(tag,{x:53,y:pageHeight-151,font:fonts.bold,size:8.4,color:orange});

  const titleLines=wrap(item.title,fonts.extra,27,500);
  let y=pageHeight-196;
  y=drawLines(page,titleLines,42,y,fonts.extra,27,white,34);
  const summary=isModule
    ? `Formação BI e Power BI · ${level[0]+level.slice(1).toLowerCase()} · ${(item.summary.match(/\d+\s*horas?/)||[])[0]||'trilha aplicada'}`
    : item.summary;
  const summaryLines=wrap(summary,fonts.regular,10.5,492).slice(0,2);
  y=drawLines(page,summaryLines,42,y-7,fonts.regular,10.5,muted,15);

  const imageWidth=224,imageHeight=imageWidth/1.5;
  page.drawImage(art,{x:pageWidth-imageWidth-42,y:335,width:imageWidth,height:imageHeight});
  page.drawLine({start:{x:42,y:493},end:{x:85,y:493},thickness:3,color:orange});

  if(isModule){
    page.drawText('VOCÊ VAI APRENDER',{x:42,y:322,font:fonts.bold,size:8,color:soft});
    const lessons=courseContents.filter(content=>(content.modules||[]).includes(item.id)&&!content.id.endsWith('-lab')).slice(0,3);
    let lessonY=293;
    for(const [index,lesson] of lessons.entries()){
      page.drawText(String(index+1).padStart(2,'0'),{x:42,y:lessonY,font:fonts.bold,size:9.5,color:orange});
      const lines=wrap(lesson.title,fonts.medium,8.3,270).slice(0,2);
      drawLines(page,lines,78,lessonY,fonts.medium,8.3,white,12);
      lessonY-=29;
    }
    const hours=(item.summary.match(/\d+\s*horas?/)||[])[0]||'';
    page.drawRectangle({x:42,y:73,width:pageWidth-84,height:26,color:orange});
    page.drawText(`${hours.toUpperCase()} PLANEJADAS · 3 AULAS · 1 LABORATÓRIO`,{x:58,y:82,font:fonts.bold,size:8.3,color:navy});
  }else{
    const parentName=parentCourse?.title||'Formação BI e Power BI';
    page.drawText('TRILHA',{x:42,y:329,font:fonts.bold,size:7.5,color:orange});
    const parentLines=wrap(parentName,fonts.medium,9.5,255).slice(0,2);
    let studyY=309;
    studyY=drawLines(page,parentLines,42,studyY,fonts.medium,9.5,white,13)-13;
    page.drawText('ROTEIRO DE ESTUDO',{x:42,y:studyY,font:fonts.bold,size:7.5,color:soft});
    const steps=['Entenda o conceito','Aplique no Power BI','Confira o resultado'];
    studyY-=22;
    for(const [index,step] of steps.entries()){
      page.drawText(String(index+1).padStart(2,'0'),{x:42,y:studyY,font:fonts.bold,size:8.5,color:orange});
      page.drawText(step,{x:78,y:studyY,font:fonts.medium,size:8.5,color:white});
      studyY-=20;
    }
    page.drawRectangle({x:42,y:73,width:pageWidth-84,height:26,color:orange});
    const material=item.id.endsWith('-lab')?'LABORATÓRIO APLICADO':'MATERIAL DE ESTUDO';
    page.drawText(`${material} · BI / POWER BI · ${item.pages} PÁGINAS DE CONTEÚDO`,{x:58,y:82,font:fonts.bold,size:8,color:navy});
  }
  drawFooter(page,fonts,pageWidth,'01');
};

const bytesById=new Map();
const nextNames=new Set(biItems.map(item=>item.file));
for(const item of biItems){
  const old=legacyItems[item.id];
  if(!old)throw new Error(`Não há catálogo legado para ${item.id}`);
  const input=resolve(sourceDir,basename(old.file));
  const original=readFileSync(input);
  if(imageHash(original)!==old.sha256)throw new Error(`O PDF original não confere com o hash anterior: ${old.file}`);
  const source=await PDFDocument.load(original);
  const out=await PDFDocument.create();
  await drawCover(out,item);
  const footerFont=await out.embedFont(fontBytes.bold,{subset:true});
  const indices=moduleById.has(item.id)?source.getPageIndices().slice(1):source.getPageIndices();
  const copied=await out.copyPages(source,indices);
  for(const [index,page] of copied.entries()){
    out.addPage(page);
    if(!moduleById.has(item.id)){
      const {width,height}=page.getSize();
      page.drawRectangle({x:width-184,y:height-53,width:184,height:53,color:navy});
      page.drawRectangle({x:width-73,y:8,width:55,height:20,color:rgb(250/255,251/255,1)});
      page.drawText(String(index+2).padStart(2,'0'),{x:width-60,y:14,font:footerFont,size:8,color:footerBlue});
    }
  }
  const expectedPages=moduleById.has(item.id)?source.getPageCount():source.getPageCount()+1;
  if(out.getPageCount()!==expectedPages)throw new Error(`Paginação inesperada em ${item.file}: ${out.getPageCount()} (esperado ${expectedPages})`);
  out.setTitle(item.title);
  out.setAuthor('ST1 Academy');
  out.setSubject('Formação em BI e Power BI');
  out.setKeywords(['ST1 Academy','BI','Power BI','dashboard']);
  out.setCreator('ST1 Academy');
  out.setProducer('ST1 Academy · Biblioteca de BI');
  const output=await out.save({useObjectStreams:true,addDefaultPage:false});
  const finalBytes=Buffer.from(output),sha256=imageHash(finalBytes),outputPath=resolve(filesDir,item.file);
  writeFileSync(outputPath,finalBytes);
  bytesById.set(item.id,{bytes:finalBytes.length,sha256,pages:out.getPageCount()});
  item.sha256=sha256;item.pages=out.getPageCount();
  if(item.id.match(/-a\d{2}$|\-lab$/))item.sections=(item.sections||[]).map((section,index)=>({...section,page:index+2}));
}

for(const old of Object.values(legacyItems))if(!nextNames.has(old.file)){
  const oldPath=resolve(filesDir,basename(old.file));
  try{unlinkSync(oldPath);}catch(error){if(error.code!=='ENOENT')throw error;}
}

for(const [index,item] of manifest.entries())if(item.id.startsWith('st1-bi-'))manifest[index]=biItems.find(current=>current.id===item.id);
writeFileSync(manifestPath,JSON.stringify(manifest,null,2)+'\n');
const updatedContents=biContents.map(item=>{
  const metadata=bytesById.get(item.id);return metadata?{...item,...metadata}:item;
});
const modules=biModules,quizzes=biQuizzes;
writeFileSync(resolve(root,'content/bi-course.mjs'),[
  '// Gerado a partir do pacote visual ST1 Academy BI.',
  `export const biModules=${JSON.stringify(modules,null,2)};`,
  `export const biQuizzes=${JSON.stringify(quizzes,null,2)};`,
  `export const biContents=${JSON.stringify(updatedContents,null,2)};`,
  ''
].join('\n'));
console.log(`PDFs atualizados: ${biItems.length} · páginas: ${[...bytesById.values()].reduce((sum,item)=>sum+item.pages,0)}.`);
