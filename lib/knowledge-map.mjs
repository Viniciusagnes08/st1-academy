import {hasPermission,hasTrack,readProfile} from './access.mjs';
import {materialVersion} from './readings.mjs';

const fail=(message,status=400)=>Object.assign(new Error(message),{status});
const fold=value=>String(value||'').normalize('NFD').replace(/\p{Diacritic}/gu,'').toLowerCase();
const studyStatuses=['not_started','studying','studied'];
const assessmentStatuses=['unmeasured','partial','validated','reinforce'];

/** A read-only projection: publishing a module or material updates the map without copying nodes. */
export function createKnowledgeMapService(db,bank,{game}){
  db.function('academy_map_version',{deterministic:true},(kind,body,url,sha)=>materialVersion({kind,body,url,asset:sha?{sha256:sha}:null}));
  db.function('academy_map_search',{deterministic:true},fold);
  db.exec(`CREATE INDEX IF NOT EXISTS academy_map_content_idx ON academy_content(status,deleted_at,category,id);
    CREATE INDEX IF NOT EXISTS academy_map_assessment_idx ON academy_quiz_attempt(user_id,status,quiz_id,version,finished_at DESC);`);
  const query=(sql,values)=>{const keys=new Set([...sql.matchAll(/@([a-zA-Z]+)/g)].map(m=>m[1]));return db.prepare(sql).all(Object.fromEntries(Object.entries(values).filter(([key])=>keys.has(key))));};
  const context=(viewer,userId=viewer.user_id)=>{
    if(typeof userId!=='string'||!userId||userId.length>120)throw fail('Pessoa inválida.');
    if(userId!==viewer.user_id&&!game.squads.canInspect(viewer,userId))throw fail('Mapa não encontrado ou não liberado.',404);
    const person=readProfile(db,userId);if(!person||person.enabled!==1)throw fail('Mapa não encontrado ou não liberado.',404);
    const materials=hasPermission(viewer,'materials')&&hasPermission(person,'materials');
    const assessments=hasPermission(person,'assessments')&&(userId!==viewer.user_id||hasPermission(viewer,'assessments'));
    if(!materials&&!assessments)throw fail('O mapa de conhecimento não está liberado.',403);
    return {viewer,person,materials,assessments,shared:bank.tracks.filter(t=>hasTrack(viewer,t.id)&&hasTrack(person,t.id))};
  };
  const filters=(input={})=>{
    for(const key of ['q','track','category','status','cursor','limit'])if(input[key]!==undefined&&typeof input[key]!=='string'&&typeof input[key]!=='number')throw fail('Filtro do mapa inválido.');
    const q=String(input.q||'').trim();if(q.length>100)throw fail('Use até 100 caracteres na busca.');
    const track=input.track||'all',category=input.category||'all',status=input.status||'all';
    if(track!=='all'&&!bank.tracks.some(t=>t.id===track)||!['all','processos','produtos','livros','cursos','treinamentos'].includes(category)||!['all','empty',...studyStatuses,...assessmentStatuses].includes(status))throw fail('Filtro do mapa inválido.');
    const limit=Number(input.limit??24),cursor=String(input.cursor??'0');
    if(!Number.isInteger(limit)||limit<1||limit>48||!/^\d{1,7}$/.test(cursor)||Number(cursor)>1000000)throw fail('Página do mapa inválida.');
    return {q,track,category,status,limit,offset:Number(cursor)};
  };
  const values=(ctx,f)=>({userId:ctx.person.user_id,viewerRole:ctx.viewer.role,personRole:ctx.person.role,shared:JSON.stringify(ctx.shared.map(t=>t.id)),track:f.track,category:f.category,status:f.status,q:fold(f.q),pattern:'%'+fold(f.q).replace(/[\\%_]/g,'\\$&')+'%'});
  const cte=`WITH visible_modules AS (
    SELECT m.* FROM academy_module m WHERE m.status='published'
    AND (@viewerRole='admin' OR EXISTS(SELECT 1 FROM json_each(m.audience_json) a WHERE a.value=@viewerRole))
    AND (@personRole='admin' OR EXISTS(SELECT 1 FROM json_each(m.audience_json) a WHERE a.value=@personRole))
    AND EXISTS(SELECT 1 FROM json_each(m.tracks_json) t JOIN json_each(@shared) p ON p.value=t.value)
    AND (@track='all' OR EXISTS(SELECT 1 FROM json_each(@shared) p WHERE p.value=@track))
    AND (@track='all' OR EXISTS(SELECT 1 FROM json_each(m.tracks_json) t WHERE t.value=@track))
  ), visible_content AS (
    SELECT c.id,c.title,c.summary,c.category,c.kind,c.modules_json,c.tracks_json,
      CASE WHEN s.version_key=academy_map_version(c.kind,c.body,c.url,a.sha256) THEN s.completed_at ELSE NULL END completed_at,
      CASE WHEN s.version_key=academy_map_version(c.kind,c.body,c.url,a.sha256) THEN s.started_at ELSE NULL END started_at,
      r.page,r.pages,r.max_page,r.last_read_at
    FROM academy_content c LEFT JOIN academy_content_asset a ON a.id=c.asset_id
    LEFT JOIN academy_material_study s ON s.content_id=c.id AND s.user_id=@userId
    LEFT JOIN academy_reading r ON r.content_id=c.id AND r.user_id=@userId AND r.asset_id=c.asset_id AND a.mime='application/pdf'
    WHERE c.status='published' AND c.deleted_at IS NULL
    AND (@viewerRole='admin' OR EXISTS(SELECT 1 FROM json_each(c.audience_json) a WHERE a.value=@viewerRole))
    AND (@personRole='admin' OR EXISTS(SELECT 1 FROM json_each(c.audience_json) a WHERE a.value=@personRole))
    AND EXISTS(SELECT 1 FROM json_each(c.tracks_json) t JOIN json_each(@shared) p ON p.value=t.value)
    AND (@track='all' OR EXISTS(SELECT 1 FROM json_each(@shared) p WHERE p.value=@track))
    AND (@track='all' OR EXISTS(SELECT 1 FROM json_each(c.tracks_json) t WHERE t.value=@track))
    AND (@category='all' OR c.category=@category)
  ), materials AS (
    SELECT *,CASE WHEN completed_at IS NOT NULL THEN 'studied' WHEN started_at IS NOT NULL OR page IS NOT NULL THEN 'studying' ELSE 'not_started' END study_status,
      CASE WHEN completed_at IS NOT NULL THEN 100 WHEN pages>0 THEN MIN(99,CAST(ROUND(max_page*100.0/pages) AS INTEGER)) ELSE 0 END percent
    FROM visible_content
  ), selected AS (
    SELECT * FROM materials WHERE @status='all' OR study_status=@status
  ) `;
  const stats=(ctx,f)=>ctx.materials?query(cte+`SELECT COUNT(*) total,COALESCE(SUM(CASE WHEN study_status='studied' THEN 1 ELSE 0 END),0) studied,COALESCE(SUM(CASE WHEN study_status='studying' THEN 1 ELSE 0 END),0) studying FROM materials`,values(ctx,f))[0]:{total:0,studied:0,studying:0};
  const assess=ctx=>ctx.assessments?game.knowledge(ctx.viewer,ctx.person.user_id).tracks:[];
  const paging=(items,f)=>({items:items.slice(f.offset,f.offset+f.limit),total:items.length,limit:f.limit,cursor:String(f.offset),nextCursor:f.offset+f.limit<items.length?String(f.offset+f.limit):null});
  const studyNode=(row,ctx)=>({id:row.id,kind:'material',title:row.title,description:row.summary,category:row.category,status:row.study_status,progress:row.percent,completedAt:row.completed_at,page:row.page,pages:row.pages,tracks:JSON.parse(row.tracks_json).filter(id=>ctx.shared.some(t=>t.id===id)),href:'#material/'+encodeURIComponent(row.id)});
  const modules=(ctx,f)=>{
    if(!ctx.materials||assessmentStatuses.includes(f.status))return [];
    const rows=query(cte+`SELECT m.id,m.title,m.description,m.tracks_json,
      COUNT(c.id) total,COALESCE(SUM(CASE WHEN c.study_status='studied' THEN 1 ELSE 0 END),0) studied,COALESCE(SUM(CASE WHEN c.study_status='studying' THEN 1 ELSE 0 END),0) studying
      FROM visible_modules m LEFT JOIN (SELECT j.value module_id,c.* FROM selected c CROSS JOIN json_each(c.modules_json) j) c ON c.module_id=m.id
      AND (@q='' OR academy_map_search(m.title||' '||m.description) LIKE @pattern ESCAPE '\\' OR academy_map_search(c.title||' '||c.summary) LIKE @pattern ESCAPE '\\')
      GROUP BY m.id,m.title,m.description,m.tracks_json HAVING (COUNT(c.id)>0 OR @status IN ('all','empty') AND @category='all' AND NOT EXISTS(SELECT 1 FROM materials c WHERE EXISTS(SELECT 1 FROM json_each(c.modules_json) j WHERE j.value=m.id)))
      AND (@q='' OR academy_map_search(m.title||' '||m.description) LIKE @pattern ESCAPE '\\' OR COUNT(c.id)>0)`,values(ctx,f));
    const unassigned=query(cte+`SELECT COUNT(*) total,COALESCE(SUM(CASE WHEN study_status='studied' THEN 1 ELSE 0 END),0) studied,COALESCE(SUM(CASE WHEN study_status='studying' THEN 1 ELSE 0 END),0) studying FROM selected c
      WHERE NOT EXISTS(SELECT 1 FROM visible_modules m JOIN json_each(c.modules_json) j ON j.value=m.id)
      AND (@q='' OR academy_map_search(c.title||' '||c.summary) LIKE @pattern ESCAPE '\\')`,values(ctx,f))[0];
    if(unassigned.total)rows.push({id:'~unassigned',title:'Materiais sem módulo',description:'Conteúdos publicados que ainda precisam ser organizados em um módulo.',tracks_json:'[]',...unassigned});
    return rows.map(r=>({id:r.id,kind:'module',title:r.title,description:r.description,clearSearchOnOpen:!f.q||fold(r.title+' '+r.description).includes(fold(f.q)),tracks:JSON.parse(r.tracks_json).filter(id=>ctx.shared.some(t=>t.id===id)),total:r.total,studied:r.studied,studying:r.studying,status:!r.total?'empty':r.studied===r.total?'studied':r.studied||r.studying?'studying':'not_started',progress:r.total?Math.round(r.studied/r.total*100):0})).filter(n=>f.status!=='empty'||n.total===0);
  };
  const overview=(viewer,input={})=>{
    const ctx=context(viewer,input.userId||viewer.user_id),f=filters(input),s=stats(ctx,f),assessments=assess(ctx).filter(t=>f.track==='all'||t.id===f.track);
    const branches=modules(ctx,f);
    if(f.category==='all'&&!studyStatuses.includes(f.status)&&f.status!=='empty')for(const t of assessments){
      const topics=t.nodes.filter(n=>(!f.q||fold(t.name+' '+n.title).includes(fold(f.q)))&&(f.status==='all'||n.status===f.status));
      if(f.q&&!topics.length||f.status!=='all'&&!topics.length)continue;
      const validated=topics.filter(n=>n.status==='validated').length,reinforce=topics.filter(n=>n.status==='reinforce').length;
      branches.push({id:t.id,kind:'assessment',title:'Avaliações | '+t.name,description:'Evidências das respostas, separadas da conclusão dos materiais.',total:topics.length,validated,reinforce,tracks:[t.id],certified:t.certified,status:reinforce?'reinforce':validated===topics.length&&topics.length?'validated':topics.some(n=>n.status!=='unmeasured')?'partial':'unmeasured',progress:topics.length?Math.round(validated/topics.length*100):0});
    }
    branches.sort((a,b)=>Number(a.status==='empty')-Number(b.status==='empty')||Number(a.kind==='assessment')-Number(b.kind==='assessment')||a.title.localeCompare(b.title,'pt-BR')||a.id.localeCompare(b.id));
    return {schemaVersion:2,userId:ctx.person.user_id,name:ctx.person.name,own:ctx.person.user_id===viewer.user_id,scope:{materials:ctx.materials,assessments:ctx.assessments},tracks:ctx.shared.map(({id,name})=>({id,name})),summary:{...s,modules:modules(ctx,{...f,q:'',status:'all'}).length,topics:assessments.reduce((n,t)=>n+t.nodes.length,0),validated:assessments.reduce((n,t)=>n+t.nodes.filter(v=>v.status==='validated').length,0),reinforce:assessments.reduce((n,t)=>n+t.nodes.filter(v=>v.status==='reinforce').length,0)},...paging(branches,f)};
  };
  const children=(viewer,kind,id,input={})=>{
    const ctx=context(viewer,input.userId||viewer.user_id),f=filters(input);
    if(kind==='module'){
      if(!ctx.materials)throw fail('Módulo não encontrado ou não liberado.',404);
      const v=values(ctx,f),row=id==='~unassigned'?{id,title:'Materiais sem módulo',description:'Organize estes conteúdos nos módulos da Academy.'}:query(cte+'SELECT id,title,description FROM visible_modules WHERE id=@module',{...v,track:'all',module:id})[0];
      if(!row)throw fail('Módulo não encontrado ou não liberado.',404);
      const where=id==='~unassigned'?'NOT EXISTS(SELECT 1 FROM visible_modules m JOIN json_each(c.modules_json) j ON j.value=m.id)':'EXISTS(SELECT 1 FROM json_each(c.modules_json) j WHERE j.value=@module)';
      const condition=` FROM selected c WHERE ${where} AND (@q='' OR academy_map_search(c.title||' '||c.summary) LIKE @pattern ESCAPE '\\')`;
      const total=query(cte+'SELECT COUNT(*) total'+condition,{...v,module:id})[0].total;
      const rows=query(cte+'SELECT *'+condition+' ORDER BY academy_map_search(c.title),c.id LIMIT @limit OFFSET @offset',{...v,module:id,limit:f.limit,offset:f.offset});
      return {userId:ctx.person.user_id,name:ctx.person.name,parent:{...row,kind},items:rows.map(row=>studyNode(row,ctx)),total,limit:f.limit,cursor:String(f.offset),nextCursor:f.offset+f.limit<total?String(f.offset+f.limit):null};
    }
    if(kind==='assessment'){
      const track=assess(ctx).find(t=>t.id===id);if(!track)throw fail('Trilha não encontrada ou não liberada.',404);
      const items=track.nodes.filter(n=>(f.track==='all'||f.track===track.id)&&f.category==='all'&&(!f.q||fold(n.title).includes(fold(f.q)))&&(f.status==='all'||n.status===f.status)).map(n=>({...n,kind:'topic',trackId:track.id,sourceHref:ctx.materials&&n.source?.file?'#material/st1-'+encodeURIComponent(n.source.file.replace(/\.pdf$/,''))+'/pagina/'+n.source.page:null}));
      // A source link is exposed only when that exact material is visible in this person's scope.
      const allowed=ctx.materials?new Set(query(cte+'SELECT id FROM materials',values(ctx,{...f,category:'all',status:'all'})).map(r=>r.id)):new Set();
      for(const n of items)if(n.sourceHref&&!allowed.has('st1-'+n.source.file.replace(/\.pdf$/,'')))n.sourceHref=null;
      return {userId:ctx.person.user_id,name:ctx.person.name,parent:{id:track.id,title:'Avaliações | '+track.name,description:'Cada resultado informa o instrumento e a cobertura das perguntas.',kind,certified:track.certified},...paging(items,f)};
    }
    throw fail('Ramo do mapa inválido.');
  };
  return {overview,children};
}
