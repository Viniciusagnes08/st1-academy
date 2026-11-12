import {randomUUID} from 'node:crypto';
import {hasPermission,hasTrack} from './access.mjs';
import {knowledgeManifest,biLegacyManifest} from './knowledge.mjs';
import {biModules} from '../content/bi-course.mjs';
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
const defaults=[['pap','Vendas | PAP','Planos, aplicativos e processo de venda porta a porta.'],['digital','Vendas | Digital','Produtos e processo comercial do primeiro atendimento à instalação.'],['elite','Vendas | PAP Elite','Ofertas da linha Elite e condução da venda consultiva.'],['indoor','Vendas | Indoor','Planos Prestige e Família para vendas em condomínios.'],['pme','Vendas | PME','Produtos, aplicativos e condições de venda para pequenos negócios.']];
export function createModuleService(db,bank,audit){
  db.exec(`CREATE TABLE IF NOT EXISTS academy_module(id TEXT PRIMARY KEY,title TEXT NOT NULL,description TEXT NOT NULL,tracks_json TEXT NOT NULL,audience_json TEXT NOT NULL,status TEXT NOT NULL CHECK(status IN ('published','archived')),revision INTEGER NOT NULL DEFAULT 0,created_by TEXT NOT NULL REFERENCES user(id),updated_by TEXT NOT NULL REFERENCES user(id),created_at TEXT NOT NULL,updated_at TEXT NOT NULL);`);
  if(!db.prepare('PRAGMA table_info(academy_module)').all().some(c=>c.name==='scope'))db.exec("ALTER TABLE academy_module ADD COLUMN scope TEXT NOT NULL DEFAULT 'general'");
  const row=id=>db.prepare('SELECT * FROM academy_module WHERE id=?').get(id);
  const serialize=r=>({id:r.id,title:r.title,description:r.description,tracks:JSON.parse(r.tracks_json),audience:JSON.parse(r.audience_json),status:r.status,scope:r.scope,revision:r.revision});
  const normalize=(input,current)=>{
    const value={description:'',audience:['seller','supervisor'],status:'published',scope:'general',...(current?serialize(current):{}),...input};
    if(!['general','strategy'].includes(value.scope))throw fail('Escolha uma área de acesso válida.');
    if(typeof value.title!=='string'||value.title.trim().length<3||value.title.length>80||typeof value.description!=='string'||value.description.length>320)throw fail('Informe um nome de 3 a 80 caracteres e uma descrição de até 320 caracteres.');
    if(!Array.isArray(value.tracks)||!value.tracks.length||value.tracks.some(id=>!bank.tracks.some(t=>t.id===id)))throw fail('Escolha pelo menos uma trilha válida para o módulo.');
    if(!Array.isArray(value.audience)||value.audience.some(role=>!['seller','supervisor'].includes(role)))throw fail('Escolha um público válido.');
    if(!['published','archived'].includes(value.status))throw fail('Escolha Publicado ou Arquivado.');
    return {...value,title:value.title.trim(),description:value.description.trim(),tracks:[...new Set(value.tracks)],audience:[...new Set(value.audience)]};
  };
  const create=(actor,input,id=randomUUID())=>{const value=normalize(input),now=new Date().toISOString();db.prepare('INSERT INTO academy_module(id,title,description,tracks_json,audience_json,status,scope,created_by,updated_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(id,value.title,value.description,JSON.stringify(value.tracks),JSON.stringify(value.audience),value.status,value.scope,actor,actor,now,now);audit(actor,id,'module.created',null,serialize(row(id)));return serialize(row(id));};
  const update=(actor,id,input)=>{const current=row(id);if(!current)throw fail('Módulo não encontrado.',404);if(input?.revision!==current.revision)throw fail('Este módulo foi atualizado. Reabra para continuar.',409);const value=normalize(input,current);const changed=db.prepare('UPDATE academy_module SET title=?,description=?,tracks_json=?,audience_json=?,status=?,scope=?,revision=revision+1,updated_by=?,updated_at=? WHERE id=? AND revision=?').run(value.title,value.description,JSON.stringify(value.tracks),JSON.stringify(value.audience),value.status,value.scope,actor,new Date().toISOString(),id,current.revision);if(changed.changes!==1)throw fail('Este módulo foi atualizado. Reabra para continuar.',409);audit(actor,id,'module.updated',serialize(current),serialize(row(id)));return serialize(row(id));};
  const list=()=>db.prepare('SELECT * FROM academy_module ORDER BY created_at,id').all().map(serialize);
  const visible=viewer=>{if(!hasPermission(viewer,'materials'))throw fail('Conteúdos não liberados.',403);return list().filter(m=>m.status==='published'&&(viewer.role==='admin'||m.audience.includes(viewer.role)&&(m.scope!=='strategy'||hasPermission(viewer,'strategy'))&&(m.scope==='strategy'||m.tracks.some(id=>hasTrack(viewer,id))))).map(m=>({...m,tracks:m.tracks.filter(id=>hasTrack(viewer,id))}));};
  const seed=actor=>{
    for(const [track,title,description] of defaults)if(!row('vendas-'+track))create(actor,{title,description,tracks:[track]},'vendas-'+track);
    for(const module of biModules){
      const current=row(module.id);
      if(!current){create(actor,module,module.id);continue;}
      if(current.title===biLegacyManifest.modules[module.id])update(actor,module.id,{...module,revision:current.revision});
    }
  };
  const linkDefaults=()=>{if(db.prepare("SELECT 1 FROM academy_settings WHERE key='library_modules_linked_v2'").get())return;db.exec('BEGIN IMMEDIATE');try{for(const item of knowledgeManifest)db.prepare("UPDATE academy_content SET modules_json=? WHERE id=? AND modules_json='[]'").run(JSON.stringify(item.modules||item.tracks.map(track=>'vendas-'+track)),item.id);db.prepare("INSERT INTO academy_settings(key,value) VALUES('library_modules_linked_v2','1')").run();db.exec('COMMIT');}catch(error){db.exec('ROLLBACK');throw error;}};
  return {create,update,list,visible,seed,linkDefaults,detail:id=>{const r=row(id);if(!r)throw fail('Módulo não encontrado.',404);return serialize(r);}};
}
