import {randomUUID,createHash} from 'node:crypto';
import {hasPermission,hasTrack,readProfile} from './access.mjs';
import {createSquadRequestService} from './squad-requests.mjs';
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
const clean=(value,max,label)=>{if(typeof value!=='string'||value.length>max||/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(value))throw fail(label+' inválido.');return value.trim();};
const option=(category,value,name,minLevel=1,minCertificates=0,maxSquadRank=0)=>({id:category+'-'+value,category,value,name,minLevel,minCertificates,maxSquadRank});
export const profileCatalog=[
  option('palette','st1','Laranja ST1'),option('palette','ocean','Azul Conexão',2),option('palette','emerald','Verde Evolução',2),option('palette','violet','Violeta Energia',3),option('palette','ice','Azul Polar',3),option('palette','gold','Ouro Elite',4),
  option('effect','signal','Sinal ST1'),option('effect','circuit','Circuito vivo',2),option('effect','constellation','Constelação',3),option('effect','aurora','Aurora',4),option('effect','meteor','Chuva de estrelas',5),option('effect','prism','Prisma lendário',6),
  option('frame','plain','Essencial'),option('frame','orbit','Órbita',2),option('frame','certified','Selo de especialista',2,1),option('frame','podium','Destaque do squad',2,0,3),option('frame','legend','Lendária',6,3),
  option('title','newcomer','Aprendiz ST1'),option('title','connector','Conector',2),option('title','specialist','Especialista ST1',4,1),option('title','highlight','Destaque do squad',2,0,3),option('title','reference','Referência ST1',6,3)
];
const defaults={palette:'st1',effect:'signal',frame:'plain',title:'newcomer'};
const textKeys={phone:25,city:80,hobbies:240,lifeGoal:500,biography:700,dream:500};
export function createProfileService(db,bank,access,game,study,{clock=Date.now}={}){
  db.exec("CREATE TABLE IF NOT EXISTS academy_personal_profile(user_id TEXT PRIMARY KEY REFERENCES user(id),phone TEXT NOT NULL DEFAULT '',city TEXT NOT NULL DEFAULT '',hobbies TEXT NOT NULL DEFAULT '',lifeGoal TEXT NOT NULL DEFAULT '',biography TEXT NOT NULL DEFAULT '',dream TEXT NOT NULL DEFAULT '',shareStory INTEGER NOT NULL DEFAULT 0,palette TEXT NOT NULL DEFAULT 'st1',effect TEXT NOT NULL DEFAULT 'signal',frame TEXT NOT NULL DEFAULT 'plain',title TEXT NOT NULL DEFAULT 'newcomer',avatar_id TEXT,cover_id TEXT,revision INTEGER NOT NULL DEFAULT 0,updated_at TEXT); CREATE TABLE IF NOT EXISTS academy_profile_media(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES user(id),kind TEXT NOT NULL,mime TEXT NOT NULL,name TEXT NOT NULL,bytes BLOB NOT NULL,sha256 TEXT NOT NULL,created_at TEXT NOT NULL); CREATE TABLE IF NOT EXISTS academy_profile_rules(id INTEGER PRIMARY KEY CHECK(id=1),revision INTEGER NOT NULL DEFAULT 0,rules_json TEXT NOT NULL);");
  db.prepare('INSERT OR IGNORE INTO academy_profile_rules(id,rules_json) VALUES(1,?)').run(JSON.stringify(profileCatalog.map(({id,minLevel,minCertificates,maxSquadRank})=>({id,minLevel,minCertificates,maxSquadRank}))));
  const requests=createSquadRequestService(db,game,access,{clock});
  const row=id=>db.prepare('SELECT * FROM academy_personal_profile WHERE user_id=?').get(id)||{user_id:id,...Object.fromEntries(Object.keys(textKeys).map(key=>[key,''])),shareStory:0,...defaults,avatar_id:null,cover_id:null,revision:0};
  const ensure=id=>db.prepare('INSERT OR IGNORE INTO academy_personal_profile(user_id) VALUES(?)').run(id);
  const transaction=fn=>{db.exec('BEGIN IMMEDIATE');try{const value=fn();db.exec('COMMIT');return value;}catch(error){db.exec('ROLLBACK');throw error;}};
  const rules=()=>{const r=db.prepare('SELECT * FROM academy_profile_rules WHERE id=1').get();return {revision:r.revision,items:profileCatalog.map(item=>({...item,...JSON.parse(r.rules_json).find(v=>v.id===item.id)}))};};
  const setRules=(actor,input)=>{
    if(actor.role!=='admin')throw fail('Acesso exclusivo de Admin.',403);
    const before=rules();if(input?.revision!==before.revision)throw fail('As liberações mudaram. Reabra para continuar.',409);
    if(!Array.isArray(input.items)||input.items.length!==profileCatalog.length||new Set(input.items.map(v=>v.id)).size!==profileCatalog.length)throw fail('Informe todas as personalizações.');
    const values=profileCatalog.map(item=>{
      const v=input.items.find(v=>v.id===item.id);
      if(!v||!Number.isInteger(v.minLevel)||v.minLevel<1||v.minLevel>10||!Number.isInteger(v.minCertificates)||v.minCertificates<0||v.minCertificates>5||!Number.isInteger(v.maxSquadRank)||v.maxSquadRank<0||v.maxSquadRank>3)throw fail('Use níveis de 1 a 10, até 5 certificados e posição de 1 a 3.');
      if(defaults[item.category]===item.value&&(v.minLevel!==1||v.minCertificates!==0||v.maxSquadRank!==0))throw fail('As opções iniciais permanecem livres.');
      return {id:item.id,minLevel:v.minLevel,minCertificates:v.minCertificates,maxSquadRank:v.maxSquadRank};
    });
    return transaction(()=>{db.prepare('UPDATE academy_profile_rules SET rules_json=?,revision=revision+1 WHERE id=1 AND revision=?').run(JSON.stringify(values),before.revision);access.audit(actor.user_id,'profile-rules','profile.rules.updated',before,{items:values});return rules();});
  };
  const metrics=person=>{
    const xp=db.prepare('SELECT track_id,amount FROM academy_xp WHERE user_id=?').all(person.user_id).filter(a=>hasTrack(person,a.track_id)).reduce((n,a)=>n+a.amount,0);
    const levels=game.rules().levels,index=levels.findLastIndex(l=>l.xp<=xp),level={index:index+1,name:levels[index].name,start:levels[index].xp,next:levels[index+1]||null};
    const certificates=hasPermission(person,'conquests')?db.prepare('SELECT * FROM academy_certificate WHERE user_id=? ORDER BY issued_at DESC').all(person.user_id).filter(c=>hasTrack(person,c.track_id)):[];
    let ranking=null;if(person.role!=='admin'&&hasPermission(person,'community')){const result=game.results(person,{role:person.role}),squadId=game.squads.ownSquad(person.user_id)?.id,team=result.ranking.filter(p=>p.squadId===squadId&&squadId);const position=team.find(p=>p.id===person.user_id);if(position)ranking={rank:position.rank,participants:team.length,squadId};}
    const paths=hasPermission(person,'assessments')?game.paths(person):[];
    return {xp,level,certificates,ranking,steps:paths.reduce((n,p)=>n+p.nodes.filter(v=>v.kind==='checkpoint'&&v.status==='done').length,0),study:study.stats(person.user_id)};
  };
  const unlocked=(item,m)=>m.level.index>=item.minLevel&&m.certificates.length>=item.minCertificates&&(!item.maxSquadRank||m.xp>0&&m.ranking?.participants>=3&&m.ranking.rank<=item.maxSquadRank);
  const effective=(record,m)=>Object.fromEntries(Object.entries(defaults).map(([category,value])=>{const item=rules().items.find(i=>i.category===category&&i.value===record[category]);return [category,item&&unlocked(item,m)?item.value:value];}));
  const canRead=(viewer,id)=>{
    const person=readProfile(db,id);if(!person||person.enabled!==1)return false;
    if(viewer.user_id===id||game.squads.canInspect(viewer,id))return true;
    const own=game.squads.ownSquad(viewer.user_id),other=game.squads.ownSquad(id);
    return hasPermission(viewer,'community')&&hasPermission(person,'community')&&!!own&&own.id===other?.id;
  };
  const mediaUrl=id=>id?'/api/profile-media/'+id:null;
  const avatar=(viewer,id)=>canRead(viewer,id)?mediaUrl(row(id).avatar_id):null;
  const detail=(viewer,id=viewer.user_id)=>{
    if(!canRead(viewer,id))throw fail('Perfil não encontrado ou não liberado.',404);
    const person=readProfile(db,id),record=row(id),own=viewer.user_id===id,m=metrics(person),squad=game.squads.ownSquad(id),contact=own||game.squads.canInspect(viewer,id),shared=own||record.shareStory===1;
    const filled=[!!record.avatar_id,!!record.phone,!!record.city,!!record.hobbies,!!record.lifeGoal,!!record.biography,!!record.dream,...(person.role!=='admin'?[!!squad]:[])],completion=Math.round(filled.filter(Boolean).length/filled.length*100);
    const fields={...Object.fromEntries(Object.keys(textKeys).map(key=>[key,key==='phone'?(contact?record[key]:''):(shared?record[key]:'')])),shareStory:!!record.shareStory};
    const items=rules().items.map(item=>({...item,unlocked:unlocked(item,m)})),style=effective(record,m);
    const certificates=m.certificates.filter(c=>hasPermission(viewer,'conquests')&&hasTrack(viewer,c.track_id)).map(c=>({id:c.id,trackId:c.track_id,name:bank.tracks.find(t=>t.id===c.track_id)?.badge,issuedAt:c.issued_at,canDownload:own||game.squads.canInspect(viewer,id)||game.squads.canReadCertificate(viewer,c)}));
    const milestones=[{id:'primeiro-passo',name:'Primeiro passo',description:'Registre seu primeiro dia de estudo.',earned:m.study.totalDays>=1},{id:'ritmo-3',name:'Pegou o ritmo',description:'Estude por 3 dias seguidos.',earned:m.study.bestStreak>=3},{id:'ritmo-7',name:'Uma semana de evolução',description:'Estude por 7 dias seguidos.',earned:m.study.bestStreak>=7},{id:'ritmo-30',name:'Constância ST1',description:'Estude por 30 dias seguidos.',earned:m.study.bestStreak>=30},{id:'squad',name:'Conexão de equipe',description:'Faça parte de um squad.',earned:!!squad},{id:'perfil',name:'Do seu jeito',description:'Complete as informações do seu perfil.',earned:completion===100}];
    return {id:person.user_id,name:person.name,role:person.role,own,revision:record.revision,...(own?{email:person.email,completion,joinChoices:requests.choices(viewer),joinRequest:requests.own(viewer),catalog:items}:{}),fields,storyVisible:shared,avatarUrl:mediaUrl(record.avatar_id),coverUrl:mediaUrl(record.cover_id),style,titleName:items.find(i=>i.category==='title'&&i.value===style.title).name,squad:squad?{id:squad.id,name:squad.name}:null,stats:{xp:m.xp,level:m.level,ranking:m.ranking,steps:m.steps,certificates:certificates.length,study:m.study},certificates,milestones};
  };
  const checkRevision=(viewer,input)=>{if(input?.revision!==row(viewer.user_id).revision)throw fail('O perfil mudou em outra tela. Reabra para continuar.',409);};
  const save=(viewer,input)=>{
    if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!['revision','shareStory',...Object.keys(textKeys)].includes(k)))throw fail('Edite somente as informações pessoais.');
    checkRevision(viewer,input);const values={};for(const [key,max] of Object.entries(textKeys))if(input[key]!==undefined)values[key]=clean(input[key],max,({phone:'Telefone',city:'Cidade',hobbies:'Interesses',lifeGoal:'Objetivo de vida',biography:'Biografia',dream:'Maior sonho'}[key]));
    if(values.phone&&(!/^[+()\d .-]+$/.test(values.phone)||values.phone.replace(/\D/g,'').length<10||values.phone.replace(/\D/g,'').length>15))throw fail('Informe um telefone com DDD, ou deixe em branco.');
    if(input.shareStory!==undefined){if(typeof input.shareStory!=='boolean')throw fail('Escolha a visibilidade da sua história.');values.shareStory=input.shareStory?1:0;}
    return transaction(()=>{ensure(viewer.user_id);const columns=Object.keys(values);if(columns.length)db.prepare('UPDATE academy_personal_profile SET '+columns.map(key=>key+'=?').join(',')+',revision=revision+1,updated_at=? WHERE user_id=?').run(...Object.values(values),new Date(clock()).toISOString(),viewer.user_id);access.audit(viewer.user_id,viewer.user_id,'profile.updated',null,{fields:columns});return detail(viewer);});
  };
  const saveStyle=(viewer,input)=>{
    if(!input||Object.keys(input).some(k=>!['revision',...Object.keys(defaults)].includes(k)))throw fail('Personalização inválida.');
    checkRevision(viewer,input);const m=metrics(viewer),record=row(viewer.user_id),values={};
    for(const category of Object.keys(defaults)){const value=input[category]??record[category],item=rules().items.find(i=>i.category===category&&i.value===value);if(!item||!unlocked(item,m))throw fail('Esta personalização ainda não foi conquistada.',403);values[category]=value;}
    return transaction(()=>{ensure(viewer.user_id);db.prepare('UPDATE academy_personal_profile SET palette=?,effect=?,frame=?,title=?,revision=revision+1,updated_at=? WHERE user_id=?').run(values.palette,values.effect,values.frame,values.title,new Date(clock()).toISOString(),viewer.user_id);access.audit(viewer.user_id,viewer.user_id,'profile.style.updated',null,values);return detail(viewer);});
  };
  const upload=(viewer,kind,revision,encodedName,bytes)=>{
    if(!['avatar','cover'].includes(kind))throw fail('Escolha foto ou capa.');
    checkRevision(viewer,{revision});if(!Buffer.isBuffer(bytes)||bytes.length<32||bytes.length>5*1024*1024)throw fail('Envie uma imagem de até 5 MB.',413);
    let name;try{name=decodeURIComponent(encodedName||'');}catch{throw fail('Nome de arquivo inválido.');}name=clean(name,160,'Nome');if(!name||/[\\/\r\n]/.test(name))throw fail('Nome de arquivo inválido.');
    const ext=name.split('.').pop().toLowerCase();let mime;
    if(ext==='png'&&bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))){const width=bytes.readUInt32BE(16),height=bytes.readUInt32BE(20);if(!width||!height||width*height>40000000)throw fail('Escolha uma imagem com até 40 milhões de pixels.');mime='image/png';}
    else if(['jpg','jpeg'].includes(ext)&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255)mime='image/jpeg';
    else if(ext==='webp'&&bytes.subarray(0,4).toString()==='RIFF'&&bytes.subarray(8,12).toString()==='WEBP')mime='image/webp';
    else throw fail('Escolha uma foto JPG, PNG ou WebP válida.');
    return transaction(()=>{ensure(viewer.user_id);const id=randomUUID();db.prepare('INSERT INTO academy_profile_media(id,user_id,kind,mime,name,bytes,sha256,created_at) VALUES(?,?,?,?,?,?,?,?)').run(id,viewer.user_id,kind,mime,name,bytes,createHash('sha256').update(bytes).digest('hex'),new Date(clock()).toISOString());db.prepare('UPDATE academy_personal_profile SET '+kind+'_id=?,revision=revision+1,updated_at=? WHERE user_id=?').run(id,new Date(clock()).toISOString(),viewer.user_id);access.audit(viewer.user_id,viewer.user_id,'profile.media.updated',null,{kind,assetId:id});return detail(viewer);});
  };
  const removeMedia=(viewer,kind,revision)=>{if(!['avatar','cover'].includes(kind))throw fail('Imagem inválida.');checkRevision(viewer,{revision});return transaction(()=>{ensure(viewer.user_id);db.prepare('UPDATE academy_personal_profile SET '+kind+'_id=NULL,revision=revision+1,updated_at=? WHERE user_id=?').run(new Date(clock()).toISOString(),viewer.user_id);access.audit(viewer.user_id,viewer.user_id,'profile.media.removed',null,{kind});return detail(viewer);});};
  const media=(viewer,id)=>{const asset=db.prepare('SELECT * FROM academy_profile_media WHERE id=?').get(id);if(!asset||!canRead(viewer,asset.user_id)||row(asset.user_id)[asset.kind+'_id']!==id)throw fail('Imagem não encontrada ou não liberada.',404);return asset;};
  const peers=viewer=>{
    if(!hasPermission(viewer,'community'))throw fail('O acesso aos perfis do time não está liberado.',403);
    const levels=game.rules().levels;
    return db.prepare("SELECT user_id FROM academy_member WHERE enabled=1 AND role IN ('seller','supervisor') AND user_id<>?").all(viewer.user_id).filter(p=>canRead(viewer,p.user_id)).map(p=>{
      const person=readProfile(db,p.user_id),squad=game.squads.ownSquad(p.user_id),xp=db.prepare('SELECT track_id,amount FROM academy_xp WHERE user_id=?').all(p.user_id).filter(a=>hasTrack(person,a.track_id)).reduce((n,a)=>n+a.amount,0),index=levels.findLastIndex(l=>l.xp<=xp);
      return {id:p.user_id,name:person.name,role:person.role,avatarUrl:avatar(viewer,p.user_id),squad:squad?{id:squad.id,name:squad.name}:null,xp,level:{index:index+1,name:levels[index].name}};
    }).sort((a,b)=>a.name.localeCompare(b.name,'pt-BR'));
  };
  return {detail,save,saveStyle,upload,removeMedia,media,avatar,canRead,peers,rules,setRules,requests};
}
