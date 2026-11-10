import {randomUUID,randomBytes} from 'node:crypto';
import nodemailer from 'nodemailer';

const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const now=()=>new Date().toISOString();
const token=()=>randomBytes(24).toString('hex');

export function createCampaignService(db,{env=process.env,baseURL,mailerTransport=null}){
  db.exec(`CREATE TABLE IF NOT EXISTS academy_campaign(id TEXT PRIMARY KEY,title TEXT NOT NULL,subject TEXT NOT NULL,body TEXT NOT NULL,cta_label TEXT,cta_url TEXT,recipient_ids_json TEXT NOT NULL,status TEXT NOT NULL,created_by TEXT NOT NULL,created_at TEXT NOT NULL,sent_at TEXT);
    CREATE TABLE IF NOT EXISTS academy_campaign_delivery(id TEXT PRIMARY KEY,campaign_id TEXT NOT NULL,user_id TEXT NOT NULL,name TEXT NOT NULL,email TEXT NOT NULL,token TEXT NOT NULL UNIQUE,status TEXT NOT NULL,message_id TEXT,error TEXT,sent_at TEXT,opened_at TEXT,clicked_at TEXT);
    CREATE TABLE IF NOT EXISTS academy_campaign_optout(user_id TEXT PRIMARY KEY,created_at TEXT NOT NULL);`);
  const host=env.ACADEMY_SMTP_HOST,port=Number(env.ACADEMY_SMTP_PORT||465),user=env.ACADEMY_SMTP_USER,pass=env.ACADEMY_SMTP_PASSWORD,from=env.ACADEMY_MAIL_FROM||user;
  const transport=mailerTransport||(host&&user&&pass&&from?nodemailer.createTransport({host,port,secure:port===465,requireTLS:port!==465,auth:{user,pass},connectionTimeout:10000,greetingTimeout:10000,socketTimeout:15000}):null);
  const active=()=>db.prepare(`SELECT u.id,u.name,u.email,m.role FROM academy_member m JOIN user u ON u.id=m.user_id LEFT JOIN academy_campaign_optout o ON o.user_id=u.id WHERE m.enabled=1 AND o.user_id IS NULL ORDER BY u.name`).all();
  const campaign=id=>db.prepare('SELECT * FROM academy_campaign WHERE id=?').get(id);
  const deliveries=id=>db.prepare('SELECT id,user_id,name,email,status,error,sent_at,opened_at,clicked_at FROM academy_campaign_delivery WHERE campaign_id=? ORDER BY name').all(id);
  const summary=row=>{const items=deliveries(row.id);return {id:row.id,title:row.title,subject:row.subject,body:row.body,ctaLabel:row.cta_label,ctaUrl:row.cta_url,recipientIds:JSON.parse(row.recipient_ids_json),status:row.status,createdAt:row.created_at,sentAt:row.sent_at,metrics:{selected:JSON.parse(row.recipient_ids_json).length,accepted:items.filter(x=>x.status==='accepted').length,failed:items.filter(x=>x.status==='failed').length,unknown:items.filter(x=>x.status==='sending').length,opened:items.filter(x=>x.opened_at).length,clicked:items.filter(x=>x.clicked_at).length},deliveries:items};};
  function list(){return {smtpReady:!!transport,recipients:active(),campaigns:db.prepare('SELECT * FROM academy_campaign ORDER BY created_at DESC LIMIT 50').all().map(summary)};}
  function create(actor,input){
    const title=String(input.title||'').trim(),subject=String(input.subject||'').trim(),body=String(input.body||'').trim();
    const ids=[...new Set(Array.isArray(input.recipientIds)?input.recipientIds:[])];
    if(title.length<3||title.length>100||subject.length<5||subject.length>150||body.length<20||body.length>5000)throw new Error('Confira o nome, assunto e mensagem da campanha.');
    if(!ids.length||ids.length>50||ids.some(x=>typeof x!=='string'))throw new Error('Selecione entre 1 e 50 contas ativas.');
    const eligible=new Set(active().map(x=>x.id));if(ids.some(id=>!eligible.has(id)))throw new Error('Há destinatários sem acesso ativo ou que optaram por não receber.');
    const ctaLabel=String(input.ctaLabel||'').trim(),ctaUrl=String(input.ctaUrl||'').trim();
    if((ctaLabel&&!ctaUrl)||(!ctaLabel&&ctaUrl)||ctaLabel.length>80)throw new Error('Informe o texto e o destino do botão, ou deixe ambos vazios.');
    if(ctaUrl){let url;try{url=new URL(ctaUrl,baseURL);}catch{}if(!url||url.origin!==new URL(baseURL).origin||!url.hash.startsWith('#'))throw new Error('O botão deve apontar para uma área da ST1 Academy.');}
    const id=randomUUID();db.prepare('INSERT INTO academy_campaign(id,title,subject,body,cta_label,cta_url,recipient_ids_json,status,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)').run(id,title,subject,body,ctaLabel||null,ctaUrl||null,JSON.stringify(ids),'draft',actor,now());return summary(campaign(id));
  }
  async function send(id){
    if(!transport)throw new Error('O SMTP do Academy ainda não está configurado.');
    let row=campaign(id);if(!row)throw new Error('Campanha não encontrada.');if(row.status!=='draft')throw new Error('Esta campanha já foi iniciada.');
    const current=new Map(active().map(x=>[x.id,x]));const ids=JSON.parse(row.recipient_ids_json);
    if(ids.some(x=>!current.has(x)))throw new Error('A lista mudou. Crie uma nova campanha com os destinatários ativos.');
    for(const userId of ids){const person=current.get(userId);db.prepare('INSERT INTO academy_campaign_delivery(id,campaign_id,user_id,name,email,token,status) VALUES(?,?,?,?,?,?,?)').run(randomUUID(),id,userId,person.name,person.email,token(),'queued');}
    db.prepare("UPDATE academy_campaign SET status='sending' WHERE id=?").run(id);
    const pending=db.prepare("SELECT * FROM academy_campaign_delivery WHERE campaign_id=? AND status='queued'").all(id);
    for(const item of pending){
      db.prepare("UPDATE academy_campaign_delivery SET status='sending' WHERE id=?").run(item.id);
      const first=item.name.trim().split(/\s+/)[0],personalized=row.body.replaceAll('{{nome}}',first);
      const target=row.cta_url?new URL(row.cta_url,baseURL).href:null;
      const clickURL=`${baseURL}/api/campaigns/click/${item.token}`;
      const optURL=`${baseURL}/api/campaigns/preferences/${item.token}`;
      const html=`<div style="font:16px/1.6 Arial,sans-serif;max-width:620px;margin:auto;color:#191919"><div style="background:#111113;color:#fff;padding:24px;font-weight:bold">ST1 ACADEMY</div><h1 style="font-size:25px">${escape(row.title)}</h1><p style="white-space:pre-line">${escape(personalized)}</p>${target?`<p><a href="${escape(clickURL)}" style="display:inline-block;background:#f77716;color:#fff;padding:12px 18px;border-radius:5px;text-decoration:none;font-weight:bold">${escape(row.cta_label)}</a></p>`:''}<p style="font-size:12px;color:#666">Mensagem de incentivo da ST1 Academy. <a href="${escape(optURL)}">Parar de receber estas mensagens</a>.</p><img src="${baseURL}/api/campaigns/open/${item.token}.gif" width="1" height="1" alt=""></div>`;
      try{const info=await transport.sendMail({from:{name:'ST1 Academy',address:from},to:item.email,subject:row.subject,text:`${personalized}${target?`\n\n${row.cta_label}: ${target}`:''}\n\nParar de receber estas mensagens: ${optURL}`,html});if(info.rejected?.length)throw new Error('Destinatário recusado pelo SMTP.');db.prepare("UPDATE academy_campaign_delivery SET status='accepted',message_id=?,sent_at=? WHERE id=?").run(info.messageId,now(),item.id);}
      catch(error){db.prepare("UPDATE academy_campaign_delivery SET status='failed',error=? WHERE id=?").run(String(error.code||error.message).slice(0,160),item.id);}
    }
    db.prepare("UPDATE academy_campaign SET status='sent',sent_at=? WHERE id=?").run(now(),id);return summary(campaign(id));
  }
  function mark(kind,value){const field=kind==='open'?'opened_at':'clicked_at';const item=db.prepare('SELECT * FROM academy_campaign_delivery WHERE token=?').get(value);if(!item||item.status!=='accepted')return null;db.prepare(`UPDATE academy_campaign_delivery SET ${field}=COALESCE(${field},?) WHERE id=?`).run(now(),item.id);return campaign(item.campaign_id)?.cta_url||null;}
  function preference(value){return db.prepare('SELECT user_id,name FROM academy_campaign_delivery WHERE token=?').get(value)||null;}
  function optout(value){const item=preference(value);if(!item)return false;db.prepare('INSERT OR IGNORE INTO academy_campaign_optout(user_id,created_at) VALUES(?,?)').run(item.user_id,now());return true;}
  return {list,create,send,mark,preference,optout};
}

