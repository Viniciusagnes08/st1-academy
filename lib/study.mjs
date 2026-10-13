import {randomUUID} from 'node:crypto';
import {hasPermission} from './access.mjs';
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
export const studyDay=timestamp=>new Date(timestamp).toLocaleDateString('en-CA',{timeZone:'America/Fortaleza'});
export function createStudyService(db,contents,{clock=Date.now}={}){
  db.exec("CREATE TABLE IF NOT EXISTS academy_study_day(user_id TEXT NOT NULL REFERENCES user(id),day TEXT NOT NULL,active_seconds REAL NOT NULL DEFAULT 0,PRIMARY KEY(user_id,day)); CREATE TABLE IF NOT EXISTS academy_study_session(id TEXT PRIMARY KEY,user_id TEXT NOT NULL UNIQUE REFERENCES user(id),content_id TEXT NOT NULL,revision INTEGER NOT NULL,last_ping INTEGER NOT NULL,expires_at INTEGER NOT NULL);");
  const permitted=(viewer,id)=>{if(!hasPermission(viewer,'materials'))throw fail('Conteúdo não liberado.',403);const item=contents.detail(viewer,id);if(item.status!=='published')throw fail('Estude um conteúdo publicado.',400);return item;};
  const start=(viewer,id)=>{
    const item=permitted(viewer,id),now=clock(),sessionId=randomUUID();
    db.prepare('INSERT INTO academy_study_session(id,user_id,content_id,revision,last_ping,expires_at) VALUES(?,?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET id=excluded.id,content_id=excluded.content_id,revision=excluded.revision,last_ping=excluded.last_ping,expires_at=excluded.expires_at').run(sessionId,viewer.user_id,id,item.revision,now,now+7200000);
    return {id:sessionId,intervalSeconds:15};
  };
  const heartbeat=(viewer,id)=>{
    const session=db.prepare('SELECT * FROM academy_study_session WHERE id=? AND user_id=?').get(id,viewer.user_id),now=clock();
    if(!session||session.expires_at<=now)throw fail('Sessão de estudo encerrada.',404);
    const item=permitted(viewer,session.content_id);if(item.revision!==session.revision)throw fail('O material mudou. Reabra para continuar.',409);
    const elapsed=(now-session.last_ping)/1000;if(elapsed<8)return {counted:false};
    db.exec('BEGIN IMMEDIATE');
    try{
      db.prepare('UPDATE academy_study_session SET last_ping=? WHERE id=?').run(now,id);
      if(elapsed<=40)db.prepare('INSERT INTO academy_study_day(user_id,day,active_seconds) VALUES(?,?,?) ON CONFLICT(user_id,day) DO UPDATE SET active_seconds=academy_study_day.active_seconds+excluded.active_seconds').run(viewer.user_id,studyDay(now),Math.min(15,elapsed));
      db.exec('COMMIT');return {counted:elapsed<=40};
    }catch(error){db.exec('ROLLBACK');throw error;}
  };
  const stats=userId=>{
    const dates=new Set(db.prepare('SELECT day FROM academy_study_day WHERE user_id=? AND active_seconds>=45').all(userId).map(r=>r.day));
    for(const row of db.prepare("SELECT finished_at FROM academy_attempt WHERE user_id=? AND status='complete'").all(userId))if(row.finished_at)dates.add(studyDay(row.finished_at));
    for(const row of db.prepare("SELECT finished_at,answers_json FROM academy_quiz_attempt WHERE user_id=? AND status='complete'").all(userId))if(row.finished_at&&Object.keys(JSON.parse(row.answers_json)).length)dates.add(studyDay(row.finished_at));
    const ordered=[...dates].sort(),today=studyDay(clock());let streak=0,best=0,run=0,last=null,cursor=clock();
    if(!dates.has(today))cursor-=86400000;
    while(dates.has(studyDay(cursor))){streak++;cursor-=86400000;}
    for(const value of ordered){run=last&&Date.parse(value)-Date.parse(last)===86400000?run+1:1;best=Math.max(best,run);last=value;}
    return {streak,bestStreak:best,totalDays:dates.size,today:dates.has(today),calendar:Array.from({length:28},(_,i)=>{const date=studyDay(clock()-(27-i)*86400000);return {date,studied:dates.has(date)};})};
  };
  return {start,heartbeat,stats};
}
