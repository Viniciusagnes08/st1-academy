import {readFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash,randomUUID} from 'node:crypto';

const libraryRoot=resolve(dirname(fileURLToPath(import.meta.url)),'../content/library');
export const knowledgeManifest=JSON.parse(readFileSync(resolve(libraryRoot,'manifest.json'),'utf8'));
export const knowledgeById=new Map(knowledgeManifest.map(item=>[item.id,item]));
export const biLegacyManifest=JSON.parse(readFileSync(resolve(libraryRoot,'bi-legacy-manifest.json'),'utf8'));
export const knowledgeCover=id=>readFileSync(resolve(libraryRoot,knowledgeById.get(id).cover));

export function importKnowledgeLibrary(db,actor,audit){
  const sources=[],updates=[],conflicts=[];
  for(const item of knowledgeManifest){
    const current=db.prepare('SELECT id,title,summary,status,revision,asset_id,deleted_at FROM academy_content WHERE id=?').get(item.id);
    if(!current){
      const bytes=readFileSync(resolve(libraryRoot,'files',item.file));
      if(createHash('sha256').update(bytes).digest('hex')!==item.sha256)throw new Error('O material original foi alterado: '+item.file);
      sources.push({item,bytes});continue;
    }
    if(!item.id.startsWith('st1-bi-'))continue;
    const prior=biLegacyManifest.contents[item.id];
    const oldAsset=current.asset_id&&db.prepare('SELECT id,name,sha256 FROM academy_content_asset WHERE id=?').get(current.asset_id);
    if(oldAsset?.sha256===item.sha256)continue;
    if(!prior||oldAsset?.sha256!==prior.sha256||current.status!=='published'||current.deleted_at){conflicts.push(item.id);continue;}
    const bytes=readFileSync(resolve(libraryRoot,'files',item.file));
    if(createHash('sha256').update(bytes).digest('hex')!==item.sha256)throw new Error('O material original foi alterado: '+item.file);
    updates.push({item,bytes,current,oldAsset,prior});
  }
  if(!sources.length&&!updates.length)return {created:0,updated:0,conflicts};
  const admin=db.prepare("SELECT role,enabled FROM academy_member WHERE user_id=?").get(actor);
  if(admin?.role!=='admin'||admin.enabled!==1)throw new Error('A importação exige um Admin ativo.');
  db.exec('BEGIN IMMEDIATE');
  try{
    for(const {item,bytes} of sources){
      const assetId=randomUUID(),now=new Date().toISOString();
      db.prepare('INSERT INTO academy_content(id,title,summary,category,modules_json,kind,tracks_json,audience_json,status,scope,revision,asset_id,created_by,updated_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(item.id,item.title,item.summary,item.category,JSON.stringify(item.modules||[]),'file',JSON.stringify(item.tracks),'["seller","supervisor"]','published',item.scope||'general',0,assetId,actor,actor,now,now);
      db.prepare('INSERT INTO academy_content_asset(id,content_id,name,mime,size,sha256,bytes,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?)').run(assetId,item.id,item.file,'application/pdf',bytes.length,item.sha256,bytes,actor,now);
      audit(actor,item.id,'content.imported',null,{title:item.title,category:item.category,scope:item.scope||'general',sha256:item.sha256,source:item.id.startsWith('st1-bi-')?'ST1 Academy BI':item.id.startsWith('st1-db-')?'ST1 Academy Tech':'Central Comercial ST1'});
    }
    for(const {item,bytes,current,oldAsset,prior} of updates){
      const assetId=randomUUID(),now=new Date().toISOString();
      db.prepare('INSERT INTO academy_content_asset(id,content_id,name,mime,size,sha256,bytes,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?)').run(assetId,item.id,item.file,'application/pdf',bytes.length,item.sha256,bytes,actor,now);
      const changed=db.prepare('UPDATE academy_content SET title=CASE WHEN title=? THEN ? ELSE title END,summary=CASE WHEN summary=? THEN ? ELSE summary END,asset_id=?,revision=revision+1,updated_by=?,updated_at=? WHERE id=? AND revision=? AND asset_id=?').run(prior.title,item.title,prior.summary,item.summary,assetId,actor,now,item.id,current.revision,oldAsset.id);
      if(changed.changes!==1)throw new Error('O material foi alterado durante a atualização: '+item.id);
      audit(actor,item.id,'content.file_replaced',{title:current.title,summary:current.summary,assetId:oldAsset.id,name:oldAsset.name,sha256:oldAsset.sha256},{title:current.title===prior.title?item.title:current.title,summary:current.summary===prior.summary?item.summary:current.summary,assetId,name:item.file,sha256:item.sha256});
    }
    db.exec('COMMIT');return {created:sources.length,updated:updates.length,conflicts};
  }catch(error){db.exec('ROLLBACK');throw error;}
}
