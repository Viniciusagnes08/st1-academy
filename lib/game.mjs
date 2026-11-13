import {randomUUID} from 'node:crypto';
import {hasPermission,hasTrack,readProfile} from './access.mjs';
import {createSquadService} from './squads.mjs';
import {createQuizService} from './quizzes.mjs';
import {createReadBatch} from './learning-read-batch.mjs';
import {biLegacyManifest} from './knowledge.mjs';
import {biQuizzes} from '../content/bi-course.mjs';

const fail=(message,status=400)=>Object.assign(new Error(message),{status});
const defaultRules={certificatePoints:200,checkpointPoints:25,flashPoints:50,levels:[{name:'Ponto de partida',xp:0},{name:'Em evolução',xp:100},{name:'Conector',xp:300},{name:'Especialista',xp:600},{name:'Mestre comercial',xp:1000},{name:'Referência ST1',xp:1500}]};
const day=value=>new Date(value).toLocaleDateString('en-CA',{timeZone:'America/Fortaleza'});
export function createGameService(db,bank,access,{clock=Date.now,attemptLimits}={}){
  db.exec(`CREATE TABLE IF NOT EXISTS academy_game_rules(id INTEGER PRIMARY KEY CHECK(id=1),revision INTEGER NOT NULL DEFAULT 0,rules_json TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS academy_xp(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES user(id),source_type TEXT NOT NULL,source_id TEXT NOT NULL,track_id TEXT NOT NULL,amount INTEGER NOT NULL,label TEXT NOT NULL,created_at TEXT NOT NULL,UNIQUE(user_id,source_type,source_id));`);
  db.prepare('INSERT OR IGNORE INTO academy_game_rules(id,rules_json) VALUES(1,?)').run(JSON.stringify(defaultRules));
  const squads=createSquadService(db,bank,access);
  const rules=()=>{const row=db.prepare('SELECT * FROM academy_game_rules WHERE id=1').get();return {...JSON.parse(row.rules_json),revision:row.revision};};
  const setRules=(actor,input)=>{const before=rules();if(input?.revision!==before.revision)throw fail('A pontuação mudou. Reabra para continuar.',409);for(const key of ['certificatePoints','checkpointPoints','flashPoints'])if(!Number.isInteger(input[key])||input[key]<0||input[key]>10000)throw fail('Os pontos devem ser números inteiros de 0 a 10.000.');if(!Array.isArray(input.levels)||input.levels.length<2||input.levels.length>10||input.levels[0]?.xp!==0)throw fail('Configure de 2 a 10 níveis, começando em 0 XP.');for(const [index,level] of input.levels.entries())if(typeof level.name!=='string'||level.name.trim().length<3||level.name.length>40||!Number.isInteger(level.xp)||level.xp<0||level.xp>1000000||index&&level.xp<=input.levels[index-1].xp)throw fail('Dê um nome aos níveis e use valores crescentes de XP.');const value={certificatePoints:input.certificatePoints,checkpointPoints:input.checkpointPoints,flashPoints:input.flashPoints,levels:input.levels.map(l=>({name:l.name.trim(),xp:l.xp}))};db.exec('BEGIN IMMEDIATE');try{db.prepare('UPDATE academy_game_rules SET rules_json=?,revision=revision+1 WHERE id=1 AND revision=?').run(JSON.stringify(value),before.revision);access.audit(actor,'game-rules','game.rules.updated',before,value);db.exec('COMMIT');return rules();}catch(error){db.exec('ROLLBACK');throw error;}};
  const ledger=userId=>db.prepare('SELECT source_type,source_id,track_id,amount,label,created_at FROM academy_xp WHERE user_id=? ORDER BY created_at DESC,id DESC').all(userId);
  const points=userId=>db.prepare('SELECT COALESCE(sum(amount),0) xp FROM academy_xp WHERE user_id=?').get(userId).xp;
  const levelFor=xp=>{const levels=rules().levels,index=levels.findLastIndex(l=>l.xp<=xp);return {index:index+1,name:levels[index].name,start:levels[index].xp,next:levels[index+1]||null};};
  const award=(userId,type,sourceId,trackId,amount,label,createdAt=new Date(clock()).toISOString(),announce=true)=>{const before=points(userId),inserted=db.prepare('INSERT OR IGNORE INTO academy_xp(id,user_id,source_type,source_id,track_id,amount,label,created_at) VALUES(?,?,?,?,?,?,?,?)').run(randomUUID(),userId,type,sourceId,trackId,amount,label,createdAt);if(inserted.changes&&announce&&levelFor(before+amount).index>levelFor(before).index)squads.notify(userId,'level:'+type+':'+sourceId,'Você avançou de nível',levelFor(before+amount).name+' · seu perfil pode ter novas personalizações.','#perfil/estilo');return inserted.changes?amount:0;};
  const batch=createReadBatch();
  const certified=(userId,trackId)=>batch.active()?batch.get('certificates:'+userId,()=>db.prepare('SELECT track_id,version FROM academy_certificate WHERE user_id=?').all(userId)).some(r=>r.track_id===trackId&&r.version===bank.tracks.find(t=>t.id===trackId)?.version):!!db.prepare('SELECT 1 FROM academy_certificate WHERE user_id=? AND track_id=? AND version=?').get(userId,trackId,bank.tracks.find(t=>t.id===trackId)?.version);
  const passed=(userId,id)=>batch.active()?batch.get('passed:'+userId,()=>db.prepare("SELECT a.quiz_id,a.result_json FROM academy_quiz_attempt a JOIN academy_quiz q ON q.id=a.quiz_id AND q.version=a.version WHERE a.user_id=? AND a.status='complete'").all(userId)).some(r=>r.quiz_id===id&&JSON.parse(r.result_json).approved):db.prepare("SELECT result_json FROM academy_quiz_attempt WHERE user_id=? AND quiz_id=? AND version=(SELECT version FROM academy_quiz WHERE id=?) AND status='complete'").all(userId,id,id).some(r=>JSON.parse(r.result_json).approved);
  const completedExam=(userId,trackId)=>batch.active()?batch.get('exams:'+userId,()=>db.prepare("SELECT id,rowid sequence,track_id,version,result_json,finished_at FROM academy_attempt WHERE user_id=? AND status='complete' ORDER BY finished_at DESC,rowid DESC").all(userId)).find(r=>r.track_id===trackId&&r.version===bank.tracks.find(t=>t.id===trackId)?.version):db.prepare("SELECT id,rowid sequence,result_json,finished_at FROM academy_attempt WHERE user_id=? AND track_id=? AND version=? AND status='complete' ORDER BY finished_at DESC,rowid DESC LIMIT 1").get(userId,trackId,bank.tracks.find(t=>t.id===trackId)?.version);
  const topicValidated=(userId,trackId,topic)=>{if(certified(userId,trackId))return true;const exam=completedExam(userId,trackId);if(!exam)return false;const details=JSON.parse(exam.result_json).details.filter(q=>topic==='Regras críticas'?q.critical:q.topic===topic);return details.length>0&&details.filter(q=>q.correct).length/details.length>=.8&&!details.some(q=>q.critical&&!q.correct);};
  const checkpointRows=trackId=>batch.active()?batch.get('checkpoints',()=>db.prepare("SELECT * FROM academy_quiz WHERE type='checkpoint' ORDER BY step_order").all()).filter(r=>r.tracks_json===JSON.stringify([trackId])):db.prepare("SELECT * FROM academy_quiz WHERE type='checkpoint' AND tracks_json=? ORDER BY step_order").all(JSON.stringify([trackId]));
  let flowGuard=null;
  const canStart=(viewer,quiz)=>{const decision=flowGuard?.(viewer,quiz.id);if(typeof decision==='boolean')return decision;const trackId=quiz.tracks[0],rows=checkpointRows(trackId),position=rows.findIndex(r=>r.id===quiz.id);return position<=0||rows.slice(0,position).every(r=>passed(viewer.user_id,r.id)||topicValidated(viewer.user_id,trackId,r.topic));};
  const quizzes=createQuizService(db,bank,access,{clock,canStart,attemptLimits,onPassed:attempt=>{const trackId=JSON.parse(attempt.tracks_json)[0];if(trackId==='bi')return 0;return award(attempt.user_id,attempt.type,attempt.quiz_id+'@'+attempt.version,trackId,rules()[attempt.type==='checkpoint'?'checkpointPoints':'flashPoints'],attempt.title);}});
  const initialize=actor=>{
    quizzes.seed();
    for(const quiz of biQuizzes){
      const previous=biLegacyManifest.quizzes[quiz.id],current=db.prepare('SELECT id,title,revision FROM academy_quiz WHERE id=?').get(quiz.id);
      if(!current||!previous||current.title!==previous)continue;
      db.exec('BEGIN IMMEDIATE');
      try{
        const changed=db.prepare('UPDATE academy_quiz SET title=?,revision=revision+1,updated_at=? WHERE id=? AND revision=? AND title=?').run(quiz.title,new Date(clock()).toISOString(),quiz.id,current.revision,previous);
        if(changed.changes===1){
          db.prepare('UPDATE academy_quiz_attempt SET title=? WHERE quiz_id=? AND title=?').run(quiz.title,quiz.id,previous);
          access.audit(actor,quiz.id,'quiz.title_cleaned',{title:previous},{title:quiz.title});
        }
        db.exec('COMMIT');
      }catch(error){db.exec('ROLLBACK');throw error;}
    }
    squads.seed(actor);
    for(const cert of db.prepare('SELECT id,user_id,track_id,issued_at FROM academy_certificate').all())if(cert.track_id!=='bi')award(cert.user_id,'certificate',cert.id,cert.track_id,rules().certificatePoints,'Certificação '+bank.tracks.find(t=>t.id===cert.track_id)?.name,cert.issued_at,false);
  };
  const onCertificate=record=>{if(record.track_id==='bi'){const badge=bank.tracks.find(t=>t.id==='bi')?.badge||'Analista BI ST1';squads.notify(record.user_id,'own-certificate:'+record.id,'Formação BI concluída',badge+' já está no seu passaporte.','#conquistas');return;}award(record.user_id,'certificate',record.id,record.track_id,rules().certificatePoints,'Certificação '+bank.tracks.find(t=>t.id===record.track_id).name,record.issued_at);squads.onCertificate(record);};
  let pathProvider=null;
  const paths=viewer=>bank.tracks.filter(t=>hasTrack(viewer,t.id)).map(track=>{
    if(track.id==='bi'&&pathProvider){
      const course=pathProvider(viewer);
      if(course){
        const nodes=course.nodes.filter(node=>node.kind!=='start').map(node=>({id:node.id,title:node.title,kind:node.kind,targetId:node.targetId,status:node.completed?'done':node.locked?'locked':'available'}));
        return {id:track.id,name:track.name,color:track.color,nodes,completed:nodes.filter(n=>n.status==='done').length,total:nodes.length};
      }
    }
    const nodes=checkpointRows(track.id).map(r=>({id:r.id,title:r.topic,questionCount:JSON.parse(r.questions_private).length,status:passed(viewer.user_id,r.id)||topicValidated(viewer.user_id,track.id,r.topic)?'done':canStart(viewer,{id:r.id,tracks:[track.id]})?'available':'locked',kind:'checkpoint'}));
    nodes.push({id:track.id,title:'Certificação',status:certified(viewer.user_id,track.id)?'done':nodes.every(n=>n.status==='done')?'available':'locked',kind:'certificate'});
    return {id:track.id,name:track.name,color:track.color,nodes,completed:nodes.filter(n=>n.status==='done').length,total:nodes.length};
  });
  const me=viewer=>{if(!hasPermission(viewer,'assessments')&&!hasPermission(viewer,'conquests'))throw fail('A evolução não está liberada para sua conta.',403);const awards=ledger(viewer.user_id).filter(a=>hasTrack(viewer,a.track_id)),xp=awards.reduce((n,a)=>n+a.amount,0),dates=[...new Set(awards.filter(a=>a.amount>0).map(a=>day(a.created_at)))];let streak=0,cursor=clock();if(!dates.includes(day(cursor)))cursor-=86400000;while(dates.includes(day(cursor))){streak++;cursor-=86400000;}const timeline=Array.from({length:7},(_,i)=>{const date=day(clock()-(6-i)*86400000);return {date,xp:awards.filter(a=>day(a.created_at)===date).reduce((n,a)=>n+a.amount,0)};});return {xp,level:levelFor(xp),streak,awards:awards.slice(0,30),timeline,paths:hasPermission(viewer,'assessments')?paths(viewer):[],squad:hasPermission(viewer,'community')?squads.ownSquad(viewer.user_id)?.id||null:null,rules:rules()};};
  const knowledge=(viewer,userId=viewer.user_id)=>{
    if(userId===viewer.user_id&&!hasPermission(viewer,'assessments')&&viewer.role!=='admin')throw fail('O mapa de conhecimento não está liberado.',403);
    if(userId!==viewer.user_id&&!squads.canInspect(viewer,userId))throw fail('Mapa não encontrado ou não liberado.',404);
    const person=readProfile(db,userId);if(!person||person.enabled!==1)throw fail('Pessoa não encontrada.',404);
    const bankIds=new Set(bank.tracks.flatMap(t=>t.questions.map(q=>q.id)));
    const attempts=db.prepare(`SELECT id,sequence,result_json,finished_at,type,tracks_json FROM (
      SELECT a.id,a.rowid sequence,a.result_json,a.finished_at,a.type,a.tracks_json,
        ROW_NUMBER() OVER(PARTITION BY a.quiz_id,a.version ORDER BY a.finished_at DESC,a.rowid DESC) position
      FROM academy_quiz_attempt a JOIN academy_quiz q ON q.id=a.quiz_id AND q.version=a.version
      WHERE a.user_id=? AND a.status='complete'
    ) WHERE position=1`).all(userId);
    const tracks=bank.tracks.filter(t=>hasTrack(viewer,t.id)&&hasTrack(person,t.id)).map(track=>{
      const exam=completedExam(userId,track.id),evidence=[];
      if(exam)evidence.push({id:exam.id,sequence:exam.sequence,details:JSON.parse(exam.result_json).details,at:exam.finished_at,label:'Avaliação de certificação',priority:3});
      const trackIds=new Set(track.questions.map(q=>q.id));
      for(const attempt of attempts){
        if(!JSON.parse(attempt.tracks_json).includes(track.id))continue;
        const details=JSON.parse(attempt.result_json).details.filter(q=>!bankIds.has(q.id)||trackIds.has(q.id));
        evidence.push({id:attempt.id,sequence:attempt.sequence,details,at:attempt.finished_at,label:attempt.type==='flash'?'Prova relâmpago':'Prática de etapa',priority:attempt.type==='flash'?1:2});
      }
      evidence.sort((a,b)=>b.at.localeCompare(a.at)||b.priority-a.priority||b.sequence-a.sequence);
      const latestTopics=new Map(),latestQuestions=new Map();
      for(const item of evidence){
        const grouped=new Map();
        for(const question of item.details){
          if(!grouped.has(question.topic))grouped.set(question.topic,[]);grouped.get(question.topic).push(question);
          const current=track.questions.find(q=>q.id===question.id);
          if(current&&current.stem===question.stem&&current.critical===question.critical&&current.options.find(o=>o.id===current.answer)?.text===question.expected&&!latestQuestions.has(question.id))latestQuestions.set(question.id,{...question,record:item});
        }
        for(const [title,details] of grouped)if(!latestTopics.has(title))latestTopics.set(title,{...item,details});
      }
      const steps=checkpointRows(track.id),knownTopics=new Set(steps.map(step=>step.topic));
      const extraTopics=[...latestTopics.keys()].filter(topic=>!knownTopics.has(topic));
      const definitions=[...steps.map(step=>({id:step.id,title:step.topic,fallback:JSON.parse(step.questions_private)[0]?.source})),...extraTopics.map(topic=>({id:'tema-'+track.id+'-'+encodeURIComponent(topic),title:topic}))];
      const nodes=definitions.map(step=>{
        const matches=q=>step.title==='Regras críticas'?q.critical:q.topic===step.title;
        const expected=new Set(track.questions.filter(matches).map(q=>q.id));
        const latest=latestTopics.get(step.title),source=expected.size?[...expected].map(id=>latestQuestions.get(id)).filter(Boolean):latest?.details||[];
        const covered=source.filter(q=>expected.has(q.id)).length;
        const correct=source.filter(q=>q.correct).length,total=source.length,failedCritical=source.some(q=>q.critical&&!q.correct),score=total?Math.round(correct/total*100):null;
        const partial=expected.size>0&&covered<expected.size,status=!total?'unmeasured':score<80||failedCritical?'reinforce':partial?'partial':'validated';
        const records=source.map(q=>q.record||latest),recordKeys=new Set(records.map(r=>r.id)),at=records.map(r=>r.at).sort().at(-1)||null;
        return {id:step.id,title:step.title,status,score,correct,total,coverage:{answered:expected.size?covered:total,total:expected.size||total,complete:total>0&&!partial},critical:step.title==='Regras críticas'||source.some(q=>q.critical),evidence:total?(recordKeys.size>1?'Evidências de '+recordKeys.size+' avaliações':records[0].label):null,evidenceCount:recordKeys.size,evaluatedAt:at,source:source.find(q=>!q.correct&&q.source)?.source||source.find(q=>q.source)?.source||step.fallback};
      });
      return {id:track.id,name:track.name,certified:certified(userId,track.id),nodes};
    });return {userId:person.user_id,name:person.name,tracks};
  };
  const results=(viewer,{period='all',role='seller'}={})=>{
    if(!['all','week','month'].includes(period)||!['seller','supervisor','all'].includes(role))throw fail('Filtro de ranking inválido.');
    if(viewer.role!=='admin'&&!hasPermission(viewer,'community')&&!hasPermission(viewer,'team_results'))throw fail('Resultados não liberados.',403);
    const since=period==='all'?'':new Date(clock()-(period==='week'?7:30)*86400000).toISOString(),mySquad=squads.ownSquad(viewer.user_id);
    const active=db.prepare("SELECT u.id,u.name,m.role FROM user u JOIN academy_member m ON m.user_id=u.id WHERE m.enabled=1 AND m.role IN ('seller','supervisor')").all();
    const stats=person=>{const awards=ledger(person.id).filter(a=>a.created_at>=since&&hasTrack(viewer,a.track_id));const certs=db.prepare('SELECT track_id,issued_at FROM academy_certificate WHERE user_id=?').all(person.id).filter(c=>c.issued_at>=since&&hasTrack(viewer,c.track_id));return {id:person.id,name:person.name,role:person.role,xp:awards.reduce((n,a)=>n+a.amount,0),certificates:certs.length,level:levelFor(awards.reduce((n,a)=>n+a.amount,0)).name,squadId:squads.ownSquad(person.id)?.id||null,canInspect:person.id===viewer.user_id||squads.canInspect(viewer,person.id)};};
    const participants=active.filter(p=>hasPermission(readProfile(db,p.id),'community')).map(stats);
    const visible=participants.filter(p=>(role==='all'||p.role===role)&&(viewer.role==='admin'||p.id===viewer.user_id||mySquad&&p.squadId===mySquad.id||squads.canInspect(viewer,p.id))).sort((a,b)=>b.xp-a.xp||b.certificates-a.certificates||a.name.localeCompare(b.name,'pt-BR'));
    let rank=0,previous;const ranking=visible.map((p,index)=>{const key=p.xp+':'+p.certificates;if(key!==previous){rank=index+1;previous=key;}return {...p,rank};});
    const squadRanking=db.prepare("SELECT id,name FROM academy_squad WHERE status='active' ORDER BY name").all().map(s=>{const team=participants.filter(p=>p.squadId===s.id&&(role==='all'||p.role===role));const xp=team.reduce((n,p)=>n+p.xp,0);return {id:s.id,name:s.name,members:team.length,xp,averageXp:team.length?Math.round(xp/team.length):0,certificates:team.reduce((n,p)=>n+p.certificates,0)};}).sort((a,b)=>b.averageXp-a.averageXp||b.xp-a.xp||a.name.localeCompare(b.name,'pt-BR'));
    return {ranking,squads:squadRanking,scope:viewer.role==='admin'?'Academy':mySquad?.name||'Sua equipe',period,role,mySquadId:mySquad?.id||null,totals:{participants:ranking.length,xp:ranking.reduce((n,p)=>n+p.xp,0),certificates:ranking.reduce((n,p)=>n+p.certificates,0)},rules:rules()};
  };
  return {rules,setRules,me,paths,knowledge,results,initialize,onCertificate,quizzes,squads,quizPassed:passed,certified,withReadBatch:work=>batch.run(()=>quizzes.withReadBatch(work)),setFlowGuard:guard=>{flowGuard=guard;},setPathProvider:provider=>{pathProvider=provider;}};
}
