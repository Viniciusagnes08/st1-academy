import {createHash} from 'node:crypto';
import {hasPermission} from './access.mjs';
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
export const materialVersion=item=>item.kind+':'+(item.kind==='file'?item.asset?.sha256||'pending':createHash('sha256').update(item.kind==='text'?item.body:item.url).digest('hex'));
export function createReadingService(db,contents){
  db.exec('CREATE TABLE IF NOT EXISTS academy_reading(user_id TEXT NOT NULL REFERENCES user(id),content_id TEXT NOT NULL REFERENCES academy_content(id),asset_id TEXT NOT NULL,page INTEGER NOT NULL,pages INTEGER NOT NULL,last_read_at TEXT NOT NULL,dismissed_at TEXT,PRIMARY KEY(user_id,content_id))');
  db.exec('CREATE TABLE IF NOT EXISTS academy_material_study(user_id TEXT NOT NULL REFERENCES user(id),content_id TEXT NOT NULL REFERENCES academy_content(id),version_key TEXT NOT NULL,started_at TEXT NOT NULL,last_studied_at TEXT NOT NULL,completed_at TEXT,PRIMARY KEY(user_id,content_id))');
  if(!db.prepare('PRAGMA table_info(academy_reading)').all().some(c=>c.name==='max_page'))db.exec('ALTER TABLE academy_reading ADD COLUMN max_page INTEGER NOT NULL DEFAULT 1; UPDATE academy_reading SET max_page=page');
  const version=materialVersion;
  const current=(viewer,id)=>{const item=contents.detail(viewer,id);if(item.kind!=='file'||item.asset?.mime!=='application/pdf')throw fail('A retomada se aplica a materiais PDF.');return item;};
  const forItem=(viewer,item)=>{
    // The caller checks content visibility before projecting private study state.
    const key=version(item),record=db.prepare('SELECT * FROM academy_material_study WHERE user_id=? AND content_id=? AND version_key=?').get(viewer.user_id,item.id,key);
    const reading=item.asset?.mime==='application/pdf'?db.prepare('SELECT * FROM academy_reading WHERE user_id=? AND content_id=? AND asset_id=?').get(viewer.user_id,item.id,item.asset.id):null;
    const completed=!!record?.completed_at;
    return {contentId:item.id,version:key,started:!!record||!!reading,completed,completedAt:record?.completed_at||null,lastStudiedAt:record?.last_studied_at||reading?.last_read_at||null,page:reading?.page||null,pages:reading?.pages||item.pages||null,percent:completed?100:reading?Math.min(99,Math.round(reading.max_page/reading.pages*100)):0};
  };
  const detailStudy=(viewer,id)=>forItem(viewer,contents.detail(viewer,id));
  const writableItem=(viewer,id,input)=>{const item=contents.detail(viewer,id);if(item.status!=='published'||item.kind==='file'&&!item.asset)throw fail('Publique o material antes de registrar o estudo.',400);if(input?.version!==version(item))throw fail('Este material foi atualizado. Abra a versão atual para registrar seu estudo.',409);return item;};
  const startItem=(viewer,item)=>{
    const now=new Date().toISOString();
    db.prepare(`INSERT INTO academy_material_study(user_id,content_id,version_key,started_at,last_studied_at,completed_at) VALUES(?,?,?,?,?,NULL)
      ON CONFLICT(user_id,content_id) DO UPDATE SET version_key=excluded.version_key,started_at=CASE WHEN academy_material_study.version_key=excluded.version_key THEN academy_material_study.started_at ELSE excluded.started_at END,last_studied_at=excluded.last_studied_at,completed_at=CASE WHEN academy_material_study.version_key=excluded.version_key THEN academy_material_study.completed_at ELSE NULL END`).run(viewer.user_id,item.id,version(item),now,now);
    return forItem(viewer,item);
  };
  const start=(viewer,id,input)=>startItem(viewer,writableItem(viewer,id,input));
  const complete=(viewer,id,input)=>{
    const item=writableItem(viewer,id,input);if(typeof input.completed!=='boolean')throw fail('Informe se o estudo foi concluído.');
    startItem(viewer,item);
    db.prepare('UPDATE academy_material_study SET completed_at=CASE WHEN ?=1 THEN COALESCE(completed_at,?) ELSE NULL END WHERE user_id=? AND content_id=? AND version_key=?').run(input.completed?1:0,new Date().toISOString(),viewer.user_id,id,version(item));
    return forItem(viewer,item);
  };
  const serialize=(record,item)=>({contentId:item.id,title:item.title,page:record.page,pages:record.pages,lastReadAt:record.last_read_at});
  const detail=(viewer,id)=>{const item=current(viewer,id),record=db.prepare('SELECT * FROM academy_reading WHERE user_id=? AND content_id=? AND asset_id=?').get(viewer.user_id,id,item.asset.id);return record?serialize(record,item):null;};
  const save=(viewer,id,input)=>{
    const item=current(viewer,id);if(!Number.isInteger(input?.page)||!Number.isInteger(input?.pages)||input.pages<1||input.pages>10000||input.page<1||input.page>input.pages||item.pages&&item.pages!==input.pages)throw fail('Página ou quantidade de páginas inválida.');
    db.prepare(`INSERT INTO academy_reading(user_id,content_id,asset_id,page,pages,max_page,last_read_at,dismissed_at) VALUES(?,?,?,?,?,?,?,NULL)
      ON CONFLICT(user_id,content_id) DO UPDATE SET max_page=CASE WHEN academy_reading.asset_id=excluded.asset_id THEN MAX(academy_reading.max_page,excluded.max_page) ELSE excluded.max_page END,asset_id=excluded.asset_id,page=excluded.page,pages=excluded.pages,last_read_at=excluded.last_read_at,dismissed_at=NULL`).run(viewer.user_id,id,item.asset.id,input.page,input.pages,input.page,new Date().toISOString());
    if(item.status==='published')startItem(viewer,item);
    return {...detail(viewer,id),study:forItem(viewer,item)};
  };
  const latest=viewer=>{if(!hasPermission(viewer,'materials'))throw fail('Conteúdos não liberados.',403);for(const record of db.prepare('SELECT * FROM academy_reading WHERE user_id=? AND dismissed_at IS NULL ORDER BY last_read_at DESC').all(viewer.user_id)){try{const item=contents.detail(viewer,record.content_id);if(item.status==='published'&&item.kind==='file'&&item.asset?.mime==='application/pdf'&&item.asset.id===record.asset_id&&!forItem(viewer,item).completed)return serialize(record,item);}catch(error){if(error.status!==404&&error.status!==403)throw error;}}return null;};
  const recent=viewer=>{if(!hasPermission(viewer,'materials'))throw fail('Conteúdos não liberados.',403);for(const record of db.prepare('SELECT * FROM academy_material_study WHERE user_id=? ORDER BY last_studied_at DESC').all(viewer.user_id)){try{const item=contents.detail(viewer,record.content_id);if(item.status==='published'&&record.version_key===version(item))return {...forItem(viewer,item),title:item.title};}catch(error){if(error.status!==404&&error.status!==403)throw error;}}return null;};
  const dismiss=(viewer,id)=>{current(viewer,id);db.prepare('UPDATE academy_reading SET dismissed_at=? WHERE user_id=? AND content_id=?').run(new Date().toISOString(),viewer.user_id,id);return {dismissed:true};};
  return {detail,save,latest,dismiss,forItem,detailStudy,start,complete,recent};
}
