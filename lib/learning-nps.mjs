import {randomUUID} from 'node:crypto';

const fail=(message,status=400)=>Object.assign(new Error(message),{status});
const categories={
  clarity:'Clareza das explicações',
  examples:'Exemplos práticos',
  applicability:'Aplicação na rotina',
  organization:'Organização e sequência',
  pace:'Duração ou ritmo',
  materials:'Materiais de apoio',
  difficulty:'Nível de dificuldade',
  interaction:'Exercícios e interatividade',
  other:'Outro ponto'
};

export function createLearningNpsService(db,{clock=Date.now,tracks=[]}={}){
  db.exec(`CREATE TABLE IF NOT EXISTS academy_learning_nps(
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES user(id),
    source_type TEXT NOT NULL CHECK(source_type IN ('material','quiz','certification')),
    source_id TEXT NOT NULL,
    source_version TEXT NOT NULL DEFAULT '',
    tracks_json TEXT NOT NULL DEFAULT '[]',
    item_title TEXT NOT NULL,
    item_context TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','submitted')),
    score INTEGER,
    categories_json TEXT NOT NULL DEFAULT '[]',
    improvement_text TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    submitted_at TEXT,
    UNIQUE(user_id,source_type,source_id,source_version)
  );
    CREATE INDEX IF NOT EXISTS academy_learning_nps_pending_idx ON academy_learning_nps(user_id,status,created_at);
    CREATE INDEX IF NOT EXISTS academy_learning_nps_submitted_idx ON academy_learning_nps(status,submitted_at);`);
  try{db.exec("ALTER TABLE academy_learning_nps ADD COLUMN tracks_json TEXT NOT NULL DEFAULT '[]'");}catch(error){if(!/duplicate column|already exists|42701/i.test(String(error.code||error.message)))throw error;}

  const trackNames=new Map(tracks.map(track=>[track.id,track.name]));
  const normalizeTracks=values=>Array.isArray(values)?[...new Set(values.filter(value=>typeof value==='string'&&value.length<=120))].slice(0,20):[];
  const queue=({userId,sourceType,sourceId,sourceVersion='',title,context='',trackIds=[]})=>{
    if(!['material','quiz','certification'].includes(sourceType)||!userId||!sourceId||typeof title!=='string'||!title.trim())throw fail('Não foi possível vincular a avaliação ao item concluído.');
    const id=randomUUID(),createdAt=new Date(clock()).toISOString(),selectedTracks=normalizeTracks(trackIds);
    db.prepare(`INSERT OR IGNORE INTO academy_learning_nps(id,user_id,source_type,source_id,source_version,tracks_json,item_title,item_context,created_at)
      VALUES(?,?,?,?,?,?,?,?,?)`).run(id,userId,sourceType,String(sourceId),String(sourceVersion||''),JSON.stringify(selectedTracks),title.trim().slice(0,180),String(context||'').trim().slice(0,180),createdAt);
    return pending(userId);
  };
  const pending=userId=>{
    const row=db.prepare("SELECT id,source_type,item_title,item_context,created_at FROM academy_learning_nps WHERE user_id=? AND status='pending' ORDER BY created_at,id LIMIT 1").get(userId);
    return row?{id:row.id,sourceType:row.source_type,title:row.item_title,context:row.item_context,createdAt:row.created_at}:null;
  };
  const submit=(viewer,id,input={})=>{
    const row=db.prepare("SELECT id,status FROM academy_learning_nps WHERE id=? AND user_id=?").get(id,viewer.user_id);
    if(!row||row.status!=='pending')throw fail('Esta avaliação não está mais pendente.',404);
    const score=input.score;
    if(!Number.isInteger(score)||score<0||score>10)throw fail('Escolha uma nota de 0 a 10.');
    if(!Array.isArray(input.categories)||input.categories.length>Object.keys(categories).length||input.categories.some(value=>typeof value!=='string'||!categories[value]))throw fail('Selecione opções válidas de melhoria.');
    const selected=[...new Set(input.categories)];
    const improvement=typeof input.improvement==='string'?input.improvement.trim():'';
    if(improvement.length>1200)throw fail('A sugestão pode ter até 1.200 caracteres.');
    if(score<=8&&(!selected.length||improvement.length<10))throw fail('Para notas de 0 a 8, escolha ao menos uma melhoria e descreva sua sugestão com pelo menos 10 caracteres.');
    if(score>=9&&(selected.length||improvement)&&(!selected.length||improvement.length<10))throw fail('Se quiser sugerir uma melhoria, escolha ao menos uma opção e descreva-a com pelo menos 10 caracteres.');
    const result=db.prepare("UPDATE academy_learning_nps SET status='submitted',score=?,categories_json=?,improvement_text=?,submitted_at=? WHERE id=? AND user_id=? AND status='pending'").run(score,JSON.stringify(selected),improvement,new Date(clock()).toISOString(),id,viewer.user_id);
    if(result.changes!==1)throw fail('Esta avaliação já foi enviada.',409);
    return {submitted:true};
  };
  const tracksFor=row=>{
    try{const stored=JSON.parse(row.tracks_json||'[]');if(Array.isArray(stored)&&stored.length)return normalizeTracks(stored);}catch{}
    try{
      if(row.source_type==='certification'){const related=db.prepare('SELECT track_id FROM academy_attempt WHERE id=?').get(row.source_id);return related?.track_id?[related.track_id]:[];}
      if(row.source_type==='quiz'){const related=db.prepare('SELECT tracks_json FROM academy_quiz_attempt WHERE id=?').get(row.source_id);return related?normalizeTracks(JSON.parse(related.tracks_json||'[]')):[];}
      if(row.source_type==='material'){const related=db.prepare('SELECT tracks_json FROM academy_content WHERE id=?').get(row.source_id);return related?normalizeTracks(JSON.parse(related.tracks_json||'[]')):[];}
    }catch{}
    return [];
  };
  const report=({period='all',track='all'}={})=>{
    const allRows=db.prepare("SELECT n.*,u.name,u.email FROM academy_learning_nps n JOIN user u ON u.id=n.user_id WHERE n.status='submitted' ORDER BY n.submitted_at DESC").all();
    const periodDays={'30':30,'90':90,'365':365},selectedPeriod=['30','90','365'].includes(String(period))?String(period):'all',cutoff=periodDays[selectedPeriod]?clock()-periodDays[selectedPeriod]*86400000:null,selectedTrack=typeof track==='string'&&track!=='all'?track.slice(0,120):'all';
    const rows=allRows.map(row=>({...row,trackIds:tracksFor(row)})).filter(row=>(cutoff===null||Date.parse(row.submitted_at)>=cutoff)&&(selectedTrack==='all'||row.trackIds.includes(selectedTrack)));
    const total=rows.length,promoters=rows.filter(row=>row.score>=9).length,detractors=rows.filter(row=>row.score<=6).length,average=total?Math.round(rows.reduce((sum,row)=>sum+row.score,0)/total*10)/10:0;
    const categoryCounts=Object.fromEntries(Object.keys(categories).map(key=>[key,0]));
    for(const row of rows)for(const key of JSON.parse(row.categories_json))if(Object.hasOwn(categoryCounts,key))categoryCounts[key]++;
    const distribution=Array.from({length:11},(_,score)=>({score,count:rows.filter(row=>row.score===score).length}));
    const trendMap=new Map();for(const row of rows){const month=String(row.submitted_at||'').slice(0,7),item=trendMap.get(month)||{month,total:0,promoters:0,detractors:0};item.total++;if(row.score>=9)item.promoters++;else if(row.score<=6)item.detractors++;trendMap.set(month,item);}
    const trackMap=new Map();for(const row of rows)for(const id of row.trackIds){const item=trackMap.get(id)||{trackId:id,track:trackNames.get(id)||id,total:0,promoters:0,passives:0,detractors:0};item.total++;if(row.score>=9)item.promoters++;else if(row.score>=7)item.passives++;else item.detractors++;trackMap.set(id,item);}
    return {period:selectedPeriod,track:selectedTrack,totalResponsesEver:allRows.length,summary:{total,average,nps:total?Math.round((promoters-detractors)/total*100):null,promoters,detractors,passives:total-promoters-detractors},distribution,trend:[...trendMap.values()].map(item=>({...item,nps:Math.round((item.promoters-item.detractors)/item.total*100)})).sort((a,b)=>a.month.localeCompare(b.month)),trackOptions:tracks.map(item=>({id:item.id,title:item.name})),trackBreakdown:[...trackMap.values()].map(item=>({...item,nps:Math.round((item.promoters-item.detractors)/item.total*100)})).sort((a,b)=>b.total-a.total),categories:Object.entries(categoryCounts).map(([id,count])=>({id,label:categories[id],count})).filter(item=>item.count).sort((a,b)=>b.count-a.count),items:rows.slice(0,100).map(row=>({id:row.id,name:row.name,email:row.email,sourceType:row.source_type,title:row.item_title,context:row.item_context,score:row.score,trackIds:row.trackIds,categories:JSON.parse(row.categories_json).map(id=>categories[id]).filter(Boolean),improvement:row.improvement_text,submittedAt:row.submitted_at}))};
  };
  return {queue,pending,submit,report};
}
