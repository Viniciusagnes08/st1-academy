import {randomUUID} from 'node:crypto';

const providers=new Set(['n8n','openpanel']);
const retryDelays=[60000,300000,1800000,7200000,43200000];
const clockMs=clock=>{const value=clock(),ms=typeof value==='number'?value:Date.parse(value);return Number.isFinite(ms)?ms:Date.now();};
const iso=clock=>new Date(clockMs(clock)).toISOString();
const safeJson=value=>{const text=JSON.stringify(value??{});if(text.length>65536)throw new Error('Payload de integração excede 64 KB.');return text;};
const parse=value=>{try{return JSON.parse(value||'{}');}catch{return {};}};

export function createIntegrationOutbox(db,{clock=Date.now}={}){
  db.exec(`CREATE TABLE IF NOT EXISTS academy_integration_event(
    id TEXT PRIMARY KEY,event_type TEXT NOT NULL,schema_version INTEGER NOT NULL DEFAULT 1,
    entity_type TEXT NOT NULL,entity_id TEXT NOT NULL,payload_json TEXT NOT NULL,created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS academy_integration_delivery(
    id TEXT PRIMARY KEY,event_id TEXT NOT NULL REFERENCES academy_integration_event(id),provider TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',attempts INTEGER NOT NULL DEFAULT 0,next_attempt_at TEXT NOT NULL,
    last_attempt_at TEXT,delivered_at TEXT,last_error TEXT,UNIQUE(event_id,provider)
  );
  CREATE INDEX IF NOT EXISTS academy_integration_delivery_due_idx ON academy_integration_delivery(status,next_attempt_at);`);

  const normalize=row=>row?{
    id:row.id,eventId:row.event_id,provider:row.provider,status:row.status,attempts:Number(row.attempts||0),
    nextAttemptAt:row.next_attempt_at,lastAttemptAt:row.last_attempt_at,deliveredAt:row.delivered_at,lastError:row.last_error,
    eventType:row.event_type,schemaVersion:Number(row.schema_version||1),entityType:row.entity_type,entityId:row.entity_id,
    createdAt:row.created_at,payload:parse(row.payload_json)
  }:null;
  const joined=`SELECT d.*,e.event_type,e.schema_version,e.entity_type,e.entity_id,e.payload_json,e.created_at
    FROM academy_integration_delivery d JOIN academy_integration_event e ON e.id=d.event_id`;

  function record(eventType,{entityType='generic',entityId='unknown',payload={},schemaVersion=1}={},destinations=[]){
    if(!/^academy\.[a-z0-9_.-]{3,100}$/.test(String(eventType||'')))throw new Error('Tipo de evento de integração inválido.');
    if(!Number.isInteger(schemaVersion)||schemaVersion<1||schemaVersion>99)throw new Error('Versão de evento inválida.');
    const selected=[...new Set(destinations)].filter(provider=>providers.has(provider));
    const id=randomUUID(),createdAt=iso(clock),body=safeJson(payload);
    db.exec('BEGIN IMMEDIATE');
    try{
      db.prepare('INSERT INTO academy_integration_event(id,event_type,schema_version,entity_type,entity_id,payload_json,created_at) VALUES(?,?,?,?,?,?,?)')
        .run(id,eventType,schemaVersion,String(entityType).slice(0,80),String(entityId).slice(0,180),body,createdAt);
      const insert=db.prepare("INSERT OR IGNORE INTO academy_integration_delivery(id,event_id,provider,status,attempts,next_attempt_at) VALUES(?,?,?,'pending',0,?)");
      for(const provider of selected)insert.run(randomUUID(),id,provider,createdAt);
      db.exec('COMMIT');
    }catch(error){db.exec('ROLLBACK');throw error;}
    return {id,eventType,schemaVersion,entityType:String(entityType),entityId:String(entityId),payload,createdAt,providers:selected};
  }

  function due(limit=25){
    const current=clockMs(clock),at=new Date(current).toISOString(),staleAt=new Date(current-300000).toISOString();
    db.prepare("UPDATE academy_integration_delivery SET status='retry',next_attempt_at=?,last_error=COALESCE(last_error,'Entrega interrompida antes da confirmação; retry seguro.') WHERE status='sending' AND last_attempt_at IS NOT NULL AND last_attempt_at<=?").run(at,staleAt);
    const count=Math.max(1,Math.min(100,Number(limit)||25));
    return db.prepare(`${joined} WHERE d.status IN ('pending','retry') AND d.next_attempt_at<=? ORDER BY d.next_attempt_at,d.id LIMIT ?`).all(at,count).map(normalize);
  }
  function list({limit=100,status=null}={}){
    const count=Math.max(1,Math.min(500,Number(limit)||100));
    const rows=status?db.prepare(`${joined} WHERE d.status=? ORDER BY d.next_attempt_at DESC LIMIT ?`).all(status,count):db.prepare(`${joined} ORDER BY d.next_attempt_at DESC LIMIT ?`).all(count);
    return rows.map(normalize);
  }
  function markSending(id){const at=iso(clock);const result=db.prepare("UPDATE academy_integration_delivery SET status='sending',last_attempt_at=? WHERE id=? AND status IN ('pending','retry')").run(at,id);return result.changes===1;}
  function succeed(id){const at=iso(clock);const result=db.prepare("UPDATE academy_integration_delivery SET status='delivered',delivered_at=?,last_error=NULL WHERE id=?").run(at,id);return result.changes===1;}
  function fail(id,error,{forceDue=false}={}){
    const current=db.prepare('SELECT attempts FROM academy_integration_delivery WHERE id=?').get(id);if(!current)throw new Error('Entrega de integração não encontrada.');
    const attempts=Number(current.attempts||0)+1,failedAt=iso(clock),message=String(error?.message||error||'DELIVERY_FAILED').slice(0,500);
    if(attempts>retryDelays.length){db.prepare("UPDATE academy_integration_delivery SET status='dead_letter',attempts=?,last_attempt_at=?,last_error=? WHERE id=?").run(attempts,failedAt,message,id);return 'dead_letter';}
    const next=forceDue?failedAt:new Date(clockMs(clock)+retryDelays[attempts-1]).toISOString();
    db.prepare("UPDATE academy_integration_delivery SET status='retry',attempts=?,last_attempt_at=?,next_attempt_at=?,last_error=? WHERE id=?").run(attempts,failedAt,next,message,id);return 'retry';
  }
  function retry(id){const row=db.prepare('SELECT status FROM academy_integration_delivery WHERE id=?').get(id);if(!row)throw new Error('Entrega de integração não encontrada.');if(row.status!=='dead_letter')throw new Error('Somente uma dead letter pode ser reenfileirada.');db.prepare("UPDATE academy_integration_delivery SET status='pending',next_attempt_at=?,last_error=NULL WHERE id=?").run(iso(clock),id);return list().find(item=>item.id===id);}
  function counts(){const rows=db.prepare('SELECT status,count(*) n FROM academy_integration_delivery GROUP BY status').all();return Object.fromEntries(rows.map(row=>[row.status,Number(row.n)]));}
  return {record,due,list,markSending,succeed,fail,retry,counts};
}
