import {copyFileSync,existsSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {resolve,basename,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const sourceDir=process.argv[2];
if(!sourceDir)throw new Error('Informe a pasta de origem dos PDFs originais.');
const legacyPath=resolve(root,'content/library/bi-legacy-manifest.json');
if(existsSync(legacyPath))throw new Error('O catálogo legado já existe; a preparação só pode ser executada uma vez.');
const course=await import(pathToFileURL(resolve(root,'content/bi-course.mjs')).href+'?before-rebrand='+Date.now());
const manifestPath=resolve(root,'content/library/manifest.json');
const manifest=JSON.parse(readFileSync(manifestPath,'utf8'));
const biManifest=manifest.filter(item=>item.id.startsWith('st1-bi-'));
const legacy={
  contents:Object.fromEntries(biManifest.map(item=>[item.id,{title:item.title,file:item.file,summary:item.summary,sha256:item.sha256}])),
  modules:Object.fromEntries(course.biModules.map(item=>[item.id,item.title])),
  quizzes:Object.fromEntries(course.biQuizzes.map(item=>[item.id,item.title]))
};
writeFileSync(legacyPath,JSON.stringify(legacy,null,2)+'\n');
mkdirSync(sourceDir,{recursive:true});
const filesDir=resolve(root,'content/library/files');
for(const item of biManifest)copyFileSync(resolve(filesDir,item.file),resolve(sourceDir,basename(item.file)));

const slug=value=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
const cleanModuleTitle=value=>value.replace(/^M\d{2}\s+BI\s+/,'');
const cleanQuizTitle=value=>value.replace(/^BI\s+M\d{2}\s+/,'Avaliação BI · ');
const cleanContentTitle=value=>value.replace(/^M\d{2}-A\d{2}\s+/,'').replace(/^M\d{2}\s+Laboratório\s+/,'Laboratório · ');
const modules=course.biModules.map(item=>({...item,title:cleanModuleTitle(item.title)}));
const quizzes=course.biQuizzes.map(item=>({...item,title:cleanQuizTitle(item.title)}));
const contents=course.biContents.map(item=>{
  const title=cleanContentTitle(item.title),file=`bi-${slug(title)}.pdf`;
  const folder=item.file.endsWith('-LAB.pdf')?'Aluno/Laboratorios':'Aluno/Aulas';
  return {...item,title,file,path:`${folder}/${file}`};
});
const courseText=[
  '// Gerado a partir do pacote visual ST1 Academy BI.',
  `export const biModules=${JSON.stringify(modules,null,2)};`,
  `export const biQuizzes=${JSON.stringify(quizzes,null,2)};`,
  `export const biContents=${JSON.stringify(contents,null,2)};`,
  ''
].join('\n');
writeFileSync(resolve(root,'content/bi-course.mjs'),courseText);
const titleById=new Map([...modules,...quizzes,...contents].map(item=>[item.id,item.title]));
const fileById=new Map(contents.map(item=>[item.id,item.file]));
for(const item of biManifest){
  item.title=titleById.get(item.id);
  item.file=fileById.get(item.id)||`bi-${slug(item.title)}.pdf`;
  item.search=(item.search||'').replace(/\bM\d{2}(?:-A\d{2}|-LAB)?\b/g,'').replace(/\s+/g,' ').trim();
  item.search=[item.title,item.summary,item.search,'BI Power BI ST1'].filter(Boolean).join(' ').replace(/\s+/g,' ').trim();
}
writeFileSync(manifestPath,JSON.stringify(manifest,null,2)+'\n');
console.log(`Preparados ${biManifest.length} PDFs BI, ${modules.length} módulos e ${quizzes.length} avaliações.`);
console.log(`Originais copiados para ${sourceDir}`);
