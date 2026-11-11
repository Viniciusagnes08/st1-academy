import {hasPermission,readProfile} from './access.mjs';
import {createEmailSendLimits} from './email-send-limits.mjs';

export function createEmailAutomationEligibility(db,{context,baseURL,clock=()=>new Date().toISOString(),channel='email'}={}){
  const now=()=>new Date(clock());
  const localDate=value=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Fortaleza',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(value));
  const dateIndex=value=>{const [year,month,day]=localDate(value).split('-').map(Number);return Math.floor(Date.UTC(year,month-1,day)/86400000);};
  const weekStart=value=>{const [year,month,day]=localDate(value).split('-').map(Number),date=new Date(Date.UTC(year,month-1,day)),weekday=(date.getUTCDay()+6)%7;date.setUTCDate(date.getUTCDate()-weekday);return date.toISOString().slice(0,10);};
  const offsetDate=(day,offset)=>new Date(Date.parse(day+'T12:00:00Z')+offset*86400000).toISOString().slice(0,10);
  const subject=name=>String(name||'').trim().split(/\s+/)[0];
  let cachedAdmin=null;
  const admin=()=>{if(cachedAdmin?.enabled===1)return cachedAdmin;const row=db.prepare("SELECT user_id FROM academy_member WHERE role='admin' AND enabled=1 ORDER BY user_id LIMIT 1").get();cachedAdmin=row?readProfile(db,row.user_id):null;return cachedAdmin;};
  const profile=userId=>readProfile(db,userId);
  const members=()=>db.prepare(channel==='whatsapp'?"SELECT m.user_id FROM academy_member m JOIN user u ON u.id=m.user_id WHERE m.enabled=1 ORDER BY m.user_id":"SELECT m.user_id FROM academy_member m JOIN user u ON u.id=m.user_id LEFT JOIN academy_email_optout x ON x.user_id=m.user_id LEFT JOIN academy_campaign_optout o ON o.user_id=m.user_id WHERE m.enabled=1 AND x.user_id IS NULL AND o.user_id IS NULL ORDER BY m.user_id").all().map(row=>profile(row.user_id)).filter(Boolean);
  const flows=userId=>{const viewer=admin();if(!viewer||!context?.learningFlows)return [];try{return context.learningFlows.list(viewer,userId).items.map(item=>context.learningFlows.get(viewer,item.id,userId));}catch{return [];}};
  const studies=userId=>{
    const dates=new Set(db.prepare('SELECT day FROM academy_study_day WHERE user_id=? AND active_seconds>=45').all(userId).map(row=>row.day));
    for(const row of db.prepare("SELECT finished_at FROM academy_attempt WHERE user_id=? AND status='complete'").all(userId))if(row.finished_at)dates.add(localDate(row.finished_at));
    for(const row of db.prepare("SELECT finished_at,answers_json FROM academy_quiz_attempt WHERE user_id=? AND status='complete'").all(userId))try{if(row.finished_at&&Object.keys(JSON.parse(row.answers_json||'{}')).length)dates.add(localDate(row.finished_at));}catch{}
    return [...dates].sort();
  };
  const {nextSendAt,canSend}=createEmailSendLimits(db,{clock});
  const nextNode=flow=>flow.nodes.find(node=>!node.completed&&!node.locked&&node.kind!=='start')||null;
  const content=id=>id?db.prepare("SELECT id,title,summary,tracks_json,audience_json,modules_json FROM academy_content WHERE id=? AND status='published' AND deleted_at IS NULL").get(id)||null:null;
  const objective=id=>content(id)?.summary?.trim()||'';
  const journeyUrl=flow=>baseURL+'/#percurso/'+encodeURIComponent(flow.trackId);
  function nodeTimes(userId,flow){
    const nodes=new Map(flow.nodes.map(node=>[node.id,node])),cache=new Map(),visiting=new Set();
    const at=id=>{
      if(cache.has(id))return cache.get(id);
      if(visiting.has(id))return null;
      visiting.add(id);
      const node=nodes.get(id);if(!node||!node.completed){visiting.delete(id);cache.set(id,null);return null;}
      let own=null;
      if(node.kind==='material'&&node.targetId)own=db.prepare('SELECT completed_at FROM academy_material_study WHERE user_id=? AND content_id=?').get(userId,node.targetId)?.completed_at||null;
      else if(node.kind==='quiz'&&node.targetId)for(const row of db.prepare("SELECT a.finished_at,a.result_json FROM academy_quiz_attempt a JOIN academy_quiz q ON q.id=a.quiz_id AND q.version=a.version WHERE a.user_id=? AND a.quiz_id=? AND a.status='complete' ORDER BY a.finished_at DESC").all(userId,node.targetId))try{if(JSON.parse(row.result_json||'{}').approved){own=row.finished_at;break;}}catch{}
      else if(node.kind==='certificate'&&node.targetId)own=db.prepare('SELECT issued_at FROM academy_certificate WHERE user_id=? AND track_id=? ORDER BY issued_at DESC LIMIT 1').get(userId,node.targetId)?.issued_at||null;
      const incoming=flow.edges.filter(edge=>edge.to===id),parents=incoming.map(edge=>at(edge.from)).filter(Boolean);
      const parent=node.requirement==='any'?parents.sort()[0]||null:incoming.length&&parents.length===incoming.length?parents.sort().at(-1):null;
      const value=[own,parent].filter(Boolean).sort().at(-1)||null;
      visiting.delete(id);cache.set(id,value);return value;
    };
    for(const node of flow.nodes)at(node.id);
    return cache;
  }
  const candidate=(user,entityKey,values,target,flow=null)=>({user,entityKey,values,target,flow});
  function forKey(key,activatedAt){
    if(!activatedAt)return [];
    const rows=[];
    if(key==='first_lesson_nudge'){
      for(const user of members()){
        const onboarding=db.prepare('SELECT completed_at FROM academy_onboarding WHERE user_id=?').get(user.user_id);
        if(!onboarding||onboarding.completed_at<activatedAt||now().getTime()-Date.parse(onboarding.completed_at)<48*3600000)continue;
        if(db.prepare(channel==='whatsapp'?"SELECT 1 FROM academy_whatsapp_automation_job WHERE user_id=? AND automation_key='welcome' AND status='accepted'":"SELECT 1 FROM academy_email_job WHERE user_id=? AND automation_key='welcome' AND status='accepted'").get(user.user_id)===undefined)continue;
        if(studies(user.user_id).some(day=>day>=localDate(onboarding.completed_at)))continue;
        const flow=flows(user.user_id).find(item=>item.summary.percent===0),lesson=flow?.nodes.find(node=>node.kind==='material'&&!node.completed&&!node.locked&&node.targetId),goal=lesson&&objective(lesson.targetId);
        if(!flow||!lesson||!goal)continue;
        rows.push(candidate(user,'first-lesson:'+user.user_id+':'+onboarding.completed_at,{aula_inicial:lesson.title,objetivo_pratico:goal,primeiro_nome:subject(user.name)},lesson.href?baseURL+'/'+lesson.href:journeyUrl(flow),flow));
      }
    }
    if(key==='lesson_resume'){
      for(const user of members()){
        for(const record of db.prepare('SELECT * FROM academy_material_study WHERE user_id=? AND completed_at IS NULL ORDER BY last_studied_at').all(user.user_id)){
          if(!record.last_studied_at||record.last_studied_at<activatedAt||now().getTime()-Date.parse(record.last_studied_at)<72*3600000)continue;
          const flow=flows(user.user_id).find(item=>item.nodes.some(node=>node.kind==='material'&&node.targetId===record.content_id&&!node.completed&&!node.locked)),lesson=flow?.nodes.find(node=>node.kind==='material'&&node.targetId===record.content_id),goal=objective(record.content_id);
          if(!flow||!lesson||!goal)continue;
          rows.push(candidate(user,'resume:'+user.user_id+':'+record.content_id+':'+localDate(record.last_studied_at),{aula:lesson.title,objetivo_pratico:goal,primeiro_nome:subject(user.name)},lesson.href?baseURL+'/'+lesson.href:journeyUrl(flow),flow));
        }
      }
    }
    if(['half_track','last_mile_track','track_complete','assessment_pending'].includes(key)){
      for(const user of members())for(const flow of flows(user.user_id)){
        const times=nodeTimes(user.user_id,flow),completedAt=[...times.values()].filter(Boolean).sort().at(-1)||null,next=nextNode(flow);
        if(key==='half_track'&&flow.summary.percent>=50&&flow.summary.percent<80&&completedAt>=activatedAt&&next){
          const theme=next.description||objective(next.targetId);
          if(theme)rows.push(candidate(user,'progress50:'+user.user_id+':'+flow.id+':r'+flow.revision,{primeiro_nome:subject(user.name),barra_progresso:'▰'.repeat(Math.round(flow.summary.percent/10))+'▱'.repeat(10-Math.round(flow.summary.percent/10)),progresso_percentual:flow.summary.percent,proximo_conteudo:next.title,tema:theme,trilha:flow.title},next.href?baseURL+'/'+next.href:journeyUrl(flow),flow));
        }
        if(key==='last_mile_track'&&flow.summary.percent>=80&&flow.summary.percent<100&&completedAt>=activatedAt&&next)rows.push(candidate(user,'progress80:'+user.user_id+':'+flow.id+':r'+flow.revision,{barra_progresso:'▰'.repeat(Math.round(flow.summary.percent/10))+'▱'.repeat(10-Math.round(flow.summary.percent/10)),primeiro_nome:subject(user.name),progresso_percentual:flow.summary.percent,proxima_etapa:next.title,trilha:flow.title},next.href?baseURL+'/'+next.href:journeyUrl(flow),flow));
        if(key==='track_complete'&&flow.summary.percent===100&&completedAt&&completedAt>=activatedAt)rows.push(candidate(user,'track:'+flow.trackId+':'+user.user_id,{primeiro_nome:subject(user.name),trilha:flow.title},journeyUrl(flow),flow));
        if(key==='assessment_pending')for(const node of flow.nodes.filter(item=>item.kind==='quiz'&&!item.completed&&!item.locked&&item.targetId)){
          if(db.prepare("SELECT 1 FROM academy_quiz_attempt WHERE user_id=? AND quiz_id=? AND status='open'").get(user.user_id,node.targetId))continue;
          const incoming=flow.edges.filter(edge=>edge.to===node.id),readyTimes=incoming.map(edge=>times.get(edge.from)).filter(Boolean),readyAt=node.requirement==='any'?readyTimes.sort()[0]||null:readyTimes.length===incoming.length?readyTimes.sort().at(-1):null;
          if(!readyAt||readyAt<activatedAt||now().getTime()-Date.parse(readyAt)<48*3600000)continue;
          rows.push(candidate(user,'assessment:'+user.user_id+':'+node.targetId,{primeiro_nome:subject(user.name),trilha:flow.title},baseURL+'/#desafio/'+encodeURIComponent(node.targetId),flow));break;
        }
      }
    }
    if(['inactive_7d','inactive_14d','inactive_30d'].includes(key)){
      const threshold=key==='inactive_7d'?7:key==='inactive_14d'?14:30;
      for(const user of members()){
        const dates=studies(user.user_id),last=dates.at(-1);if(!last)continue;
        const age=dateIndexNow()-Math.floor(Date.parse(last+'T12:00:00Z')/86400000);
        if(age<threshold||(key==='inactive_7d'&&age>=14)||(key==='inactive_14d'&&age>=30)||last<localDate(activatedAt))continue;
        const flow=flows(user.user_id).filter(item=>item.summary.percent<100).sort((a,b)=>b.summary.percent-a.summary.percent)[0],next=flow&&nextNode(flow);if(!flow||!next)continue;
        const values={primeiro_nome:subject(user.name),trilha:flow.title,proximo_conteudo:next.title};if(key==='inactive_14d'){delete values.trilha;delete values.proximo_conteudo;}
        rows.push(candidate(user,'inactive:'+user.user_id+':'+flow.trackId+':'+last,values,key==='inactive_14d'?journeyUrl(flow):next.href?baseURL+'/'+next.href:journeyUrl(flow),flow));
      }
    }
    if(key==='weekly_mission'){
      const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/Fortaleza',weekday:'short',hour:'2-digit',hourCycle:'h23'}).formatToParts(now()),weekday=parts.find(item=>item.type==='weekday')?.value,hour=Number(parts.find(item=>item.type==='hour')?.value);
      if(weekday==='Mon'&&hour>=9){const monday=weekStart(now());if(monday>=localDate(activatedAt))for(const user of members()){
        if(!studies(user.user_id).some(day=>dateIndex(monday+'T12:00:00Z')-dateIndex(day+'T12:00:00Z')<=7))continue;
        const flow=flows(user.user_id).find(item=>item.summary.percent<100),next=flow&&nextNode(flow),goal=next&&objective(next.targetId);if(flow&&next&&goal)rows.push(candidate(user,'mission:'+user.user_id+':'+monday,{objetivo_pratico:goal,primeiro_nome:subject(user.name),proximo_conteudo:next.title},next.href?baseURL+'/'+next.href:journeyUrl(flow),flow));
      }}
    }
    if(key==='three_consecutive_weeks')for(const user of members()){
      if(channel!=='whatsapp'&&!canSend(user.user_id,30))continue;const dates=studies(user.user_id),weeks=new Set(dates.map(day=>weekStart(day+'T12:00:00Z')));
      for(const third of [...weeks].sort()){
        const latest=dates.filter(day=>weekStart(day+'T12:00:00Z')===third).at(-1);
        if(!weeks.has(offsetDate(third,-14))||!weeks.has(offsetDate(third,-7))||!latest||latest<localDate(activatedAt)||dateIndex(now())-dateIndex(third+'T12:00:00Z')>7)continue;
        const flow=flows(user.user_id).find(item=>item.summary.percent<100),next=flow&&nextNode(flow);if(!flow||!next)continue;
        rows.push(candidate(user,'studyweeks:'+user.user_id+':'+third,{primeiro_nome:subject(user.name),proximo_conteudo:next.title},next.href?baseURL+'/'+next.href:journeyUrl(flow),flow));break;
      }
    }
    if(key==='module_complete')for(const user of members())for(const flow of flows(user.user_id)){
      const times=nodeTimes(user.user_id,flow),groups=new Map();
      for(const node of flow.nodes.filter(item=>item.kind==='material'&&item.targetId&&item.required!==false)){
        const record=db.prepare("SELECT modules_json FROM academy_content WHERE id=? AND status='published' AND deleted_at IS NULL").get(node.targetId);if(!record)continue;
        for(const moduleId of JSON.parse(record.modules_json||'[]')){const group=groups.get(moduleId)||[];group.push({node,at:times.get(node.id)||null});groups.set(moduleId,group);}
      }
      for(const [moduleId,group] of groups){const module=db.prepare("SELECT * FROM academy_module WHERE id=? AND status='published'").get(moduleId);if(!module||!group.length||group.some(item=>!item.at)||!JSON.parse(module.audience_json||'[]').includes(user.role)||!JSON.parse(module.tracks_json||'[]').includes(flow.trackId))continue;const completedAt=group.map(item=>item.at).sort().at(-1);if(completedAt<activatedAt)continue;
        rows.push(candidate(user,`module:${user.user_id}:${moduleId}`,{modulo:module.title,primeiro_nome:subject(user.name)},journeyUrl(flow),flow));
      }
    }
    if(key==='module_unlocked'){
      const events=db.prepare("SELECT id,subject_id,action,after_json,before_json,created_at FROM academy_access_audit WHERE action IN ('module.created','module.updated') AND created_at>=? ORDER BY created_at,id").all(activatedAt);
      for(const event of events){let published;try{published=JSON.parse(event.after_json||'{}');}catch{continue;}if(published.status!=='published')continue;if(event.action==='module.updated'){let prior;try{prior=JSON.parse(event.before_json||'{}');}catch{continue;}if(prior.status==='published')continue;}
        const module=db.prepare("SELECT * FROM academy_module WHERE id=? AND status='published'").get(event.subject_id);if(!module)continue;const tracks=JSON.parse(module.tracks_json||'[]'),audience=JSON.parse(module.audience_json||'[]');if(!tracks.length||!module.description?.trim())continue;
        for(const user of members()){if(!hasPermission(user,'materials')||!audience.includes(user.role)||!tracks.some(track=>user.role==='admin'||user.tracks.includes(track)))continue;const flow=flows(user.user_id).find(item=>tracks.includes(item.trackId));if(!flow)continue;
          rows.push(candidate(user,`module-unlocked:${event.id}:${user.user_id}`,{modulo:module.title,objetivo_pratico:module.description.trim(),primeiro_nome:subject(user.name),trilha:flow.title},journeyUrl(flow),flow));
        }
      }
    }
    if(['content_update','practical_challenge'].includes(key)){
      const eventKind=key==='content_update'?'content_update':'practical_challenge',events=db.prepare('SELECT * FROM academy_email_editorial_event WHERE kind=? AND created_at>=? ORDER BY created_at,id').all(eventKind,activatedAt);
      for(const event of events){const source=content(event.content_id);if(!source)continue;const tracks=JSON.parse(source.tracks_json||'[]'),audience=JSON.parse(source.audience_json||'[]');
        for(const user of members()){if(!hasPermission(user,'materials')||!audience.includes(user.role)||!tracks.some(track=>user.role==='admin'||user.tracks.includes(track)))continue;const flow=flows(user.user_id).find(item=>tracks.includes(item.trackId)&&item.nodes.some(node=>node.kind==='material'&&node.targetId===source.id));if(!flow)continue;
          if(key==='content_update'){
            if(!event.summary?.trim()||!event.situation?.trim())continue;
            rows.push(candidate(user,`content-update:${event.id}:${user.user_id}`,{conteudo:source.title,resumo_da_mudanca:event.summary.trim(),situacao_de_uso:event.situation.trim()},journeyUrl(flow),flow));
          }else{
            const study=db.prepare('SELECT completed_at FROM academy_material_study WHERE user_id=? AND content_id=?').get(user.user_id,source.id);if(!study?.completed_at||study.completed_at<activatedAt||study.completed_at>event.created_at)continue;
            rows.push(candidate(user,`practical-challenge:${event.id}:${user.user_id}`,{conteudo_base:source.title,desafio_pratico:event.title+': '+event.challenge.trim()},journeyUrl(flow),flow));
          }
        }
      }
    }
    if(key==='deadline_3d'){
      const current=now().getTime(),items=db.prepare("SELECT i.*,a.user_id FROM academy_agenda_item i JOIN academy_agenda_assignment a ON a.item_id=i.id JOIN academy_member m ON m.user_id=a.user_id WHERE i.kind='task' AND i.status='active' AND i.deleted_at IS NULL AND a.active=1 AND a.progress IN ('pending','changes') AND m.enabled=1 AND i.created_at>=? AND i.due_at>? AND i.due_at<=? ORDER BY i.due_at").all(activatedAt,new Date(current+48*3600000).toISOString(),new Date(current+96*3600000).toISOString());
      for(const item of items){const user=profile(item.user_id);if(!user||!hasPermission(user,'materials')||!item.content_id)continue;const flow=flows(user.user_id).find(value=>value.nodes.some(node=>node.kind==='material'&&node.targetId===item.content_id));if(!flow)continue;const next=nextNode(flow);if(!next)continue;const date=new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Fortaleza',dateStyle:'short',timeStyle:'short'}).format(new Date(item.due_at));
        rows.push(candidate(user,`deadline:${item.id}:${user.user_id}`,{data_limite:date,primeiro_nome:subject(user.name),progresso_percentual:flow.summary.percent,proxima_etapa:next.title,trilha:flow.title},baseURL+'/#agenda/'+encodeURIComponent(item.id),flow));
      }
    }
    if(key==='monthly_wrapped'){
      const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/Fortaleza',year:'numeric',month:'2-digit',day:'2-digit',weekday:'short',hour:'2-digit',hourCycle:'h23'}).formatToParts(now()),part=type=>parts.find(item=>item.type===type)?.value,year=Number(part('year')),month=Number(part('month')),day=Number(part('day')),weekday=part('weekday'),hour=Number(part('hour')),first=new Date(Date.UTC(year,month-1,1)),offset=(first.getUTCDay()+6)%7;first.setUTCDate(first.getUTCDate()+(offset>=5?7-offset:0));const runDate=first.toISOString().slice(0,10),monthStart=`${year}-${String(month).padStart(2,'0')}-01`,priorStart=new Date(Date.UTC(year,month-2,1,12)),priorEnd=new Date(Date.UTC(year,month-1,1)),start=new Date(Date.UTC(priorStart.getUTCFullYear(),priorStart.getUTCMonth(),1,3)).toISOString(),end=new Date(Date.UTC(priorEnd.getUTCFullYear(),priorEnd.getUTCMonth(),1,3)).toISOString();
      if(localDate(now())===runDate&&weekday!=='Sat'&&weekday!=='Sun'&&hour>=9&&monthStart>=localDate(activatedAt))for(const user of members()){
        const flow=flows(user.user_id).find(item=>item.summary.percent<100),next=flow&&nextNode(flow);if(!flow||!next)continue;
        const lessons=db.prepare('SELECT count(*) n FROM academy_material_study WHERE user_id=? AND completed_at>=? AND completed_at<?').get(user.user_id,start,end).n;
        const moduleCount=()=>{let count=0;for(const f of flows(user.user_id)){const times=nodeTimes(user.user_id,f),byModule=new Map();for(const node of f.nodes.filter(item=>item.kind==='material'&&item.targetId&&item.required!==false)){const row=db.prepare("SELECT modules_json FROM academy_content WHERE id=? AND status='published' AND deleted_at IS NULL").get(node.targetId);if(!row)continue;for(const id of JSON.parse(row.modules_json||'[]')){const list=byModule.get(id)||[];list.push(times.get(node.id)||null);byModule.set(id,list);}}for(const values of byModule.values())if(values.length&&values.every(Boolean)&&Math.max(...values.map(Date.parse))>=Date.parse(start)&&Math.max(...values.map(Date.parse))<Date.parse(end))count++;}return count;};
        const modules=moduleCount(),tracks=flows(user.user_id).filter(f=>f.summary.percent===100&&[...nodeTimes(user.user_id,f).values()].some(value=>value&&value>=start&&value<end)).length;if(!lessons&&!modules&&!tracks)continue;
        rows.push(candidate(user,`wrapped:${monthStart}:${user.user_id}`,{aulas_concluidas_mes:String(lessons),mes:new Intl.DateTimeFormat('pt-BR',{month:'long',timeZone:'America/Fortaleza'}).format(priorStart),modulos_concluidos_mes:String(modules),proximo_conteudo:next.title,trilhas_concluidas_mes:String(tracks)},next.href?baseURL+'/'+next.href:journeyUrl(flow),flow));
      }
    }
    if(key==='post_track_feedback')for(const user of members())for(const flow of flows(user.user_id)){
      if(flow.summary.percent!==100)continue;const times=nodeTimes(user.user_id,flow),completedAt=[...times.values()].filter(Boolean).sort().at(-1);if(!completedAt||completedAt<activatedAt||now().getTime()-Date.parse(completedAt)<72*3600000)continue;
      const completion=db.prepare(channel==='whatsapp'?"SELECT id FROM academy_whatsapp_automation_job WHERE user_id=? AND automation_key='track_complete' AND status='accepted' AND entity_key LIKE ? ORDER BY accepted_at DESC LIMIT 1":"SELECT id FROM academy_email_job WHERE user_id=? AND automation_key='track_complete' AND status='accepted' AND entity_key LIKE ? ORDER BY accepted_at DESC LIMIT 1").get(user.user_id,`track:${flow.trackId}:%`);if(!completion)continue;
      if(db.prepare('SELECT 1 FROM academy_email_feedback WHERE user_id=? AND track_id=?').get(user.user_id,flow.trackId))continue;
      rows.push({...candidate(user,`feedback:${user.user_id}:${flow.trackId}`,{trilha:flow.title},baseURL+'/api/email-automations/feedback',flow),completionJobId:completion.id});
    }
    return rows;
  }
  const dateIndexNow=()=>dateIndex(now());
  return {forKey,canSend,nextSendAt};
}

