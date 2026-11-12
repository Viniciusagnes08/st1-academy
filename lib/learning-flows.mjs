import {randomUUID} from 'node:crypto';
import {hasPermission,hasTrack,readProfile} from './access.mjs';

const fail=(message,status=400)=>Object.assign(new Error(message),{status});
const kinds=['start','material','quiz','certificate','milestone'];
const clean=(value,max,label)=>{if(typeof value!=='string'||value.trim().length<1||value.length>max||/[\u0000-\u001f]/.test(value))throw fail(label+' inválido.');return value.trim();};
export function orderFlow(nodes,edges){
  const byId=new Map(nodes.map(n=>[n.id,n])),incoming=new Map(nodes.map(n=>[n.id,[]])),outgoing=new Map(nodes.map(n=>[n.id,[]]));
  for(const e of edges){if(!byId.has(e.from)||!byId.has(e.to)||e.from===e.to)throw fail('Toda conexão precisa ligar duas etapas diferentes deste percurso.');incoming.get(e.to).push(e.from);outgoing.get(e.from).push(e.to);}
  const queue=nodes.filter(n=>!incoming.get(n.id).length).map(n=>n.id),pending=new Map(nodes.map(n=>[n.id,incoming.get(n.id).length])),ordered=[];
  for(let i=0;i<queue.length;i++){const id=queue[i];ordered.push(id);for(const next of outgoing.get(id)){pending.set(next,pending.get(next)-1);if(!pending.get(next))queue.push(next);}}
  if(ordered.length!==nodes.length)throw fail('Essa conexão cria um ciclo. O percurso precisa avançar sem voltar para uma etapa que depende dele.');
  return {ordered,incoming,outgoing};
}
export function createLearningFlowService(db,bank,{contents,readings,game,access}){
  db.exec(`CREATE TABLE IF NOT EXISTS academy_learning_flow(id TEXT PRIMARY KEY,track_id TEXT NOT NULL,title TEXT NOT NULL,description TEXT NOT NULL DEFAULT '',audience_json TEXT NOT NULL,status TEXT NOT NULL,revision INTEGER NOT NULL DEFAULT 0,nodes_json TEXT NOT NULL,edges_json TEXT NOT NULL,created_by TEXT REFERENCES user(id),updated_by TEXT REFERENCES user(id),created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS academy_learning_flow_scope_idx ON academy_learning_flow(status,track_id);`);
  const row=id=>db.prepare('SELECT * FROM academy_learning_flow WHERE id=?').get(id);
  const model=r=>({id:r.id,trackId:r.track_id,title:r.title,description:r.description,audience:JSON.parse(r.audience_json),status:r.status,revision:r.revision,nodes:JSON.parse(r.nodes_json),edges:JSON.parse(r.edges_json)});
  const admin=viewer=>{if(viewer.role!=='admin')throw fail('Somente o Admin organiza os percursos.',403);};
  const normalize=input=>{
    const trackId=input.trackId;if(trackId!=='supervisor'&&!bank.tracks.some(t=>t.id===trackId))throw fail('Escolha um canal ou Supervisor.');
    const title=clean(input.title,100,'Título'),description=String(input.description||'').trim();if(description.length>320)throw fail('Use até 320 caracteres na descrição.');
    const audience=input.audience||['seller','supervisor'];if(!Array.isArray(audience)||!audience.length||audience.some(v=>!['seller','supervisor'].includes(v))||trackId==='supervisor'&&audience.some(v=>v!=='supervisor'))throw fail('O percurso Supervisor é exclusivo dessa função.');
    if(!['draft','published','archived'].includes(input.status))throw fail('Escolha um estado válido.');
    if(!Array.isArray(input.nodes)||input.nodes.length<2||input.nodes.length>200||!Array.isArray(input.edges)||input.edges.length>800)throw fail('Organize de 2 a 200 etapas por percurso.');
    const nodes=input.nodes.map(n=>{const id=clean(n.id,80,'Etapa');if(!/^[\w-]+$/.test(id)||!kinds.includes(n.kind))throw fail('Etapa inválida.');const description=String(n.description||'').trim();if(description.length>280)throw fail('Use até 280 caracteres na descrição da etapa.');const targetId=n.targetId?clean(n.targetId,160,'Conteúdo vinculado'):null;
      if(n.kind==='certificate'&&(!bank.tracks.some(t=>t.id===targetId)||trackId!=='supervisor'&&targetId!==trackId))throw fail('A certificação precisa corresponder ao canal do percurso.');
      if(n.kind==='material'&&targetId){const r=db.prepare('SELECT tracks_json FROM academy_content WHERE id=?').get(targetId);if(!r||trackId!=='supervisor'&&!JSON.parse(r.tracks_json).includes(trackId))throw fail('Esse material não pertence ao canal escolhido.');}
      if(n.kind==='quiz'&&targetId){const r=db.prepare('SELECT tracks_json FROM academy_quiz WHERE id=?').get(targetId);if(!r||trackId!=='supervisor'&&!JSON.parse(r.tracks_json).includes(trackId))throw fail('Essa avaliação não pertence ao canal escolhido.');}
      return {id,kind:n.kind,title:clean(n.title,100,'Nome da etapa'),description,targetId,requirement:n.requirement==='any'?'any':'all',required:n.required!==false};});
    if(new Set(nodes.map(n=>n.id)).size!==nodes.length||nodes.filter(n=>n.kind==='start').length!==1)throw fail('Use etapas únicas e um único ponto de partida.');
    const edges=input.edges.map(e=>({from:clean(e.from,80,'Origem'),to:clean(e.to,80,'Destino')}));if(new Set(edges.map(e=>e.from+'>'+e.to)).size!==edges.length)throw fail('Uma conexão foi repetida.');
    const graph=orderFlow(nodes,edges);for(const n of nodes)if(n.kind==='start'?graph.incoming.get(n.id).length:!graph.incoming.get(n.id).length)throw fail('Conecte todas as etapas ao ponto de partida.');
    return {trackId,title,description,audience:[...new Set(audience)],status:input.status,nodes,edges};
  };
  const save=(viewer,id,input,seedId)=>{admin(viewer);const before=id?row(id):null;if(id&&!before)throw fail('Percurso não encontrado.',404);if(before&&input.revision!==before.revision)throw fail('O percurso mudou. Reabra para continuar.',409);const v=normalize(input),now=new Date().toISOString();id??=seedId||randomUUID();db.exec('BEGIN IMMEDIATE');try{
    if(before){const changed=db.prepare('UPDATE academy_learning_flow SET track_id=?,title=?,description=?,audience_json=?,status=?,nodes_json=?,edges_json=?,revision=revision+1,updated_by=?,updated_at=? WHERE id=? AND revision=?').run(v.trackId,v.title,v.description,JSON.stringify(v.audience),v.status,JSON.stringify(v.nodes),JSON.stringify(v.edges),viewer.user_id,now,id,before.revision);if(changed.changes!==1)throw fail('O percurso mudou. Reabra para continuar.',409);}
    else db.prepare('INSERT INTO academy_learning_flow(id,track_id,title,description,audience_json,status,nodes_json,edges_json,created_by,updated_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run(id,v.trackId,v.title,v.description,JSON.stringify(v.audience),v.status,JSON.stringify(v.nodes),JSON.stringify(v.edges),viewer.user_id,viewer.user_id,now,now);
    access.audit(viewer.user_id,id,before?'flow.updated':'flow.created',before?model(before):null,model(row(id)));db.exec('COMMIT');return model(row(id));
  }catch(error){db.exec('ROLLBACK');throw error;}};
  const person=(viewer,userId=viewer.user_id)=>{if(typeof userId!=='string'||userId.length>120||userId!==viewer.user_id&&!game.squads.canInspect(viewer,userId))throw fail('Percurso não encontrado ou não liberado.',404);const p=readProfile(db,userId);if(!p||!p.enabled||!hasPermission(p,'materials')&&!hasPermission(p,'assessments'))throw fail('Percurso não encontrado ou não liberado.',404);return p;};
  const permitted=(p,r)=>r.status==='published'&&(p.role==='admin'||JSON.parse(r.audience_json).includes(p.role))&&(r.track_id==='supervisor'?p.role==='supervisor'||p.role==='admin':hasTrack(p,r.track_id));
  const observable=(viewer,p,r)=>permitted(p,r)&&(p.user_id===viewer.user_id?permitted(viewer,r):r.track_id==='supervisor'?viewer.role==='supervisor'||viewer.role==='admin':hasTrack(viewer,r.track_id));
  const available=(viewer,p)=>db.prepare("SELECT * FROM academy_learning_flow WHERE status='published' ORDER BY CASE WHEN track_id='supervisor' THEN 0 ELSE 1 END,title,id").all().filter(r=>observable(viewer,p,r));
  const project=(viewer,p,r)=>{
    const f=model(r),graph=orderFlow(f.nodes,f.edges),states=new Map(),materialCache=new Map(),quizCache=new Map();
    const shared=id=>hasTrack(p,id)&&hasTrack(viewer,id);
    const material=id=>{if(materialCache.has(id))return materialCache.get(id);let value=null;try{if(hasPermission(p,'materials')&&(p.user_id!==viewer.user_id||hasPermission(viewer,'materials'))){const a=contents.detail(p,id);if(a.status==='published'&&a.tracks.some(shared)&&!(a.kind==='file'&&!a.asset)){let canConsult=false;try{canConsult=hasPermission(viewer,'materials')&&contents.detail(viewer,id).status==='published';}catch(e){if(![403,404].includes(e.status))throw e;}value={item:a,study:readings.forItem(p,a),canConsult};}}}catch(e){if(![403,404].includes(e.status))throw e;}materialCache.set(id,value);return value;};
    const quiz=id=>{if(quizCache.has(id))return quizCache.get(id);let value=null;try{if(hasPermission(p,'assessments')&&(p.user_id!==viewer.user_id||hasPermission(viewer,'assessments'))){const a=game.quizzes.detail(p,id);if(a.status==='published'&&a.tracks.some(shared))value={item:a,passed:game.quizPassed(p.user_id,id)};}}catch(e){if(![403,404].includes(e.status))throw e;}quizCache.set(id,value);return value;};
    for(const id of graph.ordered){const n=f.nodes.find(n=>n.id===id),requires=graph.incoming.get(id).map(id=>states.get(id)),satisfied=!requires.length||(n.requirement==='any'?requires.some(v=>v.completed):requires.every(v=>v.completed));let resource=true,rawComplete=false,progress=0,href=null;
      if(n.kind==='start')rawComplete=true;
      else if(n.kind==='material'){const m=n.targetId?material(n.targetId):null;resource=!!m;rawComplete=!!m?.study.completed;progress=m?.study.percent||0;if(m?.canConsult)href='#material/'+encodeURIComponent(n.targetId);}
      else if(n.kind==='quiz'){const q=n.targetId?quiz(n.targetId):null;resource=!!q;rawComplete=!!q?.passed;if(q)href='#desafio/'+encodeURIComponent(n.targetId);}
      else if(n.kind==='certificate'){resource=hasPermission(p,'assessments')&&shared(n.targetId);rawComplete=game.certified(p.user_id,n.targetId);href=resource?'#trilha/'+encodeURIComponent(n.targetId):null;}
      else rawComplete=satisfied;
      const completed=resource&&satisfied&&rawComplete,locked=!resource||!satisfied,status=completed?'completed':locked?'locked':progress?'studying':'available';
      const missing=requires.filter(v=>!v.completed).map(v=>({id:v.id,title:v.title}));
      states.set(id,{...n,targetId:resource?n.targetId:null,completed,locked,status,progress:completed?100:progress,href:!locked?href:null,resourceAvailable:resource,prerequisites:missing,reason:!resource?'O material ou a avaliação desta etapa aguarda liberação para sua conta.':!satisfied?(n.requirement==='any'?'Conclua uma das etapas: ':'Conclua antes: ')+missing.map(n=>n.title).join(' · '):null});
    }
    const nodes=f.nodes.map(n=>states.get(n.id)),counted=nodes.filter(n=>n.kind!=='start'&&n.required),completed=counted.filter(n=>n.completed).length;
    return {schemaVersion:3,id:f.id,title:f.title,description:f.description,trackId:f.trackId,revision:f.revision,userId:p.user_id,name:p.name,own:p.user_id===viewer.user_id,role:p.role,nodes,edges:f.edges,summary:{completed,total:counted.length,percent:counted.length?Math.round(completed/counted.length*100):0,available:nodes.filter(n=>!n.completed&&!n.locked&&n.kind!=='start').length},nextNodeId:nodes.find(n=>!n.completed&&!n.locked&&n.kind!=='start')?.id||null};
  };
  const list=(viewer,userId)=>{const p=person(viewer,userId);return {userId:p.user_id,name:p.name,role:p.role,own:p.user_id===viewer.user_id,items:available(viewer,p).map(r=>({id:r.id,title:r.title,description:r.description,trackId:r.track_id}))};};
  const get=(viewer,id,userId)=>{const p=person(viewer,userId),r=row(id);if(!r||!observable(viewer,p,r))throw fail('Percurso não encontrado ou não liberado.',404);return project(viewer,p,r);};
  const gates=(viewer,kind,targetId)=>{
    const p=person(viewer),matches=available(viewer,p).filter(r=>JSON.parse(r.nodes_json).some(n=>n.kind===kind&&n.targetId===targetId));if(!matches.length)return null;
    const stages=matches.flatMap(r=>project(viewer,p,r).nodes.filter(n=>n.kind===kind&&(n.targetId===targetId||JSON.parse(r.nodes_json).some(raw=>raw.id===n.id&&raw.targetId===targetId))).map(n=>({...n,flowId:r.id})));
    const open=stages.find(n=>!n.locked);return open||stages[0];
  };
  const assertAccess=(viewer,kind,id)=>{if(viewer.role==='admin')return;const gate=gates(viewer,kind,id);if(gate?.locked)throw Object.assign(fail(gate.reason,423),{flowId:gate.flowId});};
  const materialFlags=viewer=>{if(viewer.role==='admin'||!hasPermission(viewer,'materials'))return new Map();const p=person(viewer),flags=new Map();for(const r of available(viewer,p)){const raw=new Map(JSON.parse(r.nodes_json).map(n=>[n.id,n]));for(const n of project(viewer,p,r).nodes.filter(n=>n.kind==='material')){const id=raw.get(n.id).targetId;if(!id)continue;const prior=flags.get(id);if(!prior||!n.locked)flags.set(id,{locked:n.locked,reason:n.reason,flowId:r.id});}}return flags;};
  const seed=actor=>{
    const viewer=readProfile(db,actor);if(!viewer||viewer.role!=='admin')return;
    for(const t of bank.tracks){const id='percurso-'+t.id;if(t.id==='bi'){
        const existing=row(id),moduleIds=Array.from({length:16},(_,index)=>'m'+String(index+1).padStart(2,'0')),nodes=[{id:'inicio',kind:'start',title:'Sua jornada BI começa aqui'}],edges=[];let previous='inicio';
        for(const suffix of moduleIds){const materialId='st1-bi-'+suffix,quizId='avaliacao-bi-'+suffix;if(!db.prepare('SELECT 1 FROM academy_content WHERE id=?').get(materialId)||!db.prepare('SELECT 1 FROM academy_quiz WHERE id=?').get(quizId))continue;const materialNode='estudo-'+suffix,quizNode='avaliacao-'+suffix;nodes.push({id:materialNode,kind:'material',targetId:materialId,title:'Estude '+suffix.toUpperCase(),description:'Abra o caderno visual do módulo e marque o estudo concluído.'},{id:quizNode,kind:'quiz',targetId:quizId,title:'Avaliação '+suffix.toUpperCase(),description:'Aplique o que aprendeu no módulo.'});edges.push({from:previous,to:materialNode},{from:materialNode,to:quizNode});previous=quizNode;}
        if(nodes.length<3)continue;nodes.push({id:'certificacao',kind:'certificate',targetId:'bi',title:'Certificação Analista BI ST1',description:'Conclua todos os módulos e demonstre domínio na avaliação final.'},{id:'conquista',kind:'milestone',title:'Projeto concluído',description:'Conhecimento, prática e evidências registrados na ST1 Academy.'});edges.push({from:previous,to:'certificacao'},{from:'certificacao',to:'conquista'});
        const value={trackId:'bi',title:'Formação BI e Power BI',description:'Do nivelamento à entrega de uma solução analítica operável, com materiais visuais, prática e certificação.',audience:['seller','supervisor'],status:'published',nodes,edges};
        if(!existing)save(viewer,null,value,id);else if(existing.revision===0&&JSON.parse(existing.nodes_json).every(n=>/^inicio$|^estudo-\\d+$|^pratica-\\d+$|^certificacao$|^conquista$/.test(n.id)))save(viewer,id,{...value,revision:existing.revision});
        continue;
      }if(row(id))continue;const sources=t.materials.map(file=>'st1-'+file.replace(/\.pdf$/,'')).filter(id=>db.prepare('SELECT 1 FROM academy_content WHERE id=?').get(id));if(!sources.length)continue;
      const nodes=[{id:'inicio',kind:'start',title:'Seu percurso '+t.name}],edges=[];let previous='inicio';
      for(const [index,source] of sources.entries()){const nodeId='estudo-'+index;nodes.push({id:nodeId,kind:'material',targetId:source,title:index===0?'Conheça os planos '+t.name:'Estude o processo '+t.name,description:index===0?'Aprenda as ofertas, os aplicativos e as regras deste canal.':'Entenda a sequência de atendimento e venda.'});edges.push({from:previous,to:nodeId});previous=nodeId;}
      const checks=db.prepare("SELECT id,topic,questions_private FROM academy_quiz WHERE type='checkpoint' AND tracks_json=? ORDER BY step_order").all(JSON.stringify([t.id]));
      for(const [i,q] of checks.entries()){
        nodes.push({id:'pratica-'+i,kind:'quiz',targetId:q.id,title:'Pratique: '+q.topic,description:'Aprovação com 80% de acertos e todas as regras críticas.'});
        const references=new Set(JSON.parse(q.questions_private).map(question=>question.source?.file).filter(Boolean));
        const parents=sources.map((source,index)=>({source,nodeId:'estudo-'+index})).filter(s=>references.has(s.source.replace(/^st1-/,'')+'.pdf')).map(s=>s.nodeId);
        for(const from of parents.length?parents:[previous])edges.push({from,to:'pratica-'+i});
      }
      nodes.push({id:'certificacao',kind:'certificate',targetId:t.id,title:'Certificação '+t.name,description:'Mostre o que aprendeu sobre o seu canal.'});for(const [i] of checks.entries())edges.push({from:'pratica-'+i,to:'certificacao'});if(!checks.length)edges.push({from:previous,to:'certificacao'});
      nodes.push({id:'conquista',kind:'milestone',title:'Seu próximo nível em '+t.name,description:'Certificação concluída. Continue aplicando o conhecimento.'});edges.push({from:'certificacao',to:'conquista'});save(viewer,null,{trackId:t.id,title:'Jornada '+t.name,description:'Do estudo dos materiais à certificação do seu canal.',audience:['seller','supervisor'],status:'published',nodes,edges},id);
    }
    if(!row('percurso-supervisor')){const specs=[['apresentacao','POPs da ST1 Academy | Apresentação','Conheça a rotina da Academy'],['estudo','POP 01 | Rotina de estudo na Academy','Organize sua rotina de estudo'],['diagnostico','POP 02 | Diagnóstico por função','Identifique o ponto de partida'],['acompanhamento','POP 04 | Acompanhamento do supervisor','Acompanhe o desenvolvimento do squad'],['reforco','POP 03 | Resultado e plano de reforço','Construa o plano de reforço'],['evolucao','POP 05 | Evolução por competências','Acompanhe a evolução por competências'],['desenvolvimento','POP 06 | Autoconhecimento e desenvolvimento','Conecte o desenvolvimento aos objetivos']];
      const nodes=[{id:'inicio',kind:'start',title:'Sua jornada de supervisão'},...specs.map(([id,title,label])=>({id,kind:'material',title:label,targetId:db.prepare('SELECT id FROM academy_content WHERE title=? AND deleted_at IS NULL ORDER BY rowid LIMIT 1').get(title)?.id||null,description:'Estude a rotina e prepare sua aplicação com o time.'})),{id:'pronto',kind:'milestone',title:'Pronto para aplicar com o squad',description:'Estudos concluídos. A aplicação prática será acompanhada pela gestão.'}],edges=[['inicio','apresentacao'],['apresentacao','estudo'],['estudo','diagnostico'],['diagnostico','acompanhamento'],['diagnostico','reforco'],['acompanhamento','evolucao'],['reforco','evolucao'],['evolucao','desenvolvimento'],['desenvolvimento','pronto']].map(([from,to])=>({from,to}));
      save(viewer,null,{trackId:'supervisor',title:'Jornada Supervisor',description:'Estudo, diagnóstico, acompanhamento e evolução do squad.',audience:['supervisor'],status:'published',nodes,edges},'percurso-supervisor');
    }
  };
  const adminList=viewer=>{admin(viewer);return db.prepare('SELECT * FROM academy_learning_flow ORDER BY title,id').all().map(model);};
  const adminGet=(viewer,id)=>{admin(viewer);const r=row(id);if(!r)throw fail('Percurso não encontrado.',404);return model(r);};
  const choices=viewer=>{admin(viewer);return {tracks:[...bank.tracks.map(t=>({id:t.id,name:t.name})),{id:'supervisor',name:'Supervisor'}],materials:contents.list().filter(c=>!c.deletedAt).map(c=>({id:c.id,title:c.title,tracks:c.tracks,status:c.status})),quizzes:game.quizzes.adminList().map(q=>({id:q.id,title:q.title,tracks:q.tracks,status:q.status}))};};
  return {seed,list,get,gates,assertAccess,materialFlags,save,adminList,adminGet,choices};
}
