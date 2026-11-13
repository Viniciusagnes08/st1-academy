import {randomUUID} from 'node:crypto';

export const roles=['seller','supervisor','admin'];
export const permissions=['materials','assessments','conquests','team_results','community','strategy'];
export const defaultPermissions=role=>role==='admin'?[...permissions]:permissions.filter(p=>p!=='strategy'&&(role!=='seller'||p!=='team_results'));
const memberSchema=`CREATE TABLE academy_member(user_id TEXT PRIMARY KEY REFERENCES user(id),role TEXT NOT NULL CHECK(role IN ('admin','supervisor','seller')),tracks_json TEXT NOT NULL,external_user_id TEXT,permissions_json TEXT NOT NULL DEFAULT '["materials","assessments","conquests"]',enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0,1)),updated_at TEXT)`;
const invitationSchema=`CREATE TABLE academy_invitation(id TEXT PRIMARY KEY,token_hash TEXT NOT NULL UNIQUE,name TEXT NOT NULL,email TEXT NOT NULL,role TEXT NOT NULL CHECK(role IN ('admin','supervisor','seller')),tracks_json TEXT NOT NULL,external_user_id TEXT,created_at TEXT NOT NULL,expires_at TEXT NOT NULL,used_by TEXT,permissions_json TEXT NOT NULL DEFAULT '["materials","assessments","conquests"]',supervisor_ids_json TEXT NOT NULL DEFAULT '[]',seller_ids_json TEXT NOT NULL DEFAULT '[]',revoked_at TEXT)`;

export function migrateAccess(db){
  db.exec('BEGIN IMMEDIATE');
  try{
    for(const [table,schema,columns] of [
      ['academy_member',memberSchema,'user_id,role,tracks_json,external_user_id'],
      ['academy_invitation',invitationSchema,'id,token_hash,name,email,role,tracks_json,external_user_id,created_at,expires_at,used_by']
    ]){
      const original=db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name=?").get(table);
      if(!original){db.exec(schema);continue;}
      if(!original.sql.includes("'supervisor'")){
        db.exec(`ALTER TABLE ${table} RENAME TO ${table}_legacy; ${schema}; INSERT INTO ${table}(${columns}) SELECT ${columns} FROM ${table}_legacy; DROP TABLE ${table}_legacy;`);
        db.prepare(`UPDATE ${table} SET permissions_json=? WHERE role='admin'`).run(JSON.stringify(permissions));
      }
    }
    db.exec(`CREATE TABLE IF NOT EXISTS academy_supervision(supervisor_id TEXT NOT NULL REFERENCES user(id),seller_id TEXT NOT NULL REFERENCES user(id),PRIMARY KEY(supervisor_id,seller_id),CHECK(supervisor_id<>seller_id));
      CREATE TABLE IF NOT EXISTS academy_access_audit(id TEXT PRIMARY KEY,actor_id TEXT REFERENCES user(id),subject_id TEXT NOT NULL,action TEXT NOT NULL,before_json TEXT,after_json TEXT,created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS academy_invitation_link_access(invitation_id TEXT PRIMARY KEY REFERENCES academy_invitation(id),accessed_at TEXT NOT NULL);`);
    db.exec('COMMIT');
  }catch(error){db.exec('ROLLBACK');throw error;}
}

export function normalizeAccess(input,bank){
  const role=input.role??'seller';
  if(!roles.includes(role))throw new Error('Escolha Vendedor, Supervisor ou Admin.');
  let tracks=input.tracks??bank.tracks.filter(t=>!t.trainingOnly).map(t=>t.id);
  let allowed=input.permissions??defaultPermissions(role);
  if(!Array.isArray(tracks)||tracks.some(id=>!bank.tracks.some(t=>t.id===id)))throw new Error('Escolha apenas trilhas válidas.');
  if(!Array.isArray(allowed)||allowed.some(id=>!permissions.includes(id)))throw new Error('Escolha apenas permissões válidas.');
  if(role==='seller'&&allowed.includes('team_results'))throw new Error('Vendedores não podem acompanhar resultados de outras pessoas.');
  if(input.enabled!==undefined&&typeof input.enabled!=='boolean')throw new Error('Informe um status de acesso válido.');
  if(role==='admin'){tracks=bank.tracks.map(t=>t.id);allowed=[...permissions];}
  return {role,tracks:[...new Set(tracks)],permissions:[...new Set(allowed)],enabled:input.enabled??true};
}

export const hasPermission=(member,permission)=>member?.enabled===1&&(member.role==='admin'||member.permissions.includes(permission));
export const hasTrack=(member,id)=>member?.enabled===1&&(member.role==='admin'||member.tracks.includes(id));
export function readProfile(db,userId){
  const row=db.prepare('SELECT m.*,u.name,u.email FROM academy_member m JOIN user u ON u.id=m.user_id WHERE m.user_id=?').get(userId);
  if(!row)return null;
  return {...row,tracks:JSON.parse(row.tracks_json),permissions:JSON.parse(row.permissions_json)};
}

export function createAccessService(db,bank){
  const relationships=(role,input)=>{
    const supervisorIds=input.supervisorIds??[],sellerIds=input.sellerIds??[];
    if(!Array.isArray(supervisorIds)||!Array.isArray(sellerIds)||supervisorIds.length>200||sellerIds.length>200)throw new Error('Selecione uma equipe válida.');
    if(role!=='seller'&&supervisorIds.length||role!=='supervisor'&&sellerIds.length)throw new Error('A equipe selecionada não corresponde ao perfil.');
    for(const [ids,expected] of [[supervisorIds,'supervisor'],[sellerIds,'seller']]){
      if(ids.some(id=>typeof id!=='string'||db.prepare('SELECT role FROM academy_member WHERE user_id=?').get(id)?.role!==expected))throw new Error('A equipe contém uma pessoa com perfil incompatível.');
    }
    return {supervisorIds:[...new Set(supervisorIds)],sellerIds:[...new Set(sellerIds)]};
  };
  const audit=(actor,subject,action,before,after)=>db.prepare('INSERT INTO academy_access_audit(id,actor_id,subject_id,action,before_json,after_json,created_at) VALUES(?,?,?,?,?,?,?)').run(randomUUID(),actor||null,subject,action,before?JSON.stringify(before):null,after?JSON.stringify(after):null,new Date().toISOString());
  const relationsFor=id=>({supervisorIds:db.prepare('SELECT supervisor_id FROM academy_supervision WHERE seller_id=?').all(id).map(r=>r.supervisor_id),sellerIds:db.prepare('SELECT seller_id FROM academy_supervision WHERE supervisor_id=?').all(id).map(r=>r.seller_id)});
  const publicProfile=row=>({id:row.user_id,name:row.name,email:row.email,role:row.role,tracks:row.tracks,permissions:row.permissions,enabled:row.enabled===1,...relationsFor(row.user_id)});
  const applyRelationships=(userId,role,selection)=>{
    db.prepare('DELETE FROM academy_supervision WHERE supervisor_id=? OR seller_id=?').run(userId,userId);
    if(role==='seller')for(const id of selection.supervisorIds)db.prepare('INSERT INTO academy_supervision(supervisor_id,seller_id) VALUES(?,?)').run(id,userId);
    if(role==='supervisor')for(const id of selection.sellerIds)db.prepare('INSERT INTO academy_supervision(supervisor_id,seller_id) VALUES(?,?)').run(userId,id);
  };
  const canReadUser=(viewer,userId)=>viewer.role==='admin'||viewer.role==='supervisor'&&hasPermission(viewer,'team_results')&&!!db.prepare("SELECT 1 FROM academy_supervision s JOIN academy_member m ON m.user_id=s.seller_id WHERE s.supervisor_id=? AND s.seller_id=? AND m.role='seller'").get(viewer.user_id,userId);
  const directory=()=>{
    const users=db.prepare('SELECT user_id FROM academy_member').all().map(row=>publicProfile(readProfile(db,row.user_id))).sort((a,b)=>a.name.localeCompare(b.name,'pt-BR'));
    const invitations=db.prepare('SELECT i.id,i.name,i.email,i.role,i.tracks_json,i.permissions_json,i.supervisor_ids_json,i.seller_ids_json,i.created_at,i.expires_at,i.revoked_at,l.accessed_at FROM academy_invitation i LEFT JOIN academy_invitation_link_access l ON l.invitation_id=i.id WHERE i.used_by IS NULL ORDER BY i.created_at DESC').all().map(row=>({id:row.id,name:row.name,email:row.email,role:row.role,tracks:JSON.parse(row.tracks_json),permissions:JSON.parse(row.permissions_json),supervisorIds:JSON.parse(row.supervisor_ids_json),sellerIds:JSON.parse(row.seller_ids_json),createdAt:row.created_at,expiresAt:row.expires_at,linkAccessedAt:row.accessed_at||null,status:row.revoked_at?'revoked':row.expires_at<=new Date().toISOString()?'expired':'pending'}));
    return {users,invitations};
  };
  const updateMember=(actorId,id,input)=>{
    const current=readProfile(db,id);if(!current)throw new Error('Conta não encontrada.');
    const value=normalizeAccess(input,bank),selection=relationships(value.role,input);
    if(current.role==='admin'&&current.enabled===1&&(value.role!=='admin'||!value.enabled)&&db.prepare("SELECT count(*) n FROM academy_member WHERE role='admin' AND enabled=1 AND user_id<>?").get(id).n===0)throw new Error('Mantenha pelo menos um Admin ativo na Academia.');
    const before=publicProfile(current);
    db.exec('BEGIN IMMEDIATE');
    try{
      db.prepare('UPDATE academy_member SET role=?,tracks_json=?,permissions_json=?,enabled=?,updated_at=? WHERE user_id=?').run(value.role,JSON.stringify(value.tracks),JSON.stringify(value.permissions),value.enabled?1:0,new Date().toISOString(),id);
      applyRelationships(id,value.role,selection);
      const after=publicProfile(readProfile(db,id));audit(actorId,id,'member.updated',before,after);db.exec('COMMIT');return after;
    }catch(error){db.exec('ROLLBACK');throw error;}
  };
  const setMembersEnabled=(actorId,ids,enabled)=>{
    if(!Array.isArray(ids)||ids.length<1||ids.length>500||ids.some(id=>typeof id!=='string'||!id.trim())||new Set(ids).size!==ids.length)throw new Error('Selecione entre 1 e 500 contas válidas.');
    if(typeof enabled!=='boolean')throw new Error('Informe se as contas devem ser ativadas ou bloqueadas.');
    db.exec('BEGIN IMMEDIATE');
    try{
      const current=ids.map(id=>readProfile(db,id));
      if(current.some(person=>!person))throw new Error('Uma ou mais contas selecionadas não foram encontradas. Recarregue a lista e tente novamente.');
      if(!enabled){
        const remaining=db.prepare("SELECT count(*) n FROM academy_member WHERE role='admin' AND enabled=1").get().n-current.filter(person=>person.role==='admin'&&person.enabled===1).length;
        if(remaining<1)throw new Error('Mantenha pelo menos um Admin ativo na Academia.');
      }
      let updated=0;
      for(const person of current){
        if((person.enabled===1)===enabled)continue;
        const before=publicProfile(person),now=new Date().toISOString();
        db.prepare('UPDATE academy_member SET enabled=?,updated_at=? WHERE user_id=?').run(enabled?1:0,now,person.user_id);
        const after=publicProfile(readProfile(db,person.user_id));
        audit(actorId,person.user_id,'member.bulk_status.updated',before,after);updated++;
      }
      db.exec('COMMIT');return {updated,unchanged:current.length-updated,enabled};
    }catch(error){db.exec('ROLLBACK');throw error;}
  };
  const adjustMembersAccess=(actorId,ids,input)=>{
    if(!Array.isArray(ids)||ids.length<1||ids.length>500||ids.some(id=>typeof id!=='string'||!id.trim())||new Set(ids).size!==ids.length)throw new Error('Selecione entre 1 e 500 contas válidas.');
    if(!input||typeof input!=='object'||Array.isArray(input))input={};
    if(!['add','remove'].includes(input?.operation))throw new Error('Escolha se deseja adicionar ou remover os acessos selecionados.');
    const tracks=input.tracks??[],allowed=input.permissions??[];
    if(!Array.isArray(tracks)||tracks.some(id=>!bank.tracks.some(track=>track.id===id))||!Array.isArray(allowed)||allowed.some(id=>!permissions.includes(id))||(!tracks.length&&!allowed.length))throw new Error('Selecione ao menos uma trilha ou permissão válida.');
    db.exec('BEGIN IMMEDIATE');
    try{
      const current=ids.map(id=>readProfile(db,id));
      if(current.some(person=>!person))throw new Error('Uma ou mais contas selecionadas não foram encontradas. Recarregue a lista e tente novamente.');
      const roles=new Set(current.map(person=>person.role));
      if(roles.size!==1||roles.has('admin'))throw new Error('Ajuste em massa exige contas Vendedor ou Supervisor de um único perfil. Admin tem acesso completo.');
      let updated=0;
      for(const person of current){
        const merge=(before,selected)=>input.operation==='add'?[...new Set([...before,...selected])]:before.filter(id=>!selected.includes(id));
        const value=normalizeAccess({role:person.role,tracks:merge(person.tracks,tracks),permissions:merge(person.permissions,allowed),enabled:person.enabled===1},bank);
        if(value.tracks.length===person.tracks.length&&value.tracks.every(id=>person.tracks.includes(id))&&value.permissions.length===person.permissions.length&&value.permissions.every(id=>person.permissions.includes(id)))continue;
        const before=publicProfile(person),now=new Date().toISOString();
        const changed=db.prepare('UPDATE academy_member SET tracks_json=?,permissions_json=?,updated_at=? WHERE user_id=? AND role=? AND tracks_json=? AND permissions_json=?').run(JSON.stringify(value.tracks),JSON.stringify(value.permissions),now,person.user_id,person.role,person.tracks_json,person.permissions_json);
        if(changed.changes!==1)throw new Error('Uma conta foi alterada em outro acesso enquanto esta ação era preparada. Recarregue a lista e tente novamente.');
        const after=publicProfile(readProfile(db,person.user_id));audit(actorId,person.user_id,'member.bulk_access.updated',before,after);updated++;
      }
      db.exec('COMMIT');return {updated,unchanged:current.length-updated,operation:input.operation};
    }catch(error){db.exec('ROLLBACK');throw error;}
  };
  const revokeInvitations=(actorId,ids)=>{
    if(!Array.isArray(ids)||ids.length<1||ids.length>500||ids.some(id=>typeof id!=='string'||!id.trim())||new Set(ids).size!==ids.length)throw new Error('Selecione entre 1 e 500 convites válidos.');
    db.exec('BEGIN IMMEDIATE');
    try{
      const invitations=ids.map(id=>db.prepare('SELECT id,name,email,role,tracks_json,permissions_json FROM academy_invitation WHERE id=? AND used_by IS NULL AND revoked_at IS NULL').get(id));
      if(invitations.some(invitation=>!invitation))throw new Error('Um ou mais convites não estão mais disponíveis. Recarregue a lista e tente novamente.');
      const now=new Date().toISOString();
      for(const invitation of invitations){
        db.prepare('UPDATE academy_invitation SET revoked_at=? WHERE id=? AND used_by IS NULL AND revoked_at IS NULL').run(now,invitation.id);
        audit(actorId,invitation.id,'invitation.bulk_revoked',{name:invitation.name,email:invitation.email,role:invitation.role,tracks:JSON.parse(invitation.tracks_json),permissions:JSON.parse(invitation.permissions_json)},{revoked:true});
      }
      db.exec('COMMIT');return {revoked:invitations.length};
    }catch(error){db.exec('ROLLBACK');throw error;}
  };
  const updateInvitation=(actorId,id,input)=>{
    const current=db.prepare('SELECT * FROM academy_invitation WHERE id=? AND used_by IS NULL AND revoked_at IS NULL AND expires_at>?').get(id,new Date().toISOString());
    if(!current)throw new Error('Este convite já foi usado, revogado ou venceu.');
    const value=normalizeAccess(input,bank),selection=relationships(value.role,input);
    if(input.enabled===false)throw new Error('Revogue o convite para impedir o primeiro acesso.');
    db.prepare('UPDATE academy_invitation SET role=?,tracks_json=?,permissions_json=?,supervisor_ids_json=?,seller_ids_json=? WHERE id=?').run(value.role,JSON.stringify(value.tracks),JSON.stringify(value.permissions),JSON.stringify(selection.supervisorIds),JSON.stringify(selection.sellerIds),id);
    audit(actorId,id,'invitation.updated',{role:current.role,tracks:JSON.parse(current.tracks_json),permissions:JSON.parse(current.permissions_json)},{...value,...selection});
    return {id,...value,...selection};
  };
  const revokeInvitation=(actorId,id)=>{
    const result=db.prepare('UPDATE academy_invitation SET revoked_at=? WHERE id=? AND used_by IS NULL AND revoked_at IS NULL').run(new Date().toISOString(),id);
    if(result.changes!==1)throw new Error('Convite indisponível para revogação.');
    audit(actorId,id,'invitation.revoked',null,{revoked:true});return {id,revoked:true};
  };
  return {directory,publicProfile,canReadUser,relationships,applyRelationships,audit,updateMember,setMembersEnabled,adjustMembersAccess,updateInvitation,revokeInvitation,revokeInvitations};
}
