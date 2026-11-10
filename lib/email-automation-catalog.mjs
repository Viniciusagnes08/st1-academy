import {readFileSync} from 'node:fs';

const source=JSON.parse(readFileSync(new URL('../config/email-templates-20.json',import.meta.url),'utf8'));
const keys=new Set();
const placeholder=/\{\{([a-z_]+)\}\}/g;

export const emailAutomationCatalog=Object.freeze(source.templates.map(template=>{
  if(keys.has(template.key))throw new Error(`Modelo de e-mail repetido: ${template.key}`);
  keys.add(template.key);
  const declared=[...template.variables].sort();
  const used=[...new Set([template.subject,template.preheader,template.bodyMarkdown,template.ctaLabel].join('\n').matchAll(placeholder).map(match=>match[1]))].sort();
  if(JSON.stringify(declared)!==JSON.stringify(used))throw new Error(`Variáveis inconsistentes: ${template.key}`);
  if(!template.subject||!template.preheader||!template.bodyMarkdown||!template.ctaLabel||!template.ctaTarget)throw new Error(`Modelo incompleto: ${template.key}`);
  return Object.freeze({...template,variables:Object.freeze(template.variables)});
}));

if(emailAutomationCatalog.length!==20)throw new Error('São necessários os 20 modelos aprovados.');

export function renderEmailAutomationTemplate(template,values){
  const required=template.variables;
  for(const name of required){
    if(typeof values[name]!=='string'&&typeof values[name]!=='number'||!String(values[name]).trim())throw new Error(`Falta o dado real ${name}.`);
  }
  const fill=value=>value.replace(placeholder,(_,name)=>String(values[name]));
  return {subject:fill(template.subject),preheader:fill(template.preheader),bodyMarkdown:fill(template.bodyMarkdown),ctaLabel:fill(template.ctaLabel),ctaTarget:template.ctaTarget};
}
