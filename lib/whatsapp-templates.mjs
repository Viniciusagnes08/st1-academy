import {randomUUID} from 'node:crypto';
import {createWhatsAppProvider} from './whatsapp-provider.mjs';

const now=()=>new Date().toISOString();
const variableNumbers=text=>[...String(text||'').matchAll(/{{\s*(\d+)\s*}}/g)].map(match=>Number(match[1]));
const validVariables=(text,samples,label,max=5)=>{
  const numbers=variableNumbers(text);
  const unique=[...new Set(numbers)].sort((a,b)=>a-b);
  if(unique.some((value,index)=>value!==index+1))throw new Error(`${label}: use variáveis sequenciais {{1}}, {{2}} e assim por diante.`);
  if(unique.length>max)throw new Error(`${label}: limite de ${max} variáveis.`);
  if(unique.length&&(!Array.isArray(samples)||samples.length!==unique.length||samples.some(value=>!String(value||'').trim())))throw new Error(`Preencha um exemplo para cada variável de ${label.toLowerCase()}.`);
  return unique.length;
};
const normalizeButton=(item,index)=>{
  const type=String(item?.type||'').toUpperCase(),text=String(item?.text||'').trim();
  if(!['URL','PHONE_NUMBER','QUICK_REPLY'].includes(type)||text.length<1||text.length>25)throw new Error(`Confira o botão ${index+1}; o texto deve ter até 25 caracteres.`);
  if(type==='URL'){
    const url=String(item.url||'').trim();let parsed;try{parsed=new URL(url);}catch{}
    if(!parsed||parsed.protocol!=='https:'||parsed.username||parsed.password||/{{\s*\d+\s*}}/.test(url))throw new Error(`O link do botão ${index+1} precisa ser uma URL HTTPS completa, sem variáveis.`);
    return {type,text,url};
  }
  if(type==='PHONE_NUMBER'){
    const phone=String(item.phoneNumber||'').replace(/[\s()-]/g,'');
    if(!/^\+[1-9]\d{7,14}$/.test(phone))throw new Error(`O telefone do botão ${index+1} deve usar o formato internacional, por exemplo +5511999999999.`);
    return {type,text,phoneNumber:phone};
  }
  return {type,text};
};

function buildTemplate(input){
  const name=String(input.name||'').trim(),language=String(input.language||'').trim(),category=String(input.category||'').toUpperCase();
  const headerText=String(input.headerText||'').trim(),bodyText=String(input.bodyText||'').trim(),footerText=String(input.footerText||'').trim();
  const headerSamples=Array.isArray(input.headerSamples)?input.headerSamples.map(x=>String(x||'').trim()):[];
  const bodySamples=Array.isArray(input.bodySamples)?input.bodySamples.map(x=>String(x||'').trim()):[];
  const buttons=Array.isArray(input.buttons)?input.buttons.map(normalizeButton):[];
  if(!/^[a-z0-9_]{3,512}$/.test(name))throw new Error('Use um nome único em letras minúsculas, números e sublinhados (3 a 512 caracteres).');
  if(!/^[a-z]{2}(?:_[A-Z]{2})?$/.test(language))throw new Error('Informe um idioma válido, como pt_BR.');
  if(!['UTILITY','MARKETING'].includes(category))throw new Error('Selecione Utilidade ou Marketing.');
  if(!bodyText||bodyText.length>1024)throw new Error('O corpo é obrigatório e aceita até 1.024 caracteres.');
  if(headerText.length>60)throw new Error('O cabeçalho aceita até 60 caracteres.');
  if(footerText.length>60)throw new Error('O rodapé aceita até 60 caracteres.');
  if(buttons.length>3)throw new Error('Adicione até 3 botões por modelo.');
  if(buttons.filter(x=>x.type==='URL').length>2||buttons.filter(x=>x.type==='PHONE_NUMBER').length>1)throw new Error('Use até 2 botões de link e 1 botão de telefone.');
  const headerVariables=headerText?validVariables(headerText,headerSamples,'Cabeçalho',1):0;
  const bodyVariables=validVariables(bodyText,bodySamples,'Corpo');
  const components=[];
  if(headerText){const header={type:'HEADER',format:'TEXT',text:headerText};if(headerVariables)header.example={header_text:headerSamples};components.push(header);}
  const body={type:'BODY',text:bodyText};if(bodyVariables)body.example={body_text:[bodySamples]};components.push(body);
  if(footerText)components.push({type:'FOOTER',text:footerText});
  if(buttons.length)components.push({type:'BUTTONS',buttons:buttons.map(item=>item.type==='URL'?{type:'URL',text:item.text,url:item.url}:item.type==='PHONE_NUMBER'?{type:'PHONE_NUMBER',text:item.text,phone_number:item.phoneNumber}:{type:'QUICK_REPLY',text:item.text})});
  return {name,language,category,headerText,bodyText,footerText,headerSamples,bodySamples,buttons,components};
}

export function createWhatsAppTemplateService(db,{env=process.env,provider=createWhatsAppProvider(env),clock=now}={}){
  db.exec(`CREATE TABLE IF NOT EXISTS academy_whatsapp_template(
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    language TEXT NOT NULL,
    requested_category TEXT NOT NULL,
    current_category TEXT,
    header_text TEXT NOT NULL DEFAULT '',
    body_text TEXT NOT NULL,
    footer_text TEXT NOT NULL DEFAULT '',
    header_samples_json TEXT NOT NULL DEFAULT '[]',
    body_samples_json TEXT NOT NULL DEFAULT '[]',
    buttons_json TEXT NOT NULL DEFAULT '[]',
    components_json TEXT NOT NULL,
    origin TEXT NOT NULL DEFAULT 'academy',
    status TEXT NOT NULL,
    meta_id TEXT,
    meta_status TEXT,
    rejected_reason TEXT,
    last_synced_at TEXT,
    submission_error TEXT,
    created_by TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    submitted_at TEXT,
    UNIQUE(name,language)
  );`);
  const row=id=>db.prepare('SELECT * FROM academy_whatsapp_template WHERE id=?').get(id);
  const view=item=>({id:item.id,name:item.name,language:item.language,requestedCategory:item.requested_category,currentCategory:item.current_category||item.requested_category,headerText:item.header_text,bodyText:item.body_text,footerText:item.footer_text,headerSamples:JSON.parse(item.header_samples_json||'[]'),bodySamples:JSON.parse(item.body_samples_json||'[]'),buttons:JSON.parse(item.buttons_json||'[]'),components:JSON.parse(item.components_json||'[]'),origin:item.origin,status:item.meta_status||item.status,metaId:item.meta_id||null,rejectedReason:item.rejected_reason||null,lastSyncedAt:item.last_synced_at||null,submissionError:item.submission_error||null,createdAt:item.created_at,updatedAt:item.updated_at,submittedAt:item.submitted_at||null});
  const list=()=>({providerReady:provider.templatesReady(),items:db.prepare('SELECT * FROM academy_whatsapp_template ORDER BY CASE WHEN status IN (\'draft\',\'submit_error\') THEN 0 ELSE 1 END,updated_at DESC').all().map(view)});
  function saveDraft(actor,input,id=null){
    const model=buildTemplate(input),existing=db.prepare('SELECT * FROM academy_whatsapp_template WHERE name=? AND language=?').get(model.name,model.language);
    if(id){const current=row(id);if(!current||current.origin!=='academy'||!['draft','submit_error'].includes(current.status))throw new Error('Somente um rascunho que ainda não foi enviado pode ser editado.');if(existing&&existing.id!==id)throw new Error('Já existe um modelo com esse nome e idioma.');const time=clock();db.prepare(`UPDATE academy_whatsapp_template SET name=?,language=?,requested_category=?,current_category=?,header_text=?,body_text=?,footer_text=?,header_samples_json=?,body_samples_json=?,buttons_json=?,components_json=?,status='draft',submission_error=NULL,updated_at=? WHERE id=?`).run(model.name,model.language,model.category,model.category,model.headerText,model.bodyText,model.footerText,JSON.stringify(model.headerSamples),JSON.stringify(model.bodySamples),JSON.stringify(model.buttons),JSON.stringify(model.components),time,id);return view(row(id));}
    if(existing)throw new Error('Este nome e idioma já estão cadastrados. Atualize os modelos da Meta ou escolha outro nome.');
    const idValue=randomUUID(),time=clock();db.prepare(`INSERT INTO academy_whatsapp_template(id,name,language,requested_category,current_category,header_text,body_text,footer_text,header_samples_json,body_samples_json,buttons_json,components_json,origin,status,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,'academy','draft',?,?,?)`).run(idValue,model.name,model.language,model.category,model.category,model.headerText,model.bodyText,model.footerText,JSON.stringify(model.headerSamples),JSON.stringify(model.bodySamples),JSON.stringify(model.buttons),JSON.stringify(model.components),actor,time,time);return view(row(idValue));
  }
  async function submit(id){
    const item=row(id);if(!item||item.origin!=='academy')throw new Error('Rascunho de modelo não encontrado.');
    if(!provider.templatesReady())throw new Error('Configure o token e o ID da conta WhatsApp Business em Integrações.');
    if(!['draft','submit_error'].includes(item.status))throw new Error('Este modelo já foi enviado ou está aguardando confirmação. Atualize o status na Meta.');
    const duplicate=(await provider.templates()).find(remote=>remote.name===item.name&&remote.language===item.language);
    if(duplicate){syncOne(duplicate);return {...view(db.prepare('SELECT * FROM academy_whatsapp_template WHERE name=? AND language=?').get(item.name,item.language)),alreadyInMeta:true};}
    const time=clock();db.prepare("UPDATE academy_whatsapp_template SET status='submitting',submission_error=NULL,updated_at=? WHERE id=?").run(time,id);
    try{
      const result=await provider.createTemplate({name:item.name,language:item.language,category:item.requested_category,components:JSON.parse(item.components_json)});
      db.prepare("UPDATE academy_whatsapp_template SET status=?,meta_status=?,meta_id=?,current_category=COALESCE(?,current_category),submitted_at=?,updated_at=? WHERE id=?").run(String(result.status||'PENDING').toLowerCase(),String(result.status||'PENDING').toUpperCase(),result.id||null,result.category||null,time,clock(),id);
    }catch(error){
      const message=String(error.message||error).slice(0,240),latest=db.prepare('SELECT status FROM academy_whatsapp_template WHERE id=?').get(id)?.status;
      if(latest==='submitting')db.prepare("UPDATE academy_whatsapp_template SET status='submit_error',submission_error=?,updated_at=? WHERE id=?").run(message,clock(),id);
      throw error;
    }
    return view(row(id));
  }
  function syncOne(remote){
    const current=db.prepare('SELECT * FROM academy_whatsapp_template WHERE name=? AND language=?').get(remote.name,remote.language),time=clock(),category=remote.category||current?.current_category||current?.requested_category||null;
    const components=remote.components||current&&JSON.parse(current.components_json)||[],bodyText=components.find(item=>String(item.type||'').toUpperCase()==='BODY')?.text||current?.body_text||'';
    if(current){db.prepare('UPDATE academy_whatsapp_template SET current_category=?,meta_status=?,meta_id=COALESCE(?,meta_id),rejected_reason=?,body_text=?,components_json=?,last_synced_at=?,submission_error=NULL,status=?,updated_at=? WHERE id=?').run(category,remote.status||current.meta_status,remote.id||null,remote.rejected_reason||null,bodyText,JSON.stringify(components),time,String(remote.status||current.status).toLowerCase(),time,current.id);}
    else{const id=randomUUID();db.prepare(`INSERT INTO academy_whatsapp_template(id,name,language,requested_category,current_category,body_text,components_json,origin,status,meta_id,meta_status,rejected_reason,last_synced_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,'meta',?,?,?,?,?,?,?)`).run(id,remote.name,remote.language,category||'MARKETING',category||null,bodyText,JSON.stringify(components),String(remote.status||'unknown').toLowerCase(),remote.id||null,remote.status||null,remote.rejected_reason||null,time,time,time);}
  }
  async function sync(){
    if(!provider.templatesReady())throw new Error('Configure o token e o ID da conta WhatsApp Business em Integrações.');
    const remote=await provider.templates();for(const item of remote)syncOne(item);
    return {...list(),syncedAt:clock(),remoteCount:remote.length};
  }
  return {list,saveDraft,submit,sync};
}
