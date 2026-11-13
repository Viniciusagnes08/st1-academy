import {createCipheriv,createDecipheriv,createHash,randomBytes,randomUUID} from 'node:crypto';
import {isIP} from 'node:net';

const fields={
  email:['ACADEMY_SMTP_HOST','ACADEMY_SMTP_PORT','ACADEMY_SMTP_USER','ACADEMY_SMTP_PASSWORD','ACADEMY_MAIL_FROM'],
  whatsapp:['WHATSAPP_GRAPH_VERSION','WHATSAPP_PHONE_NUMBER_ID','WHATSAPP_ACCESS_TOKEN','WHATSAPP_BUSINESS_ACCOUNT_ID','WHATSAPP_APP_SECRET','WHATSAPP_VERIFY_TOKEN'],
  glitchtip:['GLITCHTIP_ENABLED','GLITCHTIP_DSN','GLITCHTIP_TRACES_SAMPLE_RATE'],
  n8n:['N8N_ENABLED','N8N_WEBHOOK_URL','N8N_WEBHOOK_SECRET'],
  openpanel:['OPENPANEL_ENABLED','OPENPANEL_API_URL','OPENPANEL_CLIENT_ID','OPENPANEL_CLIENT_SECRET']
};
const defaults={GLITCHTIP_ENABLED:'0',GLITCHTIP_TRACES_SAMPLE_RATE:'0.01',N8N_ENABLED:'0',OPENPANEL_ENABLED:'0',OPENPANEL_API_URL:'https://api.openpanel.dev'};
const secretFields=new Set(['ACADEMY_SMTP_PASSWORD','WHATSAPP_ACCESS_TOKEN','WHATSAPP_APP_SECRET','WHATSAPP_VERIFY_TOKEN','GLITCHTIP_DSN','N8N_WEBHOOK_SECRET','OPENPANEL_CLIENT_SECRET']);
const optionalFields=new Set(['WHATSAPP_BUSINESS_ACCOUNT_ID']);
const keyFor=secret=>createHash('sha256').update(`academy-integrations-v1:${secret}`).digest();
const encrypt=(key,value)=>{const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv),data=Buffer.concat([cipher.update(value,'utf8'),cipher.final()]);return Buffer.concat([iv,cipher.getAuthTag(),data]).toString('base64');};
const decrypt=(key,value)=>{const bytes=Buffer.from(value,'base64'),decipher=createDecipheriv('aes-256-gcm',key,bytes.subarray(0,12));decipher.setAuthTag(bytes.subarray(12,28));return Buffer.concat([decipher.update(bytes.subarray(28)),decipher.final()]).toString('utf8');};
const privateHost=hostname=>{
  const host=String(hostname||'').toLowerCase().replace(/^\[|\]$/g,'');
  if(!host||host==='localhost'||host.endsWith('.localhost')||host.endsWith('.local'))return true;
  const family=isIP(host);
  if(family===4){
    const [a,b]=host.split('.').map(Number);
    return a===0||a===10||a===127||(a===100&&b>=64&&b<=127)||(a===169&&b===254)||(a===172&&b>=16&&b<=31)||(a===192&&b===168)||a>=224;
  }
  if(family===6)return host==='::'||host==='::1'||host.startsWith('fc')||host.startsWith('fd')||/^fe[89ab]/.test(host)||host.startsWith('::ffff:');
  return false;
};
const httpsUrl=(value,{credentials=false}={})=>{let url;try{url=new URL(value);}catch{return null;}if(url.protocol!=='https:'||!url.hostname||privateHost(url.hostname)||(!credentials&&(url.username||url.password)))return null;return url;};
const enabled=value=>String(value)==='1';

export function createIntegrationService(db,{secret,env=process.env}){
  const key=keyFor(secret);db.exec('CREATE TABLE IF NOT EXISTS academy_integration_setting(name TEXT PRIMARY KEY,value_cipher TEXT NOT NULL,updated_by TEXT NOT NULL,updated_at TEXT NOT NULL); CREATE TABLE IF NOT EXISTS academy_webhook(id TEXT PRIMARY KEY,name TEXT NOT NULL,url_cipher TEXT NOT NULL,secret_cipher TEXT NOT NULL,events_json TEXT NOT NULL,enabled INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);');
  db.exec('CREATE TABLE IF NOT EXISTS academy_custom_integration(id TEXT PRIMARY KEY,name TEXT NOT NULL,category TEXT NOT NULL,endpoint_cipher TEXT NOT NULL,credential_cipher TEXT,notes TEXT NOT NULL DEFAULT \'\',created_by TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);');
  const stored=name=>{const row=db.prepare('SELECT value_cipher FROM academy_integration_setting WHERE name=?').get(name);return row?decrypt(key,row.value_cipher):undefined;};
  const effective=()=>new Proxy(env,{get(target,name){if(typeof name!=='string')return target[name];return stored(name)??target[name]??defaults[name];}});
  const configured=type=>{
    const e=effective();
    if(type==='email')return !!(e.ACADEMY_SMTP_HOST&&e.ACADEMY_SMTP_USER&&e.ACADEMY_SMTP_PASSWORD&&e.ACADEMY_MAIL_FROM);
    if(type==='whatsapp')return !!(e.WHATSAPP_ACCESS_TOKEN&&e.WHATSAPP_PHONE_NUMBER_ID&&/^v\d+\.\d+$/.test(e.WHATSAPP_GRAPH_VERSION||''));
    if(type==='glitchtip')return enabled(e.GLITCHTIP_ENABLED)&&!!e.GLITCHTIP_DSN;
    if(type==='n8n')return enabled(e.N8N_ENABLED)&&!!(e.N8N_WEBHOOK_URL&&e.N8N_WEBHOOK_SECRET);
    if(type==='openpanel')return enabled(e.OPENPANEL_ENABLED)&&!!(e.OPENPANEL_API_URL&&e.OPENPANEL_CLIENT_ID&&e.OPENPANEL_CLIENT_SECRET);
    return false;
  };
  const publicConfig=type=>{const e=effective();return {ready:configured(type),...(type==='whatsapp'?{templatesReady:configured(type)&&!!e.WHATSAPP_BUSINESS_ACCOUNT_ID,webhookReady:!!(e.WHATSAPP_APP_SECRET&&e.WHATSAPP_VERIFY_TOKEN)}:{}),fields:Object.fromEntries(fields[type].map(name=>[name,secretFields.has(name)?{configured:!!e[name]}:{value:e[name]||''}]))};};
  const webhooks=()=>db.prepare('SELECT id,name,events_json,enabled,created_at,updated_at FROM academy_webhook ORDER BY created_at DESC').all().map(x=>({...x,enabled:!!x.enabled,events:JSON.parse(x.events_json),events_json:undefined}));
  const custom=()=>db.prepare('SELECT id,name,category,notes,credential_cipher,created_at,updated_at FROM academy_custom_integration ORDER BY created_at DESC').all().map(x=>({id:x.id,name:x.name,category:x.category,notes:x.notes,credentialConfigured:!!x.credential_cipher,createdAt:x.created_at,updatedAt:x.updated_at,status:'draft'}));
  const list=()=>({email:publicConfig('email'),whatsapp:publicConfig('whatsapp'),glitchtip:publicConfig('glitchtip'),n8n:publicConfig('n8n'),openpanel:publicConfig('openpanel'),webhooks:webhooks(),custom:custom()});
  function save(actor,type,input){
    if(!fields[type])throw new Error('Integração desconhecida.');const values={};
    for(const name of fields[type])if(Object.hasOwn(input,name)){
      const value=String(input[name]??'').trim();
      if(!value){if(!secretFields.has(name)&&!optionalFields.has(name))throw new Error(`${name} não pode ficar vazio.`);continue;}
      if(value.length>2000)throw new Error('Valor muito longo.');values[name]=value;
    }
    const all={...Object.fromEntries(fields[type].map(name=>[name,effective()[name]||''])),...values};
    if(type==='email'){
      if(!/^[a-zA-Z0-9.-]+$/.test(all.ACADEMY_SMTP_HOST||'')||!Number.isInteger(Number(all.ACADEMY_SMTP_PORT))||Number(all.ACADEMY_SMTP_PORT)<1||Number(all.ACADEMY_SMTP_PORT)>65535||!/^\S+@\S+\.\S+$/.test(all.ACADEMY_SMTP_USER||'')||!/^\S+@\S+\.\S+$/.test(all.ACADEMY_MAIL_FROM||''))throw new Error('Confira servidor, porta e endereços do e-mail.');
    }else if(type==='whatsapp'){
      if(!/^v\d+\.\d+$/.test(all.WHATSAPP_GRAPH_VERSION||'')||!/^\d+$/.test(all.WHATSAPP_PHONE_NUMBER_ID||'')||(all.WHATSAPP_BUSINESS_ACCOUNT_ID&&!/^\d+$/.test(all.WHATSAPP_BUSINESS_ACCOUNT_ID))||(all.WHATSAPP_VERIFY_TOKEN&&all.WHATSAPP_VERIFY_TOKEN.length<16)||(all.WHATSAPP_APP_SECRET&&all.WHATSAPP_APP_SECRET.length<16))throw new Error('Confira a versão da API, os IDs e os dados do webhook.');
    }else if(type==='glitchtip'){
      if(!['0','1'].includes(all.GLITCHTIP_ENABLED)||!Number.isFinite(Number(all.GLITCHTIP_TRACES_SAMPLE_RATE))||Number(all.GLITCHTIP_TRACES_SAMPLE_RATE)<0||Number(all.GLITCHTIP_TRACES_SAMPLE_RATE)>1||(enabled(all.GLITCHTIP_ENABLED)&&!httpsUrl(all.GLITCHTIP_DSN,{credentials:true})))throw new Error('Confira o GlitchTip: DSN HTTPS e sample rate entre 0 e 1.');
    }else if(type==='n8n'){
      if(!['0','1'].includes(all.N8N_ENABLED)||(enabled(all.N8N_ENABLED)&&(!httpsUrl(all.N8N_WEBHOOK_URL)||String(all.N8N_WEBHOOK_SECRET||'').length<16)))throw new Error('Confira o n8n: URL HTTPS e segredo com pelo menos 16 caracteres.');
    }else if(type==='openpanel'){
      if(!['0','1'].includes(all.OPENPANEL_ENABLED)||(enabled(all.OPENPANEL_ENABLED)&&(!httpsUrl(all.OPENPANEL_API_URL)||!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(all.OPENPANEL_CLIENT_ID||'')||String(all.OPENPANEL_CLIENT_SECRET||'').length<16)))throw new Error('Confira o OpenPanel: API HTTPS, Client ID UUIDv4 e Client Secret válido.');
    }
    const stmt=db.prepare('INSERT INTO academy_integration_setting(name,value_cipher,updated_by,updated_at) VALUES(?,?,?,?) ON CONFLICT(name) DO UPDATE SET value_cipher=excluded.value_cipher,updated_by=excluded.updated_by,updated_at=excluded.updated_at');for(const [name,value] of Object.entries(values))stmt.run(name,encrypt(key,value),actor,new Date().toISOString());return publicConfig(type);
  }
  function addWebhook(actor,input){const name=String(input.name||'').trim(),url=String(input.url||'').trim(),secretValue=String(input.secret||'').trim(),events=Array.isArray(input.events)?input.events:[];let parsed;try{parsed=new URL(url);}catch{}if(name.length<3||name.length>80||!parsed||parsed.protocol!=='https:'||parsed.username||parsed.password||parsed.hostname==='localhost'||!secretValue||secretValue.length<16||!events.length||events.some(x=>!['email.campaign.completed','whatsapp.campaign.completed'].includes(x)))throw new Error('Informe nome, URL HTTPS pública, segredo (16+ caracteres) e eventos válidos.');const id=randomUUID(),time=new Date().toISOString();db.prepare('INSERT INTO academy_webhook(id,name,url_cipher,secret_cipher,events_json,enabled,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)').run(id,name,encrypt(key,url),encrypt(key,secretValue),JSON.stringify([...new Set(events)]),0,time,time);return webhooks().find(x=>x.id===id);}
  function removeWebhook(id){const result=db.prepare('DELETE FROM academy_webhook WHERE id=? AND enabled=0').run(id);if(!result.changes)throw new Error('Webhook não encontrado ou ativo.');return true;}
  function addCustom(actor,input){const name=String(input.name||'').trim(),category=String(input.category||'').trim(),endpoint=String(input.endpoint||'').trim(),credential=String(input.credential||'').trim(),notes=String(input.notes||'').trim();let url;try{url=new URL(endpoint);}catch{}if(name.length<3||name.length>80||!['api','oauth','data','automation','other'].includes(category)||!url||url.protocol!=='https:'||url.username||url.password||['localhost','127.0.0.1'].includes(url.hostname)||credential.length>2000||notes.length>500)throw new Error('Confira nome, categoria, endereço HTTPS e observações.');const id=randomUUID(),time=new Date().toISOString();db.prepare('INSERT INTO academy_custom_integration(id,name,category,endpoint_cipher,credential_cipher,notes,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)').run(id,name,category,encrypt(key,endpoint),credential?encrypt(key,credential):null,notes,actor,time,time);return custom().find(x=>x.id===id);}
  function removeCustom(id){const result=db.prepare('DELETE FROM academy_custom_integration WHERE id=?').run(id);if(!result.changes)throw new Error('Integração não encontrada.');return true;}
  return {effective,list,save,addWebhook,removeWebhook,addCustom,removeCustom};
}
