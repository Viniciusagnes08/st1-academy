import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {projectRoot} from './project-paths.mjs';
import {createHash,randomUUID} from 'node:crypto';

const libraryRoot=resolve(projectRoot,'content/library');
export const knowledgeManifest=JSON.parse(readFileSync(resolve(libraryRoot,'manifest.json'),'utf8'));
export const knowledgeById=new Map(knowledgeManifest.map(item=>[item.id,item]));
export const knowledgeCover=id=>readFileSync(resolve(libraryRoot,knowledgeById.get(id).cover));

export function importKnowledgeLibrary(db,actor,audit){
  const sources=knowledgeManifest.filter(item=>!db.prepare('SELECT 1 FROM academy_content WHERE id=?').get(item.id)).map(item=>{
    const bytes=readFileSync(resolve(libraryRoot,'files',item.file));
    if(createHash('sha256').update(bytes).digest('hex')!==item.sha256)throw new Error('O material original foi alterado: '+item.file);
    return {item,bytes};
  });
  if(!sources.length)return {created:0};
  const admin=db.prepare("SELECT role,enabled FROM academy_member WHERE user_id=?").get(actor);
  if(admin?.role!=='admin'||admin.enabled!==1)throw new Error('A importação exige um Admin ativo.');
  db.exec('BEGIN IMMEDIATE');
  try{
    for(const {item,bytes} of sources){
      const assetId=randomUUID(),now=new Date().toISOString();
      db.prepare('INSERT INTO academy_content(id,title,summary,category,kind,tracks_json,audience_json,status,revision,asset_id,created_by,updated_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(item.id,item.title,item.summary,item.category,'file',JSON.stringify(item.tracks),'["seller","supervisor"]','published',0,assetId,actor,actor,now,now);
      db.prepare('INSERT INTO academy_content_asset(id,content_id,name,mime,size,sha256,bytes,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?)').run(assetId,item.id,item.file,'application/pdf',bytes.length,item.sha256,bytes,actor,now);
      audit(actor,item.id,'content.imported',null,{title:item.title,category:item.category,sha256:item.sha256,source:'Central Comercial ST1'});
    }
    db.exec('COMMIT');return {created:sources.length};
  }catch(error){db.exec('ROLLBACK');throw error;}
}
