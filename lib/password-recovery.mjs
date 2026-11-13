import {createHash} from 'node:crypto';

export const RECOVERY_EMAIL_LIMIT=3;
export const RECOVERY_IP_LIMIT=10;
export const RECOVERY_WINDOW_MS=60*60*1000;

// Persistent, origin-independent throttling; no mailbox or IP is stored in clear text.
export function createPasswordRecoveryLimiter(db,{secret,clock=Date.now}={}){
  if(typeof secret!=='string'||secret.length<32)throw new Error('Segredo de recuperação indisponível.');
  db.exec('CREATE TABLE IF NOT EXISTS academy_password_recovery_limit(fingerprint TEXT PRIMARY KEY,window_start INTEGER NOT NULL,hits INTEGER NOT NULL);');
  const fingerprint=(kind,value)=>createHash('sha256').update(secret+'|password-recovery|'+kind+'|'+value).digest('hex');
  const permit=(email,ip)=>{
    const normalized=typeof email==='string'?email.trim().toLowerCase():'';
    const emailValid=normalized.length<=254&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized);
    const now=clock();
    const limits=[{key:fingerprint('ip',String(ip||'unknown')),max:RECOVERY_IP_LIMIT}];
    if(emailValid)limits.push({key:fingerprint('email',normalized),max:RECOVERY_EMAIL_LIMIT});
    db.exec('BEGIN IMMEDIATE');
    try{
      // All checks occur under the same write lock to prevent parallel-burst bypass.
      const observations=limits.map(({key,max})=>{
        const row=db.prepare('SELECT window_start,hits FROM academy_password_recovery_limit WHERE fingerprint=?').get(key);
        return {key,max,hits:row&&now-row.window_start<RECOVERY_WINDOW_MS?row.hits:0,windowStart:row&&now-row.window_start<RECOVERY_WINDOW_MS?row.window_start:now};
      });
      const accepted=emailValid&&observations.every(row=>row.hits<row.max);
      // Always account for IP requests, even if the e-mail is invalid or already throttled.
      const rows=accepted?observations:observations.slice(0,1);
      for(const row of rows){
        db.prepare('INSERT INTO academy_password_recovery_limit(fingerprint,window_start,hits) VALUES(?,?,?) ON CONFLICT(fingerprint) DO UPDATE SET window_start=excluded.window_start,hits=excluded.hits')
          .run(row.key,row.windowStart,Math.min(row.hits+1,row.max));
      }
      db.prepare('DELETE FROM academy_password_recovery_limit WHERE window_start<?').run(now-RECOVERY_WINDOW_MS);
      db.exec('COMMIT');
      return accepted;
    }catch(error){db.exec('ROLLBACK');throw error;}
  };
  return {permit};
}
