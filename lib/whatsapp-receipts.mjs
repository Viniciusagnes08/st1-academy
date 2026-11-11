import {createHmac,timingSafeEqual} from 'node:crypto';

const rank={accepted:0,sent:1,failed:2,delivered:3,read:4};
const equal=(a,b)=>{const x=Buffer.from(String(a||'')),y=Buffer.from(String(b||''));return x.length===y.length&&timingSafeEqual(x,y);};
const timestamp=value=>{const date=new Date(Number(value)*1000);return Number.isFinite(date.getTime())?date.toISOString():new Date().toISOString();};

export function createWhatsAppReceipts(db,{env=process.env}={}){
  db.exec(`CREATE TABLE IF NOT EXISTS academy_whatsapp_receipt(message_id TEXT PRIMARY KEY,status TEXT NOT NULL,sent_at TEXT,delivered_at TEXT,read_at TEXT,failed_at TEXT,error TEXT,updated_at TEXT NOT NULL);`);
  const get=id=>id?db.prepare('SELECT * FROM academy_whatsapp_receipt WHERE message_id=?').get(id)||null:null;
  function accepted(id){if(!id)return;db.prepare("INSERT OR IGNORE INTO academy_whatsapp_receipt(message_id,status,updated_at) VALUES(?,'accepted',?)").run(id,new Date().toISOString());}
  function verify(mode,token,challenge){return mode==='subscribe'&&!!env.WHATSAPP_VERIFY_TOKEN&&equal(token,env.WHATSAPP_VERIFY_TOKEN)?String(challenge||''):null;}
  function ingest(body,signature){
    const secret=env.WHATSAPP_APP_SECRET;
    if(!secret||!Buffer.isBuffer(body)||!/^sha256=[a-f0-9]{64}$/i.test(String(signature||'')))return false;
    const digest='sha256='+createHmac('sha256',secret).update(body).digest('hex');
    if(!equal(digest,signature))return false;
    let payload;try{payload=JSON.parse(body.toString('utf8'));}catch{return false;}
    if(payload.object!=='whatsapp_business_account')return true;
    for(const entry of payload.entry||[])for(const change of entry.changes||[])for(const event of change.value?.statuses||[]){
      const id=String(event.id||''),status=String(event.status||'');
      if(!Object.hasOwn(rank,status)||!id)continue;
      const known=!!db.prepare('SELECT 1 FROM academy_whatsapp_delivery WHERE message_id=?').get(id)||!!db.prepare('SELECT 1 FROM academy_whatsapp_automation_job WHERE message_id=?').get(id);
      if(!known)continue;
      const prior=get(id),at=timestamp(event.timestamp),error=status==='failed'?String(event.errors?.[0]?.message||'Falha informada pela Meta').slice(0,200):null;
      if(!prior){accepted(id);}
      const current=get(id),nextStatus=rank[status]>rank[current.status]?status:current.status;
      db.prepare('UPDATE academy_whatsapp_receipt SET status=?,sent_at=?,delivered_at=?,read_at=?,failed_at=?,error=?,updated_at=? WHERE message_id=?').run(
        nextStatus,status==='sent'?at:current.sent_at,status==='delivered'?at:current.delivered_at,status==='read'?at:current.read_at,status==='failed'?at:current.failed_at,error||current.error,new Date().toISOString(),id
      );
    }
    return true;
  }
  return {get,accepted,verify,ingest};
}
