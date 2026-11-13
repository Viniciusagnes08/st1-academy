import {randomUUID} from 'node:crypto';
import {hasPermission,hasTrack} from './access.mjs';
import {publicQuestion,shuffle} from './grading.mjs';
import {createReadBatch} from './learning-read-batch.mjs';
import {biQuizzes} from '../content/bi-course.mjs';
import {databaseAssessmentDrafts} from '../content/database-assessments.mjs';

const fail=(message,status=400)=>Object.assign(new Error(message),{status});
const clean=(value,max,label)=>{if(typeof value!=='string'||value.length>max||/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(value))throw fail(label+' inválido.');return value.trim();};
export function gradePractice(questions,answers){
  const details=questions.map(q=>({id:q.id,topic:q.topic,stem:q.stem,correct:answers[q.id]===q.answer,critical:q.critical,chosen:q.options.find(o=>o.id===answers[q.id])?.text||'Não respondida',expected:q.options.find(o=>o.id===q.answer).text,explanation:q.explanation,source:q.source}));
  const correct=details.filter(q=>q.correct).length,score=Math.round(correct/questions.length*100),failedCritical=details.filter(q=>q.critical&&!q.correct).length;
  return {score,correct,total:questions.length,failedCritical,approved:score>=80&&failedCritical===0,details};
}
export function createQuizService(db,bank,access,{onPassed,canStart,attemptLimits,clock=Date.now}){
  db.exec(`CREATE TABLE IF NOT EXISTS academy_quiz(id TEXT PRIMARY KEY,title TEXT NOT NULL,description TEXT NOT NULL,type TEXT NOT NULL,status TEXT NOT NULL,version INTEGER NOT NULL DEFAULT 1,revision INTEGER NOT NULL DEFAULT 0,tracks_json TEXT NOT NULL,audience_json TEXT NOT NULL,duration_seconds INTEGER,questions_private TEXT NOT NULL,topic TEXT,step_order INTEGER,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS academy_quiz_attempt(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES user(id),quiz_id TEXT NOT NULL REFERENCES academy_quiz(id),version INTEGER NOT NULL,title TEXT NOT NULL,type TEXT NOT NULL,tracks_json TEXT NOT NULL,questions_private TEXT NOT NULL,answers_json TEXT NOT NULL DEFAULT '{}',revision INTEGER NOT NULL DEFAULT 0,status TEXT NOT NULL DEFAULT 'open',started_at TEXT NOT NULL,expires_at TEXT,finished_at TEXT,result_json TEXT);
    CREATE UNIQUE INDEX IF NOT EXISTS academy_quiz_open_idx ON academy_quiz_attempt(user_id,quiz_id,version) WHERE status='open';`);
  const batch=createReadBatch();
  const row=id=>batch.active()?batch.get('quizzes',()=>new Map(db.prepare('SELECT * FROM academy_quiz').all().map(r=>[r.id,r]))).get(id):db.prepare('SELECT * FROM academy_quiz WHERE id=?').get(id);
  const parsed=r=>({...r,tracks:JSON.parse(r.tracks_json),audience:JSON.parse(r.audience_json),questions:JSON.parse(r.questions_private)});
  const summary=r=>({id:r.id,title:r.title,description:r.description,type:r.type,status:r.status,version:r.version,revision:r.revision,tracks:JSON.parse(r.tracks_json),audience:JSON.parse(r.audience_json),durationSeconds:r.duration_seconds,questionCount:JSON.parse(r.questions_private).length,topic:r.topic,stepOrder:r.step_order});
  const readable=(viewer,r)=>!!r&&hasPermission(viewer,'assessments')&&(viewer.role==='admin'||r.status==='published'&&JSON.parse(r.audience_json).includes(viewer.role)&&JSON.parse(r.tracks_json).some(id=>hasTrack(viewer,id)));
  const scope=(viewer,r)=>{
    const tracks=JSON.parse(r.tracks_json).filter(id=>hasTrack(viewer,id));
    const allowed=new Set(bank.tracks.filter(t=>tracks.includes(t.id)).flatMap(t=>t.questions.map(q=>q.id)));
    const bankIds=new Set(bank.tracks.flatMap(t=>t.questions.map(q=>q.id)));
    const questions=JSON.parse(r.questions_private).filter(q=>!bankIds.has(q.id)||allowed.has(q.id));
    return {tracks,questions};
  };
  const detail=(viewer,id)=>{const r=row(id);if(!readable(viewer,r))throw fail('Desafio não encontrado ou não liberado.',404);const selection=scope(viewer,r);if(!selection.questions.length)throw fail('Este desafio não tem perguntas nas suas trilhas liberadas.',404);return {...summary(r),tracks:selection.tracks,questionCount:selection.questions.length,attemptLimit:attemptLimits.status(viewer,'quiz',id)};};
  const validateAnswers=(questions,answers)=>{if(!answers||typeof answers!=='object'||Array.isArray(answers))throw fail('Respostas inválidas.');for(const [id,value] of Object.entries(answers)){const q=questions.find(q=>q.id===id);if(!q||!q.options.some(o=>o.id===value))throw fail('Uma resposta não pertence a esta tentativa.');}};
  const normalize=input=>{
    const title=clean(input.title,100,'Título'),description=clean(input.description??'',280,'Descrição');if(title.length<3)throw fail('O título precisa ter pelo menos 3 caracteres.');
    if(!Array.isArray(input.tracks)||!input.tracks.length||input.tracks.some(id=>!bank.tracks.some(t=>t.id===id)))throw fail('Escolha pelo menos uma trilha válida.');
    if(!Array.isArray(input.audience)||!input.audience.length||input.audience.some(role=>!['seller','supervisor'].includes(role)))throw fail('Escolha Vendedores e/ou Supervisores.');
    if(!['draft','published','archived'].includes(input.status))throw fail('Escolha um status válido.');
    if(!Number.isInteger(input.durationSeconds)||input.durationSeconds<20||input.durationSeconds>3600)throw fail('Escolha de 20 a 3.600 segundos.');
    let questions;
    if(input.questionIds){if(!Array.isArray(input.questionIds)||!input.questionIds.length||input.questionIds.length>20)throw fail('Escolha de 1 a 20 perguntas.');const pool=bank.tracks.filter(t=>input.tracks.includes(t.id)).flatMap(t=>t.questions);questions=[...new Set(input.questionIds)].map(id=>{const q=pool.find(q=>q.id===id);if(!q)throw fail('Pergunta não encontrada na trilha selecionada.');return q;});}
    else {if(!Array.isArray(input.questions)||!input.questions.length||input.questions.length>20)throw fail('Crie de 1 a 20 perguntas.');questions=input.questions.map(q=>{const stem=clean(q.stem,600,'Pergunta'),topic=clean(q.topic||'Conhecimento',60,'Tema'),explanation=clean(q.explanation??'',800,'Explicação');if(stem.length<5||!Array.isArray(q.options)||q.options.length!==4||!Number.isInteger(q.correctIndex)||q.correctIndex<0||q.correctIndex>3||typeof q.critical!=='boolean')throw fail('Cada pergunta precisa de quatro alternativas e uma resposta correta.');const id='custom-'+randomUUID(),options=q.options.map((value,index)=>({id:id+'-'+index,text:clean(value,300,'Alternativa')}));if(options.some(o=>!o.text))throw fail('Preencha as quatro alternativas.');return {id,stem,topic,explanation,critical:q.critical,options,answer:options[q.correctIndex].id};});}
    return {title,description,tracks:[...new Set(input.tracks)],audience:[...new Set(input.audience)],status:input.status,durationSeconds:input.durationSeconds,questions};
  };
  const transaction=work=>{db.exec('BEGIN IMMEDIATE');try{const result=work();db.exec('COMMIT');return result;}catch(error){db.exec('ROLLBACK');throw error;}};
  // Administrative edits keep the assessment version and its one-time XP award.
  const questionKey=q=>JSON.stringify([q.stem,q.topic,!!q.critical,q.options.map(o=>o.text),q.options.findIndex(o=>o.id===q.answer)]);
  const save=(actor,id,input)=>{
    const current=id?row(id):null;
    if(id&&!current)throw fail('Desafio não encontrado.',404);
    if(current?.type==='checkpoint')throw fail('As etapas seguem as perguntas aprovadas das trilhas.');
    if(current&&input.revision!==current.revision)throw fail('O desafio mudou. Reabra para continuar.',409);
    const v=normalize(input),previous=current?JSON.parse(current.questions_private):[];
    const sameQuestions=current&&JSON.stringify(previous.map(questionKey).sort())===JSON.stringify(v.questions.map(questionKey).sort());
    if(sameQuestions){
      const matches=new Map();
      for(const q of previous){const key=questionKey(q);if(!matches.has(key))matches.set(key,[]);matches.get(key).push(q);}
      v.questions=v.questions.map(q=>{const prior=matches.get(questionKey(q)).shift();return {...q,id:prior.id,options:q.options.map((o,index)=>({...o,id:prior.options[index].id})),answer:prior.answer};});
    }
    id??=randomUUID();
    return transaction(()=>{
      const now=new Date(clock()).toISOString();
      if(current)db.prepare('UPDATE academy_quiz SET title=?,description=?,status=?,tracks_json=?,audience_json=?,duration_seconds=?,questions_private=?,version=?,revision=revision+1,updated_at=? WHERE id=? AND revision=?').run(v.title,v.description,v.status,JSON.stringify(v.tracks),JSON.stringify(v.audience),v.durationSeconds,JSON.stringify(v.questions),current.version+(sameQuestions?0:1),now,id,current.revision);
      else db.prepare('INSERT INTO academy_quiz(id,title,description,type,status,tracks_json,audience_json,duration_seconds,questions_private,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(id,v.title,v.description,'flash',v.status,JSON.stringify(v.tracks),JSON.stringify(v.audience),v.durationSeconds,JSON.stringify(v.questions),now,now);
      access.audit(actor,id,current?'quiz.updated':'quiz.created',current?summary(current):null,summary(row(id)));
      return summary(row(id));
    });
  };
  const adminDetail=id=>{const r=row(id);if(!r)throw fail('Desafio não encontrado.',404);const questions=JSON.parse(r.questions_private),builtFromBank=questions.every(q=>bank.tracks.some(t=>t.questions.some(item=>item.id===q.id)));return {...summary(r),questionIds:builtFromBank?questions.map(q=>q.id):null,questions:questions.map(q=>({stem:q.stem,topic:q.topic,explanation:q.explanation,options:q.options.map(o=>o.text),correctIndex:q.options.findIndex(o=>o.id===q.answer),critical:!!q.critical}))};};
  const list=(viewer,type)=>db.prepare('SELECT * FROM academy_quiz ORDER BY created_at,id').all().filter(r=>readable(viewer,r)&&(!type||r.type===type)&&scope(viewer,r).questions.length).map(r=>({...detail(viewer,r.id),locked:r.type==='checkpoint'&&!canStart(viewer,parsed(r))}));
  const adminList=()=>db.prepare('SELECT * FROM academy_quiz ORDER BY type,created_at,id').all().map(summary);
  const seed=()=>{const now=new Date(clock()).toISOString();for(const track of bank.tracks){if(track.id==='bi'||track.trainingOnly)continue;const topics=[...new Set(track.questions.map(q=>q.topic))],steps=topics.map(topic=>({topic,questions:track.questions.filter(q=>q.topic===topic).slice(0,5)}));steps.push({topic:'Regras críticas',questions:track.questions.filter(q=>q.critical)});for(const [index,step] of steps.entries()){if(!step.questions.length)continue;const id='etapa-'+track.id+'-'+index;if(!row(id))db.prepare('INSERT INTO academy_quiz(id,title,description,type,status,tracks_json,audience_json,questions_private,topic,step_order,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run(id,step.topic+' | '+track.name,'Pratique situações da trilha '+track.name+' e valide esta etapa.','checkpoint','published',JSON.stringify([track.id]),'["seller","supervisor"]',JSON.stringify(step.questions),step.topic,index,now,now);}const id='relampago-'+track.id;if(!row(id))db.prepare('INSERT INTO academy_quiz(id,title,description,type,status,tracks_json,audience_json,duration_seconds,questions_private,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(id,'Sprint '+track.name,'Reforce seu conhecimento em uma rodada rápida.','flash','draft',JSON.stringify([track.id]),'["seller","supervisor"]',120,JSON.stringify(track.questions.slice(0,3)),now,now);}for(const quiz of biQuizzes)if(!row(quiz.id))db.prepare('INSERT INTO academy_quiz(id,title,description,type,status,tracks_json,audience_json,duration_seconds,questions_private,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(quiz.id,quiz.title,quiz.description,quiz.type,quiz.status,JSON.stringify(quiz.tracks),JSON.stringify(quiz.audience),quiz.durationSeconds,JSON.stringify(quiz.questions),now,now);for(const quiz of databaseAssessmentDrafts)if(!row(quiz.id))db.prepare('INSERT INTO academy_quiz(id,title,description,type,status,tracks_json,audience_json,duration_seconds,questions_private,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(quiz.id,quiz.title,quiz.description,quiz.type,quiz.status,JSON.stringify(quiz.tracks),JSON.stringify(quiz.audience),quiz.durationSeconds,JSON.stringify(quiz.questions),now,now);};
  const own=(viewer,id)=>{const attempt=db.prepare('SELECT * FROM academy_quiz_attempt WHERE id=? AND user_id=?').get(id,viewer.user_id);if(!attempt||!readable(viewer,row(attempt.quiz_id))||!JSON.parse(attempt.tracks_json).every(track=>hasTrack(viewer,track)))throw fail('Tentativa não encontrada ou não liberada.',404);return attempt;};
  const payload=attempt=>({id:attempt.id,quizId:attempt.quiz_id,title:attempt.title,type:attempt.type,version:attempt.version,status:attempt.status,revision:attempt.revision,tracks:JSON.parse(attempt.tracks_json),questions:JSON.parse(attempt.questions_private).map(publicQuestion),answers:JSON.parse(attempt.answers_json),startedAt:attempt.started_at,expiresAt:attempt.expires_at,serverNow:new Date(clock()).toISOString(),result:attempt.result_json?JSON.parse(attempt.result_json):null});
  const complete=(attempt,answers)=>transaction(()=>{const result=gradePractice(JSON.parse(attempt.questions_private),answers);result.pointsAwarded=result.approved?onPassed(attempt):0;db.prepare("UPDATE academy_quiz_attempt SET answers_json=?,result_json=?,status='complete',revision=revision+1,finished_at=? WHERE id=? AND status='open'").run(JSON.stringify(answers),JSON.stringify(result),new Date(clock()).toISOString(),attempt.id);return payload(db.prepare('SELECT * FROM academy_quiz_attempt WHERE id=?').get(attempt.id));});
  const expired=attempt=>attempt.status==='open'&&attempt.expires_at&&clock()>=Date.parse(attempt.expires_at);
  const get=(viewer,id)=>{const attempt=own(viewer,id);return expired(attempt)?complete(attempt,JSON.parse(attempt.answers_json)):payload(attempt);};
  const start=(viewer,id)=>{
    const quiz=row(id);detail(viewer,id);
    if(quiz.type==='checkpoint'&&!canStart(viewer,parsed(quiz)))throw fail('Valide a etapa anterior para avançar.',403);
    const findOpen=()=>db.prepare("SELECT * FROM academy_quiz_attempt WHERE user_id=? AND quiz_id=? AND version=? AND status='open'").get(viewer.user_id,id,quiz.version);
    let old=findOpen();
    if(old&&!JSON.parse(old.tracks_json).every(track=>hasTrack(viewer,track)))throw fail('Uma trilha desta tentativa foi revogada. Procure o Admin.',403);
    if(old&&!expired(old))return payload(old);
    if(old)return complete(old,JSON.parse(old.answers_json));
    return transaction(()=>{
      // Serialize by person, assessment and version; PostgreSQL's BEGIN is not a
      // write lock, so the lock row protects the quota and the open-attempt check.
      attemptLimits.lock(viewer.user_id,'quiz',id,quiz.version);
      old=findOpen();
      if(old)return payload(old);
      attemptLimits.assertAvailable(viewer.user_id,'quiz',id,quiz.version);
      const selection=scope(viewer,quiz),attemptId=randomUUID(),now=clock(),questions=shuffle(selection.questions).map(q=>({...q,options:shuffle(q.options)}));
      db.prepare('INSERT INTO academy_quiz_attempt(id,user_id,quiz_id,version,title,type,tracks_json,questions_private,started_at,expires_at) VALUES(?,?,?,?,?,?,?,?,?,?)').run(attemptId,viewer.user_id,id,quiz.version,quiz.title,quiz.type,JSON.stringify(selection.tracks),JSON.stringify(questions),new Date(now).toISOString(),quiz.duration_seconds?new Date(now+quiz.duration_seconds*1000).toISOString():null);
      return payload(db.prepare('SELECT * FROM academy_quiz_attempt WHERE id=?').get(attemptId));
    });
  };
  const update=(viewer,id,input,finish=false)=>{const attempt=own(viewer,id);if(attempt.status==='complete')return payload(attempt);if(expired(attempt))return complete(attempt,JSON.parse(attempt.answers_json));if(input.revision!==attempt.revision)throw fail('Esta tentativa mudou. Reabra para continuar.',409);const questions=JSON.parse(attempt.questions_private);validateAnswers(questions,input.answers);if(finish){if(attempt.type==='checkpoint'&&Object.keys(input.answers).length!==questions.length)throw fail('Responda todas as perguntas para validar a etapa.');return complete(attempt,input.answers);}db.prepare("UPDATE academy_quiz_attempt SET answers_json=?,revision=revision+1 WHERE id=? AND status='open' AND revision=?").run(JSON.stringify(input.answers),attempt.id,attempt.revision);return payload(db.prepare('SELECT * FROM academy_quiz_attempt WHERE id=?').get(id));};
  const pool=()=>bank.tracks.map(t=>({id:t.id,name:t.name,questions:t.questions.map(q=>({...publicQuestion(q)}))}));
  return {list,detail,save,adminDetail,adminList,seed,start,get,update,pool,withReadBatch:batch.run};
}
