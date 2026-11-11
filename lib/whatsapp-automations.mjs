import {randomUUID} from 'node:crypto';
import {createEmailAutomationEligibility} from './email-automation-eligibility.mjs';
import {whatsappAutomationCatalog} from './whatsapp-automation-catalog.mjs';
import {compatibleAutomationTemplate,createWhatsAppProvider} from './whatsapp-provider.mjs';

const iso=()=>new Date().toISOString();
const phone=value=>{const digits=String(value||'').replace(/\D/g,'');const number=digits.startsWith('55')?digits:`55${digits}`;return /^55\d{10,11}$/.test(number)?number:null;};
const firstName=value=>String(value||'').trim().split(/\s+/)[0];

export function createWhatsAppAutomationService(db,{env=process.env,baseURL,context,receipts=null,sendTemplate=null,clock=iso,provider=createWhatsAppProvider(env)}={}){
  db.exec(`CREATE TABLE IF NOT EXISTS academy_whatsapp_automation(key TEXT PRIMARY KEY,status TEXT NOT NULL DEFAULT 'paused',template_name TEXT,language TEXT NOT NULL DEFAULT 'pt_BR',activated_at TEXT,approved_at TEXT,updated_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS academy_whatsapp_automation_job(id TEXT PRIMARY KEY,automation_key TEXT NOT NULL,user_id TEXT NOT NULL,entity_key TEXT NOT NULL,phone TEXT NOT NULL,scheduled_at TEXT NOT NULL,status TEXT NOT NULL,message_id TEXT,error TEXT,accepted_at TEXT,created_at TEXT NOT NULL,UNIQUE(automation_key,user_id,entity_key));
    CREATE INDEX IF NOT EXISTS academy_whatsapp_automation_due ON academy_whatsapp_automation_job(status,scheduled_at);`);
  for(const item of whatsappAutomationCatalog)db.prepare("INSERT OR IGNORE INTO academy_whatsapp_automation(key,status,language,updated_at) VALUES(?,'paused','pt_BR',?)").run(item.key,clock());
  const eligibility=createEmailAutomationEligibility(db,{context,baseURL,clock,channel:'whatsapp'});
  const ready=()=>!!(sendTemplate||provider.ready());
  const person=id=>{const row=db.prepare(`SELECT u.id,u.name,p.phone,c.opted_in,c.phone_at_consent FROM user u JOIN academy_member m ON m.user_id=u.id AND m.enabled=1 JOIN academy_whatsapp_consent c ON c.user_id=u.id LEFT JOIN academy_personal_profile p ON p.user_id=u.id WHERE u.id=?`).get(id);if(!row)return null;const normalized=phone(row.phone);return row.opted_in===1&&normalized&&normalized===row.phone_at_consent?{...row,phone:normalized}:null;};
  const state=key=>db.prepare('SELECT * FROM academy_whatsapp_automation WHERE key=?').get(key);
  const count=(key,status)=>db.prepare('SELECT count(*) n FROM academy_whatsapp_automation_job WHERE automation_key=? AND status=?').get(key,status).n;
  function list(){return {providerReady:ready(),templatesReady:provider.templatesReady(),webhookReady:!!(env.WHATSAPP_APP_SECRET&&env.WHATSAPP_VERIFY_TOKEN),items:whatsappAutomationCatalog.map(item=>{const row=state(item.key),receiptsForKey=db.prepare('SELECT r.delivered_at,r.read_at,r.status FROM academy_whatsapp_automation_job j LEFT JOIN academy_whatsapp_receipt r ON r.message_id=j.message_id WHERE j.automation_key=?').all(item.key);return {...item,status:row.status,templateName:row.template_name||'',language:row.language,activatedAt:row.activated_at,approvedAt:row.approved_at,accepted:count(item.key,'accepted'),delivered:receiptsForKey.filter(x=>x.delivered_at).length,read:receiptsForKey.filter(x=>x.read_at).length,failed:count(item.key,'failed')+count(item.key,'unknown')+receiptsForKey.filter(x=>x.status==='failed').length};})};}
  function save(key,input){const row=state(key);if(!row)throw new Error('Automação não encontrada.');const name=String(input.templateName||'').trim(),language=String(input.language||'pt_BR').trim();if(!/^[a-z0-9_]{3,512}$/.test(name)||!(/^[a-z]{2}(?:_[A-Z]{2})?$/.test(language)))throw new Error('Informe o nome e o idioma exatos do modelo aprovado na Meta.');db.prepare("UPDATE academy_whatsapp_automation SET status='paused',template_name=?,language=?,activated_at=NULL,approved_at=NULL,updated_at=? WHERE key=?").run(name,language,clock(),key);db.prepare("UPDATE academy_whatsapp_automation_job SET status='skipped',error='Modelo alterado' WHERE automation_key=? AND status='pending'").run(key);return list();}
  async function approvedTemplates(){return provider.templates();}
  async function activate(key){const row=state(key);if(!row)throw new Error('Automação não encontrada.');if(!ready()||!provider.templatesReady())throw new Error('Conecte o número, o token e o ID da conta WhatsApp Business.');if(!row.template_name||!(await provider.approvedForAutomation(row.template_name,row.language)))throw new Error('O modelo precisa estar aprovado na Meta e conter somente {{1}} no corpo.');const time=clock();db.prepare("UPDATE academy_whatsapp_automation SET status='active',activated_at=?,approved_at=?,updated_at=? WHERE key=?").run(time,time,time,key);return list();}
  async function activateApproved(){if(!ready()||!provider.templatesReady())throw new Error('Conecte a conta WhatsApp Business antes de ativar.');const approved=new Set((await provider.templates()).filter(compatibleAutomationTemplate).map(x=>`${x.name}:${x.language}`)),time=clock();let activated=0;for(const row of db.prepare('SELECT * FROM academy_whatsapp_automation').all()){if(row.status==='active'||!row.template_name||!approved.has(`${row.template_name}:${row.language}`))continue;db.prepare("UPDATE academy_whatsapp_automation SET status='active',activated_at=?,approved_at=?,updated_at=? WHERE key=?").run(time,time,time,row.key);activated++;}return {...list(),activated};}
  function pause(key){if(!state(key))throw new Error('Automação não encontrada.');db.prepare("UPDATE academy_whatsapp_automation SET status='paused',updated_at=? WHERE key=?").run(clock(),key);db.prepare("UPDATE academy_whatsapp_automation_job SET status='skipped',error='Automação pausada' WHERE automation_key=? AND status='pending'").run(key);return list();}
  const enqueue=(key,userId,entityKey)=>{const recipient=person(userId);if(!recipient||!entityKey)return 0;const id=randomUUID(),time=clock();return db.prepare("INSERT OR IGNORE INTO academy_whatsapp_automation_job(id,automation_key,user_id,entity_key,phone,scheduled_at,status,created_at) VALUES(?,?,?,?,?,?,'pending',?)").run(id,key,userId,entityKey,recipient.phone,time,time).changes;};
  function enqueueEvents(){let queued=0;for(const row of db.prepare("SELECT * FROM academy_whatsapp_automation WHERE status='active' AND template_name IS NOT NULL").all()){
    if(row.key==='welcome'){
      for(const item of db.prepare('SELECT o.user_id,o.completed_at FROM academy_onboarding o JOIN academy_member m ON m.user_id=o.user_id AND m.enabled=1 WHERE o.completed_at>=?').all(row.activated_at))queued+=enqueue(row.key,item.user_id,`welcome:${item.user_id}:${item.completed_at}`);
    }else if(row.key==='certificate_available'){
      for(const item of db.prepare('SELECT user_id,id FROM academy_certificate WHERE issued_at>=?').all(row.activated_at))queued+=enqueue(row.key,item.user_id,`certificate:${item.id}`);
    }else for(const item of eligibility.forKey(row.key,row.activated_at))queued+=enqueue(row.key,item.user?.user_id,item.entityKey);
  }return queued;}
  const sendWindow=()=>{const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/Fortaleza',weekday:'short',hour:'2-digit',hourCycle:'h23'}).formatToParts(new Date(clock()));const day=parts.find(x=>x.type==='weekday')?.value,hour=Number(parts.find(x=>x.type==='hour')?.value);return !['Sat','Sun'].includes(day)&&hour>=9&&hour<18;};
  const nextAllowed=userId=>{const auto=db.prepare("SELECT accepted_at FROM academy_whatsapp_automation_job WHERE user_id=? AND status='accepted' ORDER BY accepted_at DESC LIMIT 1").get(userId)?.accepted_at,manual=db.prepare("SELECT accepted_at FROM academy_whatsapp_delivery WHERE user_id=? AND status='accepted' ORDER BY accepted_at DESC LIMIT 1").get(userId)?.accepted_at,last=[auto,manual].filter(Boolean).sort().at(-1);if(!last)return null;const next=Date.parse(last)+7*86400000;return next>Date.parse(clock())?new Date(next).toISOString():null;};
  let running=false;
  async function tick(){if(running||!ready())return {queued:0,accepted:0,failed:0};running=true;let queued=0,accepted=0,failed=0;try{
    queued=enqueueEvents();if(!sendWindow())return {queued,accepted,failed};
    const due=db.prepare("SELECT * FROM academy_whatsapp_automation_job WHERE status='pending' AND scheduled_at<=? ORDER BY scheduled_at LIMIT 5").all(clock());
    const approved=!sendTemplate&&due.length?new Set((await provider.templates()).filter(compatibleAutomationTemplate).map(x=>`${x.name}:${x.language}`)):null;
    for(const job of due){
      const row=state(job.automation_key),recipient=person(job.user_id);
      if(!row||row.status!=='active'||!recipient||recipient.phone!==job.phone){db.prepare("UPDATE academy_whatsapp_automation_job SET status='skipped',error='Acesso, telefone ou autorização alterados' WHERE id=?").run(job.id);continue;}
      if(approved&&!approved.has(`${row.template_name}:${row.language}`)){pause(row.key);continue;}
      if(Date.parse(clock())-Date.parse(job.created_at)>14*86400000){db.prepare("UPDATE academy_whatsapp_automation_job SET status='skipped',error='Evento expirado' WHERE id=?").run(job.id);continue;}
      const next=nextAllowed(job.user_id);if(next){db.prepare('UPDATE academy_whatsapp_automation_job SET scheduled_at=? WHERE id=?').run(next,job.id);continue;}
      db.prepare("UPDATE academy_whatsapp_automation_job SET status='sending' WHERE id=? AND status='pending'").run(job.id);
      try{const messageId=sendTemplate?await sendTemplate(recipient,{template_name:row.template_name,language:row.language,use_first_name:true}):await provider.send(recipient.phone,row.template_name,row.language,firstName(recipient.name));db.prepare("UPDATE academy_whatsapp_automation_job SET status='accepted',message_id=?,accepted_at=? WHERE id=?").run(messageId,clock(),job.id);receipts?.accepted(messageId);accepted++;}
      catch(error){db.prepare("UPDATE academy_whatsapp_automation_job SET status='unknown',error=? WHERE id=?").run(String(error.message||error).slice(0,200),job.id);failed++;}
    }
    return {queued,accepted,failed};
  }finally{running=false;}}
  return {list,save,approvedTemplates,activate,activateApproved,pause,tick};
}
