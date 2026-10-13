import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {projectRoot} from '../lib/context.mjs';
import {certificatePdf} from '../lib/certificate.mjs';
const bank=JSON.parse(await readFile(resolve(projectRoot,'content/questions.json'),'utf8'));
await mkdir(resolve(projectRoot,'public/assets/badges'),{recursive:true});
for(const [index,track] of bank.tracks.entries()){
  const color=track.id==='pap'?'#ef7a25':track.color;
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="400" height="480" viewBox="0 0 400 480" role="img" aria-label="${track.badge}"><path d="M200 12 364 86 345 306 200 460 55 306 36 86Z" fill="#111113" stroke="${color}" stroke-width="12"/><path d="M200 38 340 100 322 294 200 427 78 294 60 100Z" fill="none" stroke="${color}" stroke-width="2" opacity=".55"/><path d="M129 70h142l-14 42H143Z" fill="${color}"/><text x="200" y="99" fill="#111113" font-family="Arial,sans-serif" font-weight="700" font-size="18" text-anchor="middle">TRILHA ${String(index+1).padStart(2,'0')}</text><path d="m200 137 19 60 61 18-61 20-19 62-20-62-61-20 61-18Z" fill="${color}"/><path d="m200 137 0 78 80 0-61-18Z" fill="#fff" opacity=".2"/><text x="200" y="331" fill="#fff" font-family="Arial,sans-serif" font-size="67" font-weight="900" text-anchor="middle">ST1</text><text x="200" y="365" fill="${color}" font-family="Arial,sans-serif" font-size="17" font-weight="700" letter-spacing="2" text-anchor="middle">ESPECIALISTA</text><path d="M174 387h52" stroke="${color}" stroke-width="3"/></svg>`;
  await writeFile(resolve(projectRoot,`public/assets/badges/${track.id}.svg`),svg);
}
await writeFile(resolve(projectRoot,'public/assets/favicon.svg'),'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="6" fill="#111113"/><path d="m32 8 7 17 17 7-17 7-7 17-7-17-17-7 17-7Z" fill="#f77716"/></svg>');
const pdf=await certificatePdf({id:'MODELO',name:'Nome completo do vendedor',track:bank.tracks.find(t=>t.id==='digital'),score:80,issuedAt:'2026-10-11T12:00:00Z',baseURL:'http://localhost:4175',model:true});
await writeFile(resolve(projectRoot,'..','ST1 - Modelo de Certificado Comercial.pdf'),pdf);
console.log('Cinco insígnias e modelo de certificado criados.');
