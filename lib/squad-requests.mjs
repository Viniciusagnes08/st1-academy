import {randomUUID} from 'node:crypto';
import {hasPermission,readProfile} from './access.mjs';
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
export function createSquadRequestService(db,game,access,{clock=Date.now}={}){
  db.exec("CREATE TABLE IF NOT EXISTS academy_squad_request(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES user(id),squad_id TEXT NOT NULL REFERENCES academy_squad(id),from_squad_id TEXT,status TEXT NOT NULL,revision INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL,decided_at TEXT,decided_by TEXT); CREATE UNIQUE INDEX IF NOT EXISTS academy_squad_request_pending ON academy_squad_request(user_id) WHERE status='pending';");
  const payload=r=>r?({...r,squadName:db.prepare('SELECT name FROM academy_squad WHERE id=?').get(r.squad_id)?.name}):null;
  const own=viewer=>payload(db.prepare('SELECT * FROM academy_squad_request WHERE user_id=? ORDER BY created_at DESC,rowid DESC LIMIT 1').get(viewer.user_id));
  const eligible=viewer=>hasPermission(viewer,'community')&&['seller','supervisor'].includes(viewer.role);
  const choices=viewer=>{if(!eligible(viewer))return [];return db.prepare("SELECT id,name,description,supervisor_label FROM academy_squad WHERE status='active' ORDER BY name").all();};
  const canManage=(viewer,squadId)=>viewer.role==='admin'||viewer.role==='supervisor'&&hasPermission(viewer,'team_results')&&db.prepare("SELECT 1 FROM academy_squad WHERE id=? AND supervisor_id=? AND status='active'").get(squadId,viewer.user_id);
  const transaction=fn=>{db.exec('BEGIN IMMEDIATE');try{const result=fn();db.exec('COMMIT');return result;}catch(error){db.exec('ROLLBACK');throw error;}};
  const request=(viewer,squadId)=>{
    if(!eligible(viewer))throw fail('O acesso ao squad não está liberado. Procure o Admin.',403);
    const squad=db.prepare("SELECT * FROM academy_squad WHERE id=? AND status='active'").get(squadId);if(!squad)throw fail('Escolha um squad ativo.',404);
    const previous=game.squads.ownSquad(viewer.user_id);if(previous?.id===squadId)throw fail('Você já faz parte deste squad.');
    const current=own(viewer);if(current?.status==='pending'&&current.squad_id===squadId)return current;
    return transaction(()=>{
      db.prepare("UPDATE academy_squad_request SET status='cancelled',revision=revision+1,decided_at=? WHERE user_id=? AND status='pending'").run(new Date(clock()).toISOString(),viewer.user_id);
      const id=randomUUID();db.prepare('INSERT INTO academy_squad_request(id,user_id,squad_id,from_squad_id,status,created_at) VALUES(?,?,?,?,?,?)').run(id,viewer.user_id,squadId,previous?.id||null,'pending',new Date(clock()).toISOString());
      access.audit(viewer.user_id,id,'squad.join.requested',null,{squadId,fromSquadId:previous?.id||null});
      for(const person of db.prepare("SELECT user_id,role FROM academy_member WHERE enabled=1 AND role IN ('admin','supervisor')").all())if(person.role==='admin'||person.user_id===squad.supervisor_id&&hasPermission(readProfile(db,person.user_id),'team_results'))game.squads.notify(person.user_id,'join:'+id,'Novo pedido de squad',viewer.name+' quer entrar em '+squad.name+'.','#pedidos-squad');
      return own(viewer);
    });
  };
  const inbox=viewer=>{
    if(viewer.role!=='admin'&&!(viewer.role==='supervisor'&&hasPermission(viewer,'team_results')))throw fail('Pedidos não liberados.',403);
    return db.prepare("SELECT r.*,u.name,m.role,m.enabled,s.name squadName FROM academy_squad_request r JOIN user u ON u.id=r.user_id JOIN academy_member m ON m.user_id=u.id JOIN academy_squad s ON s.id=r.squad_id WHERE r.status='pending' ORDER BY r.created_at").all().filter(r=>canManage(viewer,r.squad_id)).map(r=>({id:r.id,userId:r.user_id,name:r.name,role:r.role,squadId:r.squad_id,squadName:r.squadName,transfer:!!r.from_squad_id,revision:r.revision,canApprove:r.enabled===1&&(!r.from_squad_id||viewer.role==='admin')}));
  };
  const decide=(viewer,id,input)=>{
    const r=db.prepare('SELECT * FROM academy_squad_request WHERE id=?').get(id);
    if(!r||!canManage(viewer,r.squad_id))throw fail('Pedido não encontrado ou não liberado.',404);
    if(!['approved','rejected'].includes(input?.status))throw fail('Escolha aprovar ou recusar.');
    if(r.status!=='pending'||r.revision!==input.revision)throw fail('Este pedido mudou. Atualize a lista.',409);
    const person=readProfile(db,r.user_id),squad=db.prepare("SELECT * FROM academy_squad WHERE id=? AND status='active'").get(r.squad_id);
    if(!squad)throw fail('O squad está arquivado.',409);
    if(input.status==='approved'){
      if(!person||person.enabled!==1||!eligible(person))throw fail('A conta precisa estar ativa e com acesso aos squads.',403);
      const previous=game.squads.ownSquad(person.user_id);
      if((previous?.id||null)!==r.from_squad_id&&previous?.id!==r.squad_id)throw fail('A equipe desta pessoa mudou. Solicite um novo pedido.',409);
      if(previous&&previous.id!==r.squad_id&&viewer.role!=='admin')throw fail('Somente Admin aprova transferências de squad.',403);
    }
    return transaction(()=>{
      const now=new Date(clock()).toISOString();
      if(input.status==='approved'){
        const previous=game.squads.ownSquad(r.user_id);
        db.prepare('DELETE FROM academy_squad_member WHERE user_id=?').run(r.user_id);
        db.prepare('INSERT INTO academy_squad_member(squad_id,user_id) VALUES(?,?)').run(r.squad_id,r.user_id);
        if(previous&&previous.id!==r.squad_id)db.prepare('UPDATE academy_squad SET supervisor_id=CASE WHEN supervisor_id=? THEN NULL ELSE supervisor_id END,revision=revision+1,updated_at=? WHERE id=?').run(r.user_id,now,previous.id);
        db.prepare('UPDATE academy_squad SET revision=revision+1,updated_at=? WHERE id=?').run(now,r.squad_id);
      }
      db.prepare('UPDATE academy_squad_request SET status=?,revision=revision+1,decided_at=?,decided_by=? WHERE id=?').run(input.status,now,viewer.user_id,id);
      access.audit(viewer.user_id,id,'squad.join.'+input.status,{status:r.status},{squadId:r.squad_id,userId:r.user_id});
      game.squads.notify(r.user_id,'join-decision:'+id,input.status==='approved'?'Seu squad está pronto':'Pedido de squad respondido',input.status==='approved'?'Você agora faz parte de '+squad.name+'.':'O pedido para '+squad.name+' não foi aprovado. Fale com a supervisão.','#perfil');
      return payload(db.prepare('SELECT * FROM academy_squad_request WHERE id=?').get(id));
    });
  };
  const cancel=(viewer,id,revision)=>{const r=db.prepare('SELECT * FROM academy_squad_request WHERE id=? AND user_id=?').get(id,viewer.user_id);if(!r)throw fail('Pedido não encontrado.',404);if(r.status!=='pending'||r.revision!==revision)throw fail('Este pedido já foi respondido.',409);db.prepare("UPDATE academy_squad_request SET status='cancelled',revision=revision+1,decided_at=? WHERE id=?").run(new Date(clock()).toISOString(),id);access.audit(viewer.user_id,id,'squad.join.cancelled',{status:r.status},{status:'cancelled'});return {cancelled:true};};
  return {own,choices,request,inbox,decide,cancel};
}
