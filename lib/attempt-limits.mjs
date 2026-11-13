import {randomUUID} from 'node:crypto';
import {hasPermission,hasTrack,readProfile} from './access.mjs';

const fail=(message,status=400)=>Object.assign(new Error(message),{status});
export const ATTEMPT_LIMIT=3;

// Quotas are scoped to a particular assessment and content version.
export function createAttemptLimitService(db,bank,access,{clock=Date.now}={}){
  db.exec("CREATE TABLE IF NOT EXISTS academy_attempt_grant(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES user(id),kind TEXT NOT NULL CHECK(kind IN ('certificate','quiz')),assessment_id TEXT NOT NULL,version TEXT NOT NULL,actor_id TEXT NOT NULL REFERENCES user(id),reason TEXT NOT NULL,created_at TEXT NOT NULL); CREATE INDEX IF NOT EXISTS academy_attempt_grant_scope_idx ON academy_attempt_grant(user_id,kind,assessment_id,version); CREATE TABLE IF NOT EXISTS academy_attempt_lock(user_id TEXT NOT NULL REFERENCES user(id),kind TEXT NOT NULL CHECK(kind IN ('certificate','quiz')),assessment_id TEXT NOT NULL,version TEXT NOT NULL,PRIMARY KEY(user_id,kind,assessment_id,version));");
  const assessment=(kind,id)=>{
    if(kind==='certificate'){
      const track=bank.tracks.find(t=>t.id===id);
      return track?{kind,id,version:String(track.version),title:track.name,tracks:[id]}:null;
    }
    if(kind==='quiz'){
      const quiz=db.prepare('SELECT id,title,version,tracks_json FROM academy_quiz WHERE id=?').get(id);
      return quiz?{kind,id,version:String(quiz.version),title:quiz.title,tracks:JSON.parse(quiz.tracks_json)}:null;
    }
    return null;
  };
  const allowed=(person,item)=>person&&person.enabled===1&&hasPermission(person,'assessments')&&item.tracks.some(t=>hasTrack(person,t));
  const quota=(userId,kind,id,version)=>{
    const table=kind==='certificate'?'academy_attempt':'academy_quiz_attempt',column=kind==='certificate'?'track_id':'quiz_id';
    const used=db.prepare('SELECT count(*) n FROM '+table+' WHERE user_id=? AND '+column+'=? AND version=?').get(userId,id,version).n;
    const extra=db.prepare('SELECT count(*) n FROM academy_attempt_grant WHERE user_id=? AND kind=? AND assessment_id=? AND version=?').get(userId,kind,id,String(version)).n;
    const max=ATTEMPT_LIMIT+extra;
    const active=db.prepare(kind==='certificate'?"SELECT id FROM academy_attempt WHERE user_id=? AND track_id=? AND version=? AND status='open' LIMIT 1":"SELECT id,expires_at FROM academy_quiz_attempt WHERE user_id=? AND quiz_id=? AND version=? AND status='open' LIMIT 1").get(userId,id,version);
    const inProgress=!!active&&(!active.expires_at||Date.parse(active.expires_at)>clock());
    const expiredOpen=kind==='quiz'&&!!active&&!!active.expires_at&&Date.parse(active.expires_at)<=clock();
    return {used,max,remaining:Math.max(0,max-used),blocked:used>=max,requiresAuthorization:used>=max&&!inProgress,inProgress,expiredOpen};
  };
  const lock=(userId,kind,id,version)=>{
    const key=[userId,kind,String(id),String(version)];
    db.prepare('INSERT OR IGNORE INTO academy_attempt_lock(user_id,kind,assessment_id,version) VALUES(?,?,?,?)').run(...key);
    if(db.engine==='postgres')db.prepare('SELECT user_id FROM academy_attempt_lock WHERE user_id=? AND kind=? AND assessment_id=? AND version=? FOR UPDATE').get(...key);
  };
  const status=(viewer,kind,id,userId=viewer.user_id)=>{
    const item=assessment(kind,id),person=readProfile(db,userId);
    if(!item||!allowed(person,item))throw fail('Avaliação não encontrada ou não liberada.',404);
    if(viewer.user_id!==userId&&!canManage(viewer,userId,item))throw fail('Avaliação não encontrada ou não liberada.',404);
    return {kind,id,title:item.title,version:item.version,...quota(userId,kind,id,item.version)};
  };
  const canManage=(actor,userId,item)=>{
    if(actor?.enabled!==1)return false;
    if(actor.role==='admin')return true;
    if(actor.role!=='supervisor'||!hasPermission(actor,'team_results')||!item.tracks.some(id=>hasTrack(actor,id)))return false;
    return !!db.prepare("SELECT 1 FROM academy_supervision s JOIN academy_member m ON m.user_id=s.seller_id WHERE s.supervisor_id=? AND s.seller_id=? AND m.role='seller' AND m.enabled=1").get(actor.user_id,userId);
  };
  const assertAvailable=(userId,kind,id,version)=>{
    const q=quota(userId,kind,id,version);
    if(q.blocked)throw fail('Você utilizou todas as '+ATTEMPT_LIMIT+' tentativas iniciais desta avaliação. Solicite uma nova autorização ao seu Supervisor ou Admin.',423);
    return q;
  };
  const grant=(actor,input)=>{
    const {userId,kind,id}=input||{};
    if(typeof userId!=='string'||typeof id!=='string'||userId.length>160||id.length>160)throw fail('Informe o participante e a avaliação.');
    const reason=input?.reason;
    if(typeof reason!=='string'||reason.trim().length<10||reason.length>500)throw fail('Explique a liberação em pelo menos 10 caracteres e no máximo 500.');
    const item=assessment(kind,id),person=readProfile(db,userId);
    if(!item||!allowed(person,item))throw fail('Participante ou avaliação indisponível.',404);
    if(!canManage(actor,userId,item))throw fail('Você não pode autorizar tentativas desta pessoa.',403);
    db.exec('BEGIN IMMEDIATE');
    try{
      lock(userId,kind,id,item.version);
      const currentActor=readProfile(db,actor.user_id),currentPerson=readProfile(db,userId),currentItem=assessment(kind,id);
      if(!currentItem||!allowed(currentPerson,currentItem))throw fail('Participante ou avaliação indisponível.',404);
      if(!canManage(currentActor,userId,currentItem))throw fail('Você não pode autorizar tentativas desta pessoa.',403);
      const current=quota(userId,kind,id,item.version);
      if(!current.requiresAuthorization)throw fail('Ainda existem tentativas disponíveis ou uma avaliação em andamento.',409);
      const granted={id:randomUUID(),userId,kind,assessmentId:id,version:item.version,actorId:currentActor.user_id,reason:reason.trim(),createdAt:new Date(clock()).toISOString()};
      db.prepare('INSERT INTO academy_attempt_grant(id,user_id,kind,assessment_id,version,actor_id,reason,created_at) VALUES(?,?,?,?,?,?,?,?)').run(granted.id,userId,kind,id,item.version,currentActor.user_id,granted.reason,granted.createdAt);
      access.audit(currentActor.user_id,userId,'assessment.attempt_authorized',null,{kind,assessmentId:id,version:item.version,reason:granted.reason,grantId:granted.id});
      db.exec('COMMIT');
      return {...granted,quota:quota(userId,kind,id,item.version)};
    }catch(error){db.exec('ROLLBACK');throw error;}
  };
  const blocked=(actor)=>{
    if(actor?.role!=='admin'&&!(actor?.role==='supervisor'&&hasPermission(actor,'team_results')))throw fail('Acesso reservado à gestão.',403);
    const people=db.prepare("SELECT m.user_id,u.name,m.role FROM academy_member m JOIN user u ON u.id=m.user_id WHERE m.enabled=1 AND m.role IN ('seller','supervisor')").all();
    const items=[];
    for(const person of people){
      for(const track of bank.tracks){
        const item=assessment('certificate',track.id);
        if(!allowed(readProfile(db,person.user_id),item)||!canManage(actor,person.user_id,item))continue;
        const q=quota(person.user_id,'certificate',track.id,item.version);
        if(q.requiresAuthorization)items.push({userId:person.user_id,name:person.name,kind:'certificate',assessmentId:track.id,title:track.name,version:item.version,...q});
      }
      // Include quizzes with at least one attempt; this avoids enumerating untouched assessments.
      for(const r of db.prepare('SELECT DISTINCT quiz_id FROM academy_quiz_attempt WHERE user_id=?').all(person.user_id)){
        const item=assessment('quiz',r.quiz_id);
        if(!item||!allowed(readProfile(db,person.user_id),item)||!canManage(actor,person.user_id,item))continue;
        const q=quota(person.user_id,'quiz',item.id,item.version);
        if(q.requiresAuthorization)items.push({userId:person.user_id,name:person.name,kind:'quiz',assessmentId:item.id,title:item.title,version:item.version,...q});
      }
    }
    return items.sort((a,b)=>a.name.localeCompare(b.name,'pt-BR')||a.title.localeCompare(b.title,'pt-BR'));
  };
  return {status,quota,lock,assertAvailable,grant,blocked};
}
