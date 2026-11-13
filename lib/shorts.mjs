import {randomUUID} from 'node:crypto';

const fail=(message,status=400)=>Object.assign(new Error(message),{status});
const text=(value,max,label)=>{const result=String(value??'').trim();if(!result||result.length>max||/[\u0000-\u001f]/.test(result))throw fail(label+' inválido.');return result;};
const stopWords=new Set('a ao aos as com da das de do dos e em na nas no nos o os ou para por que se um uma umas uns você voces sua suas seu seus sobre todo todos toda todas mais muito muita muitos muitas como quando onde quem qual quais essa esse isso esta está este isto são ser foi fui tem têm não sim'.split(' '));
const words=value=>[...new Set(String(value||'').toLocaleLowerCase('pt-BR').normalize('NFD').replace(/[\u0300-\u036f]/g,'').match(/[a-z0-9]{4,}/g)||[])].filter(word=>!stopWords.has(word));
const hash=value=>{let result=2166136261;for(const character of String(value)){result^=character.charCodeAt(0);result=Math.imul(result,16777619);}return result>>>0;};
const sessionKey=value=>/^[a-zA-Z0-9_-]{8,120}$/.test(String(value||''))?String(value):randomUUID();
const coverMime=bytes=>{
  if(bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return 'image/png';
  if(bytes[0]===255&&bytes[1]===216&&bytes[2]===255)return 'image/jpeg';
  if(bytes.subarray(0,4).toString()==='RIFF'&&bytes.subarray(8,12).toString()==='WEBP')return 'image/webp';
  throw fail('Envie uma capa JPG, PNG ou WebP.');
};
export const videoDuration=bytes=>{
  if(!Buffer.isBuffer(bytes)||bytes.length<32||!['ftyp','moov','mdat','wide','free'].includes(bytes.toString('ascii',4,8)))throw fail('Envie um vídeo MP4 ou MOV válido.');
  let hasMedia=false;for(let at=0;at+8<=bytes.length;){let size=bytes.readUInt32BE(at),header=8;if(size===1){if(at+16>bytes.length)break;size=Number(bytes.readBigUInt64BE(at+8));header=16;}else if(size===0)size=bytes.length-at;if(!Number.isSafeInteger(size)||size<header||at+size>bytes.length)break;if(bytes.toString('ascii',at+4,at+8)==='mdat'&&size>header)hasMedia=true;at+=size;}
  if(!hasMedia)throw fail('O arquivo não contém dados de vídeo.');
  const scan=(start,end)=>{
    for(let at=start;at+8<=end;){
      let size=bytes.readUInt32BE(at),header=8;
      if(size===1){if(at+16>end)return null;size=Number(bytes.readBigUInt64BE(at+8));header=16;}
      else if(size===0)size=end-at;
      if(!Number.isSafeInteger(size)||size<header||at+size>end)return null;
      const kind=bytes.toString('ascii',at+4,at+8);
      if(kind==='mvhd')return {start:at+header,end:at+size};
      if(kind==='moov'){const found=scan(at+header,at+size);if(found)return found;}
      at+=size;
    }
    return null;
  };
  const atom=scan(0,bytes.length);if(!atom)throw fail('Não foi possível verificar a duração do vídeo.');
  const v=bytes[atom.start];let scale,duration;
  if(v===0&&atom.start+20<=atom.end){scale=bytes.readUInt32BE(atom.start+12);duration=bytes.readUInt32BE(atom.start+16);}
  else if(v===1&&atom.start+32<=atom.end){scale=bytes.readUInt32BE(atom.start+20);duration=Number(bytes.readBigUInt64BE(atom.start+24));}
  else throw fail('Duração do vídeo inválida.');
  const seconds=duration/scale;if(!Number.isFinite(seconds)||seconds<=0||seconds>300)throw fail('O vídeo deve ter até 5 minutos.');
  return seconds;
};

export function createShortsService(db){
  db.exec("CREATE TABLE IF NOT EXISTS academy_short(id TEXT PRIMARY KEY,author_id TEXT NOT NULL REFERENCES user(id),title TEXT NOT NULL,description TEXT NOT NULL,subject TEXT NOT NULL,channel TEXT NOT NULL,source TEXT NOT NULL DEFAULT '',cover_mime TEXT NOT NULL,cover_bytes BLOB NOT NULL,video_mime TEXT,video_bytes BLOB,duration_seconds REAL,status TEXT NOT NULL DEFAULT 'draft',created_at TEXT NOT NULL,published_at TEXT,removed_at TEXT);");
  db.exec("CREATE TABLE IF NOT EXISTS academy_short_like(short_id TEXT NOT NULL REFERENCES academy_short(id),user_id TEXT NOT NULL REFERENCES user(id),PRIMARY KEY(short_id,user_id));CREATE TABLE IF NOT EXISTS academy_short_save(short_id TEXT NOT NULL REFERENCES academy_short(id),user_id TEXT NOT NULL REFERENCES user(id),PRIMARY KEY(short_id,user_id));CREATE TABLE IF NOT EXISTS academy_short_view(short_id TEXT NOT NULL REFERENCES academy_short(id),user_id TEXT NOT NULL REFERENCES user(id),PRIMARY KEY(short_id,user_id));CREATE TABLE IF NOT EXISTS academy_short_share(id TEXT PRIMARY KEY,short_id TEXT NOT NULL REFERENCES academy_short(id),user_id TEXT NOT NULL REFERENCES user(id));CREATE TABLE IF NOT EXISTS academy_short_comment(id TEXT PRIMARY KEY,short_id TEXT NOT NULL REFERENCES academy_short(id),user_id TEXT NOT NULL REFERENCES user(id),body TEXT NOT NULL,created_at TEXT NOT NULL,removed_at TEXT);");
  const active=id=>{const row=db.prepare("SELECT id,author_id FROM academy_short WHERE id=? AND status='published'").get(id);if(!row)throw fail('Vídeo não encontrado.',404);return row;};
  const details=(row,userId)=>({id:row.id,authorId:row.author_id,authorName:row.author_name,title:row.title,description:row.description,durationSeconds:row.duration_seconds,mediaKind:row.video_mime?.startsWith('image/')?'image':'video',publishedAt:row.published_at,mediaUrl:'/api/shorts/'+row.id+'/video',coverUrl:'/api/shorts/'+row.id+'/cover',likes:db.prepare('SELECT count(*) n FROM academy_short_like WHERE short_id=?').get(row.id).n,comments:db.prepare('SELECT count(*) n FROM academy_short_comment WHERE short_id=? AND removed_at IS NULL').get(row.id).n,views:db.prepare('SELECT count(*) n FROM academy_short_view WHERE short_id=?').get(row.id).n,shares:db.prepare('SELECT count(*) n FROM academy_short_share WHERE short_id=?').get(row.id).n,liked:!!db.prepare('SELECT 1 FROM academy_short_like WHERE short_id=? AND user_id=?').get(row.id,userId),saved:!!db.prepare('SELECT 1 FROM academy_short_save WHERE short_id=? AND user_id=?').get(row.id,userId)});
  const feed=(userId,saved=false,offset=0,session,avoid)=>{
    const page=Math.max(0,Math.min(10000,Number(offset)||0)),key=sessionKey(session),avoidId=/^[a-f0-9-]{36}$/i.test(String(avoid||''))?String(avoid):'';
    if(saved){const rows=db.prepare("SELECT s.id,s.author_id,s.title,s.description,s.video_mime,s.duration_seconds,s.published_at,u.name AS author_name FROM academy_short s JOIN user u ON u.id=s.author_id JOIN academy_short_save sv ON sv.short_id=s.id AND sv.user_id=? WHERE s.status='published' ORDER BY s.published_at DESC LIMIT 12 OFFSET ?").all(userId,page);return {items:rows.map(row=>details(row,userId)),nextOffset:rows.length===12?page+12:null,session:key};}
    const rows=db.prepare("SELECT s.id,s.author_id,s.title,s.description,s.video_mime,s.duration_seconds,s.published_at,u.name AS author_name,EXISTS(SELECT 1 FROM academy_short_view v WHERE v.short_id=s.id AND v.user_id=?) AS seen,(SELECT count(*) FROM academy_short_like l WHERE l.short_id=s.id) AS likes,(SELECT count(*) FROM academy_short_save sv WHERE sv.short_id=s.id) AS saves,(SELECT count(*) FROM academy_short_comment c WHERE c.short_id=s.id AND c.removed_at IS NULL) AS comments,(SELECT count(*) FROM academy_short_share sh WHERE sh.short_id=s.id) AS shares FROM academy_short s JOIN user u ON u.id=s.author_id WHERE s.status='published'").all(userId);
    const behavior=db.prepare("SELECT s.author_id,s.title,s.description,EXISTS(SELECT 1 FROM academy_short_like l WHERE l.short_id=s.id AND l.user_id=?) AS liked,EXISTS(SELECT 1 FROM academy_short_save sv WHERE sv.short_id=s.id AND sv.user_id=?) AS saved,EXISTS(SELECT 1 FROM academy_short_comment c WHERE c.short_id=s.id AND c.user_id=? AND c.removed_at IS NULL) AS commented,EXISTS(SELECT 1 FROM academy_short_share sh WHERE sh.short_id=s.id AND sh.user_id=?) AS shared FROM academy_short s WHERE s.status='published'").all(userId,userId,userId,userId);
    const authors=new Map(),interests=new Map();
    for(const item of behavior){const weight=(item.liked?5:0)+(item.saved?8:0)+(item.commented?10:0)+(item.shared?6:0);if(!weight)continue;authors.set(item.author_id,(authors.get(item.author_id)||0)+weight);for(const word of words(item.title+' '+item.description))interests.set(word,(interests.get(word)||0)+weight);}
    const now=Date.now(),ranked=rows.map(row=>{const age=Math.max(0,(now-Date.parse(row.published_at))/86400000),topic=words(row.title+' '+row.description).reduce((total,word)=>total+(interests.get(word)||0),0),author=authors.get(row.author_id)||0,popularity=Math.log1p(Number(row.likes))*3+Math.log1p(Number(row.saves))*5+Math.log1p(Number(row.comments))*4+Math.log1p(Number(row.shares))*4,freshness=Math.max(0,24-age)/3,variation=(hash(key+'|'+row.id)%100000)/100000;return {row,score:(row.seen?0:100000)+(row.id===avoidId?-200000:0)+author*90+topic*7+popularity+freshness+variation};}).sort((left,right)=>right.score-left.score).map(entry=>entry.row);
    const slice=ranked.slice(page,page+12);return {items:slice.map(row=>details(row,userId)),nextOffset:page+12<ranked.length?page+12:null,session:key};
  };
  const one=(userId,id)=>{active(id);return details(db.prepare('SELECT s.id,s.author_id,s.title,s.description,s.video_mime,s.duration_seconds,s.published_at,u.name AS author_name FROM academy_short s JOIN user u ON u.id=s.author_id WHERE s.id=?').get(id),userId);};
  const create=(user,input)=>{
    const title=String(input?.title||'Publicação do time').trim().slice(0,100),description=String(input?.description??'').trim();if(!title||description.length>600||/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(description))throw fail('Legenda inválida.');
    if(typeof input?.cover!=='string'||input.cover.length>4_000_000)throw fail('Selecione uma capa de até 2 MB.');
    const cover=Buffer.from(input.cover,'base64');if(!cover.length||cover.length>2*1024*1024)throw fail('Selecione uma capa de até 2 MB.');
    const mime=coverMime(cover),id=randomUUID();
    db.prepare('INSERT INTO academy_short(id,author_id,title,description,subject,channel,source,cover_mime,cover_bytes,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)').run(id,user.user_id,title,description,'','','',mime,cover,new Date().toISOString());
    return {id};
  };
  const publish=(user,id,name,bytes)=>{
    const row=db.prepare('SELECT author_id,status FROM academy_short WHERE id=?').get(id);if(!row||row.author_id!==user.user_id||row.status!=='draft')throw fail('Envio não encontrado.',404);
    const ext=String(name||'').toLowerCase().split('.').pop(),image=['jpg','jpeg','png','webp'].includes(ext);
    if(!image&&!['mp4','mov'].includes(ext))throw fail('Envie um vídeo MP4/MOV ou uma imagem JPG/PNG/WebP.');
    if(!Buffer.isBuffer(bytes)||!bytes.length||bytes.length>(image?10:40)*1024*1024)throw fail('Arquivo acima do limite permitido.',413);
    const duration=image?null:videoDuration(bytes),mime=image?coverMime(bytes):ext==='mov'?'video/quicktime':'video/mp4';
    db.prepare("UPDATE academy_short SET video_mime=?,video_bytes=?,duration_seconds=?,status='published',published_at=? WHERE id=? AND status='draft'").run(mime,bytes,duration,new Date().toISOString(),id);
    return one(user.user_id,id);
  };
  const media=(id,kind)=>{active(id);const row=db.prepare('SELECT '+(kind==='cover'?'cover_mime AS mime,cover_bytes AS bytes':'video_mime AS mime,video_bytes AS bytes')+' FROM academy_short WHERE id=?').get(id);return {mime:row.mime,bytes:Buffer.from(row.bytes)};};
  const toggle=(user,id,kind,enabled)=>{active(id);const table=kind==='like'?'academy_short_like':'academy_short_save';if(enabled)db.prepare('INSERT INTO '+table+'(short_id,user_id) VALUES(?,?) ON CONFLICT(short_id,user_id) DO NOTHING').run(id,user.user_id);else db.prepare('DELETE FROM '+table+' WHERE short_id=? AND user_id=?').run(id,user.user_id);return {ok:true};};
  const view=(user,id)=>{active(id);db.prepare('INSERT INTO academy_short_view(short_id,user_id) VALUES(?,?) ON CONFLICT(short_id,user_id) DO NOTHING').run(id,user.user_id);return {ok:true};};
  const share=(user,id)=>{active(id);db.prepare('INSERT INTO academy_short_share(id,short_id,user_id) VALUES(?,?,?)').run(randomUUID(),id,user.user_id);return {ok:true};};
  const comments=id=>{active(id);return {items:db.prepare('SELECT c.id,c.user_id AS authorId,u.name AS authorName,c.body,c.created_at AS createdAt FROM academy_short_comment c JOIN user u ON u.id=c.user_id WHERE c.short_id=? AND c.removed_at IS NULL ORDER BY c.created_at DESC LIMIT 100').all(id)};};
  const comment=(user,id,input)=>{active(id);const body=text(input?.body,500,'Comentário'),commentId=randomUUID(),now=new Date().toISOString();db.prepare('INSERT INTO academy_short_comment(id,short_id,user_id,body,created_at) VALUES(?,?,?,?,?)').run(commentId,id,user.user_id,body,now);return {id:commentId,authorId:user.user_id,authorName:user.name,body,createdAt:now};};
  const removeComment=(user,id,commentId)=>{active(id);const row=db.prepare('SELECT user_id FROM academy_short_comment WHERE id=? AND short_id=? AND removed_at IS NULL').get(commentId,id);if(!row)throw fail('Comentário não encontrado.',404);if(user.role!=='admin'&&row.user_id!==user.user_id)throw fail('Sem permissão.',403);db.prepare('UPDATE academy_short_comment SET removed_at=? WHERE id=?').run(new Date().toISOString(),commentId);return {ok:true};};
  const remove=(user,id)=>{const row=db.prepare('SELECT author_id FROM academy_short WHERE id=?').get(id);if(!row)throw fail('Vídeo não encontrado.',404);if(user.role!=='admin'&&row.author_id!==user.user_id)throw fail('Sem permissão.',403);db.prepare("UPDATE academy_short SET status='removed',removed_at=?,video_bytes=NULL WHERE id=?").run(new Date().toISOString(),id);return {ok:true};};
  return {feed,one,create,publish,media,toggle,view,share,comments,comment,removeComment,remove};
}

