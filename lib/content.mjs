import {randomUUID,createHash} from 'node:crypto';
import {hasPermission,hasTrack} from './access.mjs';
import {knowledgeById,knowledgeCover} from './knowledge.mjs';
import {createReadBatch} from './learning-read-batch.mjs';

export const maxContentFileBytes=40*1024*1024;
export const contentCategories=['processos','produtos','livros','cursos','treinamentos'];
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
const cleanText=(value,max,label)=>{if(typeof value!=='string'||value.length>max||/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(value))throw fail(`${label} inválido.`);return value.trim();};

export function createContentService(db,bank,audit){
  db.exec(`CREATE TABLE IF NOT EXISTS academy_content(
    id TEXT PRIMARY KEY,title TEXT NOT NULL,summary TEXT NOT NULL DEFAULT '',kind TEXT NOT NULL CHECK(kind IN ('file','text','link')),
    body TEXT NOT NULL DEFAULT '',url TEXT NOT NULL DEFAULT '',tracks_json TEXT NOT NULL,audience_json TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','published','archived')),revision INTEGER NOT NULL DEFAULT 0,
    asset_id TEXT,created_by TEXT NOT NULL REFERENCES user(id),updated_by TEXT NOT NULL REFERENCES user(id),created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS academy_content_asset(id TEXT PRIMARY KEY,content_id TEXT NOT NULL REFERENCES academy_content(id),
    name TEXT NOT NULL,mime TEXT NOT NULL,size INTEGER NOT NULL,sha256 TEXT NOT NULL,bytes BLOB NOT NULL,created_by TEXT NOT NULL REFERENCES user(id),created_at TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS academy_content_status_idx ON academy_content(status,updated_at);
    CREATE INDEX IF NOT EXISTS academy_content_asset_idx ON academy_content_asset(content_id,created_at);`);
  if(!db.prepare('PRAGMA table_info(academy_content)').all().some(column=>column.name==='category'))db.exec("ALTER TABLE academy_content ADD COLUMN category TEXT NOT NULL DEFAULT 'treinamentos'");
  if(!db.prepare('PRAGMA table_info(academy_content)').all().some(column=>column.name==='modules_json'))db.exec("ALTER TABLE academy_content ADD COLUMN modules_json TEXT NOT NULL DEFAULT '[]'");
  for(const column of ['deleted_at','deletion_status'])if(!db.prepare('PRAGMA table_info(academy_content)').all().some(c=>c.name===column))db.exec('ALTER TABLE academy_content ADD COLUMN '+column+' TEXT');
  if(!db.prepare('PRAGMA table_info(academy_content)').all().some(c=>c.name==='scope'))db.exec("ALTER TABLE academy_content ADD COLUMN scope TEXT NOT NULL DEFAULT 'general'");
  const batch=createReadBatch();
  const records=()=>batch.get('contents',()=>db.prepare('SELECT * FROM academy_content ORDER BY updated_at DESC').all());
  const contentById=()=>batch.get('content-index',()=>new Map(records().map(r=>[r.id,r])));
  const row=id=>batch.active()?contentById().get(id):db.prepare('SELECT * FROM academy_content WHERE id=?').get(id);
  const assetInfo=id=>id?(batch.active()?batch.get('assets',()=>new Map(db.prepare('SELECT id,name,mime,size,sha256,created_at FROM academy_content_asset WHERE id IN (SELECT asset_id FROM academy_content WHERE asset_id IS NOT NULL)').all().map(r=>[r.id,r]))).get(id):db.prepare('SELECT id,name,mime,size,sha256,created_at FROM academy_content_asset WHERE id=?').get(id)):null;
  const moduleScope=id=>batch.active()?batch.get('module-scopes',()=>new Map(db.prepare('SELECT id,scope FROM academy_module').all().map(r=>[r.id,r.scope]))).get(id):db.prepare('SELECT scope FROM academy_module WHERE id=?').get(id)?.scope;
  const scopeOf=record=>record.scope==='strategy'||JSON.parse(record.modules_json).some(id=>moduleScope(id)==='strategy')?'strategy':'general';
  const serialize=(record,detail=false,admin=false)=>{
    const asset=assetInfo(record.asset_id),original=knowledgeById.get(record.id),metadata=original&&asset?.sha256===original.sha256?original:null;
    return {id:record.id,title:record.title,summary:record.summary,category:record.category,modules:JSON.parse(record.modules_json),kind:record.kind,tracks:JSON.parse(record.tracks_json),audience:JSON.parse(record.audience_json),status:record.status,scope:scopeOf(record),revision:record.revision,deletedAt:record.deleted_at,asset,...(metadata?{pages:metadata.pages,sections:metadata.sections,dahmas:metadata.dahmas,hasCover:true,search:metadata.search,presentation:metadata.presentation}:{}),...(detail?{body:record.body,url:record.url}:{}),...(admin?{createdAt:record.created_at,updatedAt:record.updated_at}:{}),...(detail&&admin?{assetVersions:db.prepare('SELECT id,name,mime,size,sha256,created_at FROM academy_content_asset WHERE content_id=? ORDER BY created_at DESC').all(record.id)}:{})};
  };
  const readable=(viewer,record)=>viewer?.enabled===1&&!!record&&!record.deleted_at&&(viewer.role==='admin'||record.status==='published'&&hasPermission(viewer,'materials')&&(scopeOf(record)!=='strategy'||hasPermission(viewer,'strategy'))&&JSON.parse(record.audience_json).includes(viewer.role)&&(scopeOf(record)==='strategy'||JSON.parse(record.tracks_json).some(id=>hasTrack(viewer,id))));
  const visible=viewer=>{
    if(!hasPermission(viewer,'materials'))throw fail('Os materiais não estão liberados para sua conta.',403);
    return (batch.active()?records().filter(r=>r.status==='published'):db.prepare("SELECT * FROM academy_content WHERE status='published' ORDER BY updated_at DESC").all()).filter(r=>readable(viewer,r)).map(r=>({...serialize(r),tracks:JSON.parse(r.tracks_json).filter(id=>hasTrack(viewer,id))}));
  };
  const normalize=(input,current)=>{
    if(!input||typeof input!=='object'||Array.isArray(input))throw fail('Informe os dados do conteúdo.');
    const value=current?{...serialize(current,true,true),...input}:{summary:'',body:'',url:'',category:'treinamentos',modules:[],scope:'general',audience:['seller','supervisor'],status:'draft',...input};
    if(!['general','strategy'].includes(value.scope))throw fail('Escolha uma área de acesso válida.');
    const title=cleanText(value.title,120,'Título');if(title.length<3)throw fail('O título precisa ter pelo menos 3 caracteres.');
    const summary=cleanText(value.summary,240,'Resumo'),body=cleanText(value.body,10000,'Texto'),url=cleanText(value.url,1200,'Link');
    if(!['file','text','link'].includes(value.kind))throw fail('Escolha Arquivo, Texto ou Link.');
    if(current&&value.kind!==current.kind)throw fail('O tipo não pode ser alterado. Cadastre outro conteúdo.');
    if(!['draft','published','archived'].includes(value.status))throw fail('Escolha Rascunho, Publicado ou Arquivado.');
    if(!Array.isArray(value.modules)||value.modules.some(id=>typeof id!=='string'||!db.prepare('SELECT 1 FROM academy_module WHERE id=?').get(id)))throw fail('Escolha módulos válidos.');
    if(!contentCategories.includes(value.category))throw fail('Escolha uma categoria válida.');
    if(!Array.isArray(value.tracks)||!value.tracks.length||value.tracks.some(id=>!bank.tracks.some(t=>t.id===id)))throw fail('Escolha pelo menos uma trilha válida.');
    if(!Array.isArray(value.audience)||value.audience.some(role=>!['seller','supervisor'].includes(role)))throw fail('Escolha um público válido.');
    if(value.kind==='link'&&url){let target;try{target=new URL(url);}catch{throw fail('Informe um link HTTPS válido.');}if(target.protocol!=='https:'||target.username||target.password)throw fail('Use um link HTTPS sem credenciais.');}
    let assetId=current?.asset_id||null;
    if(input.assetId!==undefined){if(value.kind!=='file'||!db.prepare('SELECT 1 FROM academy_content_asset WHERE id=? AND content_id=?').get(input.assetId,current?.id||''))throw fail('Esta versão de arquivo não pertence ao conteúdo.');assetId=input.assetId;}
    if(value.status==='published'){
      if(value.kind==='file'&&!assetId)throw fail('Envie o arquivo antes de publicar.');
      if(value.kind==='text'&&!body)throw fail('Escreva o texto antes de publicar.');
      if(value.kind==='link'&&!url)throw fail('Informe o link antes de publicar.');
    }
    return {title,summary,scope:value.scope,category:value.category,modules:[...new Set(value.modules)],kind:value.kind,body:value.kind==='text'?body:'',url:value.kind==='link'?url:'',tracks:[...new Set(value.tracks)],audience:[...new Set(value.audience)],status:value.status,assetId};
  };
  const snapshot=r=>{const s=serialize(r);return {id:s.id,title:s.title,category:s.category,modules:s.modules,kind:s.kind,tracks:s.tracks,audience:s.audience,status:s.status,scope:s.scope,revision:s.revision,asset:s.asset};};
  const transaction=work=>{db.exec('BEGIN IMMEDIATE');try{const result=work();db.exec('COMMIT');return result;}catch(error){db.exec('ROLLBACK');throw error;}};
  const create=(actor,input,id=randomUUID())=>{
    const value=normalize(input),now=new Date().toISOString();
    return transaction(()=>{db.prepare('INSERT INTO academy_content(id,title,summary,category,modules_json,kind,body,url,tracks_json,audience_json,status,scope,created_by,updated_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(id,value.title,value.summary,value.category,JSON.stringify(value.modules),value.kind,value.body,value.url,JSON.stringify(value.tracks),JSON.stringify(value.audience),value.status,value.scope,actor,actor,now,now);audit(actor,id,'content.created',null,snapshot(row(id)));return serialize(row(id),true,true);});
  };
  const update=(actor,id,input)=>{
    const current=row(id);if(!current||current.deleted_at)throw fail('Conteúdo não encontrado.',404);
    if(!Number.isInteger(input?.revision)||input.revision!==current.revision)throw fail('Outra pessoa atualizou este conteúdo. Reabra para continuar.',409);
    const value=normalize(input,current);
    return transaction(()=>{const changed=db.prepare('UPDATE academy_content SET title=?,summary=?,category=?,modules_json=?,body=?,url=?,tracks_json=?,audience_json=?,status=?,scope=?,asset_id=?,revision=revision+1,updated_by=?,updated_at=? WHERE id=? AND revision=?').run(value.title,value.summary,value.category,JSON.stringify(value.modules),value.body,value.url,JSON.stringify(value.tracks),JSON.stringify(value.audience),value.status,value.scope,value.assetId,actor,new Date().toISOString(),id,current.revision);if(changed.changes!==1)throw fail('Outra pessoa atualizou este conteúdo. Reabra para continuar.',409);audit(actor,id,value.status==='archived'?'content.archived':'content.updated',snapshot(current),snapshot(row(id)));return serialize(row(id),true,true);});
  };
  const upload=(actor,id,revision,encodedName,bytes)=>{
    const current=row(id);if(!current||current.deleted_at)throw fail('Conteúdo não encontrado.',404);
    if(current.kind!=='file')throw fail('Este conteúdo não recebe arquivos.');
    if(!Number.isInteger(revision)||revision!==current.revision)throw fail('O conteúdo foi atualizado. Reabra antes de enviar o arquivo.',409);
    if(!Buffer.isBuffer(bytes)||!bytes.length)throw fail('Selecione um arquivo.');
    if(bytes.length>maxContentFileBytes)throw fail('O vídeo pode ter até 40 MB.',413);
    let name;try{name=decodeURIComponent(encodedName||'');}catch{throw fail('Nome de arquivo inválido.');}
    name=cleanText(name,180,'Nome de arquivo');if(!name||/[\\/\r\n]/.test(name))throw fail('Nome de arquivo inválido.');
    const ext=name.split('.').pop().toLowerCase();let mime;
    if(ext==='pdf'&&bytes.subarray(0,5).toString()==='%PDF-')mime='application/pdf';
    else if(ext==='png'&&bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))mime='image/png';
    else if(['jpg','jpeg'].includes(ext)&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255)mime='image/jpeg';
    else if(ext==='webp'&&bytes.subarray(0,4).toString()==='RIFF'&&bytes.subarray(8,12).toString()==='WEBP')mime='image/webp';
    else if(['mp4','m4v'].includes(ext)&&bytes.subarray(4,8).toString()==='ftyp')mime='video/mp4';
    else if(ext==='webm'&&bytes.subarray(0,4).equals(Buffer.from([26,69,223,163])))mime='video/webm';
    else throw fail('Envie PDF, imagem PNG/JPG/WebP ou vídeo MP4/WebM com formato válido.');
    const limit=mime.startsWith('video/')?maxContentFileBytes:25*1024*1024;
    if(bytes.length>limit)throw fail(`O ${mime.startsWith('video/')?'vídeo pode ter até 40 MB':'arquivo pode ter até 25 MB'}.`,413);
    const assetId=randomUUID(),now=new Date().toISOString();
    return transaction(()=>{db.prepare('INSERT INTO academy_content_asset(id,content_id,name,mime,size,sha256,bytes,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?)').run(assetId,id,name,mime,bytes.length,createHash('sha256').update(bytes).digest('hex'),bytes,actor,now);const changed=db.prepare('UPDATE academy_content SET asset_id=?,revision=revision+1,updated_by=?,updated_at=? WHERE id=? AND revision=?').run(assetId,actor,now,id,revision);if(changed.changes!==1)throw fail('O conteúdo foi atualizado. Reabra antes de enviar o arquivo.',409);audit(actor,id,'content.file_uploaded',snapshot(current),snapshot(row(id)));return serialize(row(id),true,true);});
  };
  const detail=(viewer,id,admin=false)=>{const record=row(id);if(!record||!readable(viewer,record))throw fail('Conteúdo não encontrado ou não liberado.',404);const data=serialize(record,true,admin);if(viewer.role!=='admin')data.tracks=data.tracks.filter(id=>hasTrack(viewer,id));return data;};
  const file=(viewer,id)=>{const record=row(id);if(!readable(viewer,record)||!record.asset_id)throw fail('Arquivo não encontrado ou não liberado.',404);return db.prepare('SELECT name,mime,bytes,sha256 FROM academy_content_asset WHERE id=? AND content_id=?').get(record.asset_id,id);};
  const cover=(viewer,id)=>{const record=row(id);if(!readable(viewer,record)||!serialize(record).hasCover)throw fail('Capa não encontrada ou não liberada.',404);return knowledgeCover(id);};
  return {visible,create,update,upload,detail,file,cover,withReadBatch:batch.run,adminRecord:id=>row(id)?serialize(row(id),true,true):null,list:(includeDeleted=false)=>db.prepare('SELECT * FROM academy_content'+(includeDeleted?'':' WHERE deleted_at IS NULL')+' ORDER BY updated_at DESC').all().map(r=>serialize(r,false,true))};
}
