import {randomUUID} from 'node:crypto';

const reactions=[['👍','Gostei'],['❤️','Amei'],['👏','Parabéns'],['🔥','Muito bom'],['🤯','Aprendi algo novo']];
const fail=(message,status=400)=>Object.assign(new Error(message),{status});

export function createContentEngagementService(db,contents){
  db.exec(`CREATE TABLE IF NOT EXISTS academy_content_reaction(
    content_id TEXT NOT NULL REFERENCES academy_content(id),user_id TEXT NOT NULL REFERENCES user(id),
    emoji TEXT NOT NULL,created_at TEXT NOT NULL,PRIMARY KEY(content_id,user_id));
    CREATE TABLE IF NOT EXISTS academy_content_save(
    content_id TEXT NOT NULL REFERENCES academy_content(id),user_id TEXT NOT NULL REFERENCES user(id),
    created_at TEXT NOT NULL,PRIMARY KEY(content_id,user_id));
    CREATE TABLE IF NOT EXISTS academy_content_comment(
    id TEXT PRIMARY KEY,content_id TEXT NOT NULL REFERENCES academy_content(id),user_id TEXT NOT NULL REFERENCES user(id),
    body TEXT NOT NULL,created_at TEXT NOT NULL,deleted_at TEXT);
    CREATE INDEX IF NOT EXISTS academy_content_comment_recent_idx ON academy_content_comment(content_id,created_at);`);

  const readable=(viewer,id)=>contents.detail(viewer,id);
  const detail=(viewer,id)=>{
    readable(viewer,id);
    const selected=db.prepare('SELECT emoji FROM academy_content_reaction WHERE content_id=? AND user_id=?').get(id,viewer.user_id)?.emoji||null;
    const counts=new Map(db.prepare('SELECT emoji,count(*) AS count FROM academy_content_reaction WHERE content_id=? GROUP BY emoji').all(id).map(row=>[row.emoji,Number(row.count)]));
    const saved=!!db.prepare('SELECT 1 FROM academy_content_save WHERE content_id=? AND user_id=?').get(id,viewer.user_id);
    const commentCount=Number(db.prepare('SELECT count(*) AS count FROM academy_content_comment WHERE content_id=? AND deleted_at IS NULL').get(id).count);
    const comments=db.prepare('SELECT c.id,c.user_id,c.body,c.created_at,u.name FROM academy_content_comment c JOIN user u ON u.id=c.user_id WHERE c.content_id=? AND c.deleted_at IS NULL ORDER BY c.created_at DESC LIMIT 50').all(id).map(row=>({id:row.id,userId:row.user_id,name:row.name||'Pessoa da Academy',body:row.body,createdAt:row.created_at,canDelete:row.user_id===viewer.user_id||viewer.role==='admin'}));
    return {reactions:reactions.map(([emoji,label])=>({emoji,label,count:counts.get(emoji)||0,selected:selected===emoji})),saved,commentCount,comments};
  };
  const react=(viewer,id,emoji)=>{
    readable(viewer,id);
    if(!reactions.some(([value])=>value===emoji))throw fail('Escolha uma reação disponível.');
    const previous=db.prepare('SELECT emoji FROM academy_content_reaction WHERE content_id=? AND user_id=?').get(id,viewer.user_id);
    if(previous?.emoji===emoji)db.prepare('DELETE FROM academy_content_reaction WHERE content_id=? AND user_id=?').run(id,viewer.user_id);
    else if(previous)db.prepare('UPDATE academy_content_reaction SET emoji=?,created_at=? WHERE content_id=? AND user_id=?').run(emoji,new Date().toISOString(),id,viewer.user_id);
    else db.prepare('INSERT INTO academy_content_reaction(content_id,user_id,emoji,created_at) VALUES(?,?,?,?)').run(id,viewer.user_id,emoji,new Date().toISOString());
    return detail(viewer,id);
  };
  const save=(viewer,id,value)=>{
    readable(viewer,id);
    if(typeof value!=='boolean')throw fail('Informe se deseja salvar o conteúdo.');
    if(value&&!db.prepare('SELECT 1 FROM academy_content_save WHERE content_id=? AND user_id=?').get(id,viewer.user_id))db.prepare('INSERT INTO academy_content_save(content_id,user_id,created_at) VALUES(?,?,?)').run(id,viewer.user_id,new Date().toISOString());
    if(!value)db.prepare('DELETE FROM academy_content_save WHERE content_id=? AND user_id=?').run(id,viewer.user_id);
    return detail(viewer,id);
  };
  const comment=(viewer,id,body)=>{
    readable(viewer,id);
    if(typeof body!=='string'||body.trim().length<2||body.length>1000||/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(body))throw fail('Escreva um comentário entre 2 e 1.000 caracteres.');
    db.prepare('INSERT INTO academy_content_comment(id,content_id,user_id,body,created_at) VALUES(?,?,?,?,?)').run(randomUUID(),id,viewer.user_id,body.trim(),new Date().toISOString());
    return detail(viewer,id);
  };
  const removeComment=(viewer,id,commentId)=>{
    readable(viewer,id);
    const row=db.prepare('SELECT user_id,deleted_at FROM academy_content_comment WHERE id=? AND content_id=?').get(commentId,id);
    if(!row||row.deleted_at)throw fail('Comentário não encontrado.',404);
    if(row.user_id!==viewer.user_id&&viewer.role!=='admin')throw fail('Você não pode excluir este comentário.',403);
    db.prepare('UPDATE academy_content_comment SET deleted_at=? WHERE id=? AND content_id=?').run(new Date().toISOString(),commentId,id);
    return detail(viewer,id);
  };
  const saved=(viewer)=>{
    const items=contents.visible(viewer),ids=new Set(db.prepare('SELECT content_id FROM academy_content_save WHERE user_id=? ORDER BY created_at DESC').all(viewer.user_id).map(row=>row.content_id));
    return {items:items.filter(item=>ids.has(item.id))};
  };
  return {detail,react,save,comment,removeComment,saved};
}
