const sectors=['PAP','Digital','Indoor','Elite','Gestão','Outro'];
const roles=['Consultor(a)','Vendedor(a)','Líder','Supervisor(a)','Coordenador(a)','Gerente','Outro'];
const goals=['Especialista','Líder','Supervisor(a)','Coordenador(a)','Gerente','Outra cadeira'];
const challenges=['Abordagem','Diagnóstico','Produtos e planos','Objeções','Fechamento','Organização','Liderança'];
const dreams=['Crescer na ST1','Liderar uma equipe','Ser referência em vendas','Ganhar mais segurança','Aprender outro canal'];
const unique=values=>[...new Set(values)];
export function createOnboardingService(db,bank){
  db.exec("CREATE TABLE IF NOT EXISTS academy_onboarding(user_id TEXT PRIMARY KEY REFERENCES user(id),answers_json TEXT NOT NULL,completed_at TEXT NOT NULL)");
  const choices={sectors,roles,goals,challenges,dreams};
  const read=userId=>{const row=db.prepare('SELECT answers_json,completed_at FROM academy_onboarding WHERE user_id=?').get(userId);return row?{answers:JSON.parse(row.answers_json),completedAt:row.completed_at}:null;};
  const validate=input=>{
    const required={sector:sectors,role:roles,goal:goals,dream:dreams};
    for(const [key,options] of Object.entries(required))if(!options.includes(input?.[key]))throw new Error('Escolha uma opção válida em cada etapa.');
    if(!Array.isArray(input.challenges)||input.challenges.length<1||input.challenges.length>3||input.challenges.some(v=>!challenges.includes(v)))throw new Error('Escolha de uma a três dificuldades.');
    const squad=typeof input.squad==='string'?input.squad.trim():'';if(!squad||squad.length>100)throw new Error('Escolha seu squad ou a opção “Ainda não sei”.');
    return {sector:input.sector,role:input.role,goal:input.goal,dream:input.dream,challenges:unique(input.challenges),squad};
  };
  const save=(userId,input)=>{const answers=validate(input),now=new Date().toISOString();db.prepare('INSERT INTO academy_onboarding(user_id,answers_json,completed_at) VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET answers_json=excluded.answers_json,completed_at=excluded.completed_at').run(userId,JSON.stringify(answers),now);return read(userId);};
  const recommend=(viewer,record)=>{
    if(!record)return {current:[],next:[],suggestedTracks:[]};
    const a=record.answers,sector=a.sector.toLowerCase();
    const score=track=>{const id=track.id.toLowerCase(),name=track.name.toLowerCase();return id===sector||name.includes(sector)?10:a.challenges.includes('Produtos e planos')?2:1;};
    const ranked=[...bank.tracks].sort((x,y)=>score(y)-score(x));
    const allowed=new Set(viewer.tracks);
    const current=ranked.filter(t=>allowed.has(t.id)).map(t=>({id:t.id,name:t.name,reason:score(t)>=10?'Combina com seu setor':'Trilha liberada para seu desenvolvimento'}));
    const next=ranked.filter(t=>!allowed.has(t.id)).slice(0,3).map(t=>({id:t.id,name:t.name,reason:'Para a próxima etapa, peça liberação à gestão'}));
    return {current,next,suggestedTracks:ranked.filter(t=>score(t)>=10).map(t=>t.id)};
  };
  const adminList=()=>db.prepare('SELECT o.user_id,u.name,u.email,o.answers_json,o.completed_at FROM academy_onboarding o JOIN user u ON u.id=o.user_id ORDER BY o.completed_at DESC').all().map(r=>({userId:r.user_id,name:r.name,email:r.email,answers:JSON.parse(r.answers_json),completedAt:r.completed_at}));
  return {choices,read,save,recommend,adminList};
}

