import {foundationLessons,foundationModules,foundationSources} from '../content/foundations.mjs';
import {readProfile} from './access.mjs';

const migrationKey='reference_foundations_v1';
export function seedFoundations(db,actor,{contents,modules,learningFlows}){
  const viewer=readProfile(db,actor);
  if(viewer?.role!=='admin'||!viewer.enabled)return {created:0,upgraded:0};
  if(db.prepare('SELECT 1 FROM academy_settings WHERE key=?').get(migrationKey))return {created:0,upgraded:0};
  let created=0,upgraded=0;
  for(const m of foundationModules){
    if(!db.prepare('SELECT 1 FROM academy_module WHERE id=?').get(m.id))modules.create(actor,m,m.id);
  }
  for(const lesson of foundationLessons){
    // Existing, edited, archived or deleted items keep their identity and history.
    if(db.prepare('SELECT 1 FROM academy_content WHERE id=?').get(lesson.id))continue;
    const body=lesson.body+'\n## Base de estudo\n'+lesson.sources.map(key=>foundationSources[key].title).join('; ')+'.\nAula adaptada para a ST1. Consulte as condições atuais no catálogo e no processo do seu canal.\n';
    contents.create(actor,{...lesson,body,kind:'text',status:'published'},lesson.id);created++;
  }
  const add=(f,id,title,targetId,required=true)=>f.nodes.push({id,kind:'material',title,targetId,description:'Estude o exemplo e confira seu entendimento.',required});
  const connect=(f,from,to)=>{if(!f.edges.some(e=>e.from===from&&e.to===to))f.edges.push({from,to});};
  for(const track of ['pap','digital','elite','indoor','pme']){
    let f;try{f=learningFlows.adminGet(viewer,'percurso-'+track);}catch(e){if(e.status===404)continue;throw e;}
    // Only expand the untouched canonical seed. An Admin's curation wins.
    if(f.revision!==0||!f.nodes.some(n=>n.id==='estudo-0'&&n.targetId==='st1-catalogo-'+track)||f.nodes.some(n=>!/^inicio$|^estudo-\d+$|^pratica-\d+$|^certificacao$|^conquista$/.test(n.id)))continue;
    add(f,'diagnostico','Entenda para indicar','st1-formacao-diagnostico');
    add(f,'recomendacao','Apresente a solução','st1-formacao-recomendacao');
    add(f,'objecoes','Converse sobre a objeção','st1-formacao-objecoes');
    add(f,'continuidade','Registre o próximo passo','st1-formacao-continuidade');
    add(f,'caso-canal','Treine uma situação do canal','st1-formacao-caso-'+track);
    add(f,'rotina','Sua rotina de evolução','st1-formacao-rotina',false);
    for(const [from,to] of [['inicio','diagnostico'],['inicio','rotina'],['diagnostico','recomendacao'],['estudo-0','recomendacao'],['recomendacao','objecoes'],['recomendacao','continuidade'],['objecoes','caso-canal'],['continuidade','caso-canal'],['caso-canal','certificacao']])connect(f,from,to);
    const process=f.nodes.find(n=>n.id==='estudo-1');if(process)connect(f,process.id,'continuidade');
    f.description='Planos, processo e prática de atendimento, com liberação pelas etapas relacionadas.';
    learningFlows.save(viewer,f.id,f);upgraded++;
  }
  let original;try{original=learningFlows.adminGet(viewer,'percurso-supervisor');}catch(e){if(e.status!==404)throw e;}
  const popIds=['inicio','apresentacao','estudo','diagnostico','acompanhamento','reforco','evolucao','desenvolvimento','pronto'];
  if(original?.revision===0&&original.nodes.length===popIds.length&&original.nodes.every(n=>popIds.includes(n.id))){
    // Keep the previous POP curation as a draft; do not widen private POP audiences.
    if(!db.prepare('SELECT 1 FROM academy_learning_flow WHERE id=?').get('percurso-supervisor-pops-curadoria'))learningFlows.save(viewer,null,{...original,title:'Supervisor | POPs em curadoria',status:'draft'},'percurso-supervisor-pops-curadoria');
    const nodes=[{id:'inicio',kind:'start',title:'Sua jornada de supervisão'}];
    for(const [id,title,targetId] of [['metas','Defina o desenvolvimento do squad','st1-formacao-supervisor-metas'],['diagnostico','Descubra a dificuldade','st1-formacao-supervisor-diagnostico'],['coaching','Feedback que vira prática','st1-formacao-supervisor-coaching'],['evidencia','Observe e registre a aplicação','st1-formacao-supervisor-evidencia'],['reforco','Reforce e acompanhe a evolução','st1-formacao-supervisor-reforco']])nodes.push({id,kind:'material',title,targetId});
    nodes.push({id:'pronto',kind:'milestone',title:'Base estudada. Agora aplique.',description:'Estudo concluído. Registre a aplicação e a revisão com o squad.'});
    learningFlows.save(viewer,original.id,{...original,nodes,edges:[['inicio','metas'],['metas','diagnostico'],['diagnostico','coaching'],['diagnostico','evidencia'],['coaching','reforco'],['evidencia','reforco'],['reforco','pronto']].map(([from,to])=>({from,to})),description:'Objetivos, diagnóstico, coaching e acompanhamento conectados ao reforço do squad.'});upgraded++;
  }
  db.prepare('INSERT OR IGNORE INTO academy_settings(key,value) VALUES(?,?)').run(migrationKey,JSON.stringify({created,upgraded}));
  return {created,upgraded};
}
