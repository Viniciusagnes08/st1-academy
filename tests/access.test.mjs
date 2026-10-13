// These fixtures isolate the existing grading/access/study contracts.
// Default curriculum and prerequisite enforcement are covered in learning-flows.test.mjs.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {resolve,dirname,basename} from 'node:path';
import {tmpdir} from 'node:os';
import {randomBytes} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {createApp} from '../server.mjs';
import {migrateAccess,readProfile} from '../lib/access.mjs';

test('Migração preserva contas e convites anteriores e acrescenta o perfil Supervisor',()=>{
  const db=new DatabaseSync(':memory:');
  try{
    db.exec(`PRAGMA foreign_keys=ON;
      CREATE TABLE user(id TEXT PRIMARY KEY,name TEXT,email TEXT);
      INSERT INTO user VALUES('old-admin','Admin existente','old-admin@example.test');
      INSERT INTO user VALUES('old-seller','Vendedor existente','old-seller@example.test');
      CREATE TABLE academy_member(user_id TEXT PRIMARY KEY REFERENCES user(id),role TEXT NOT NULL CHECK(role IN ('admin','seller')),tracks_json TEXT NOT NULL,external_user_id TEXT);
      INSERT INTO academy_member VALUES('old-admin','admin','["pap","digital","elite","indoor","pme"]',NULL);
      INSERT INTO academy_member VALUES('old-seller','seller','["pap"]','external-id-preserved');
      CREATE TABLE academy_invitation(id TEXT PRIMARY KEY,token_hash TEXT NOT NULL UNIQUE,name TEXT NOT NULL,email TEXT NOT NULL,role TEXT NOT NULL CHECK(role IN ('admin','seller')),tracks_json TEXT NOT NULL,external_user_id TEXT,created_at TEXT NOT NULL,expires_at TEXT NOT NULL,used_by TEXT);
      INSERT INTO academy_invitation VALUES('old-invite','original-token-hash','Pessoa convidada','old-invite@example.test','seller','["digital"]',NULL,'2026-10-11','2099-01-01',NULL);`);
    migrateAccess(db);migrateAccess(db);
    assert.deepEqual(readProfile(db,'old-seller').tracks,['pap']);
    assert.equal(readProfile(db,'old-seller').external_user_id,'external-id-preserved');
    assert.equal(readProfile(db,'old-seller').enabled,1);
    assert.ok(readProfile(db,'old-admin').permissions.includes('team_results'));
    assert.equal(db.prepare('SELECT token_hash FROM academy_invitation WHERE id=?').get('old-invite').token_hash,'original-token-hash');
    db.prepare("UPDATE academy_member SET role='supervisor' WHERE user_id='old-seller'").run();
    assert.equal(readProfile(db,'old-seller').role,'supervisor');
    assert.equal(db.prepare('PRAGMA foreign_key_check').all().length,0);
  }finally{db.close();}
});

test('Acessos são aplicados no servidor e Supervisor faz provas próprias enquanto acompanha somente sua equipe',async t=>{
  const directory=await mkdtemp(resolve(tmpdir(),'st1-academia-access-test-'));
  const baseURL='http://localhost:4189';
  let {app,ctx}=await createApp({dataDir:directory,baseURL,testMode:true,includeLearningFlows:false});
  let server=await new Promise(resolve=>{const instance=app.listen(4189,'127.0.0.1',()=>resolve(instance));});
  const clients={admin:{cookie:''},supervisor:{cookie:''},seller:{cookie:''},other:{cookie:''},newAdmin:{cookie:''},newSupervisor:{cookie:''}};
  const request=async(client,path,{method='GET',body,headers={}}={})=>{
    const response=await fetch(baseURL+path,{method,headers:{Origin:baseURL,Connection:'close',...(client?.cookie?{Cookie:client.cookie}:{}),...(body?{'Content-Type':'application/json'}:{}),...headers},...(body?{body:JSON.stringify(body)}:{})});
    const cookies=response.headers.getSetCookie();if(client&&cookies.length)client.cookie=cookies.map(value=>value.split(';')[0]).join('; ');
    const bytes=Buffer.from(await response.arrayBuffer());let data;try{data=JSON.parse(bytes.toString());}catch{data=null;}
    return {status:response.status,data,bytes};
  };
  const enroll=async(client,input,invitation)=>{
    const invite=invitation||ctx.createInvitation(input);const token=new URL(invite.url).searchParams.get('convite');
    const response=await request(client,'/api/auth/sign-up/email',{method:'POST',body:{name:'Nome enviado pelo navegador',email:input.email,password:randomBytes(24).toString('base64url')},headers:{'x-academy-invite':token}});
    assert.equal(response.status,200,JSON.stringify(response.data));client.id=response.data.user.id;return invite;
  };
  const correctAnswers=attempt=>Object.fromEntries(attempt.questions.map(q=>[q.id,ctx.bank.tracks.find(t=>t.id===attempt.trackId).questions.find(item=>item.id===q.id).answer]));
  const fullPermissions=['materials','assessments','conquests'];
  const sellerAccess={role:'seller',tracks:['pap','digital'],permissions:fullPermissions,enabled:true,supervisorIds:[]};
  const supervisorAccess={role:'supervisor',tracks:['pap','digital'],permissions:[...fullPermissions,'team_results'],enabled:true,sellerIds:[]};
  try{
    await enroll(clients.admin,{name:'Admin de teste',email:'access-admin@example.test',role:'admin'});
    await enroll(clients.supervisor,{name:'Supervisor de teste',email:'access-supervisor@example.test',...supervisorAccess});
    await enroll(clients.seller,{name:'Vendedor da equipe',email:'access-seller@example.test',...sellerAccess,supervisorIds:[clients.supervisor.id]});
    await enroll(clients.other,{name:'Vendedor de outra equipe',email:'access-other@example.test',role:'seller'});
    sellerAccess.supervisorIds=[clients.supervisor.id];supervisorAccess.sellerIds=[clients.seller.id];
    await t.test('Vendedor e Supervisor não criam convites nem alteram os próprios privilégios',async()=>{
      for(const client of [clients.seller,clients.supervisor]){
        assert.equal((await request(client,'/api/admin/access')).status,403);
        assert.equal((await request(client,'/api/admin/invitations',{method:'POST',body:{name:'Conta indevida',email:'unauthorized-admin@example.test',role:'admin'}})).status,403);
        assert.equal((await request(client,`/api/admin/members/${client.id}`,{method:'PATCH',body:{role:'admin'}})).status,403);
      }
      assert.equal((await request(clients.seller,'/api/team/report')).status,403);
      assert.equal((await request(clients.supervisor,'/api/admin/report')).status,403);
    });
    await t.test('catálogo e provas respeitam as trilhas e permissões individuais',async()=>{
      const catalog=await request(clients.seller,'/api/catalog');assert.deepEqual(catalog.data.tracks.map(t=>t.id),['pap','digital']);
      assert.equal((await request(clients.seller,'/api/attempts',{method:'POST',body:{trackId:'pme'}})).status,403);
      const changed=await request(clients.admin,`/api/admin/members/${clients.seller.id}`,{method:'PATCH',body:{...sellerAccess,permissions:['assessments','conquests']}});assert.equal(changed.status,200);
      assert.ok((await request(clients.seller,'/api/catalog')).data.tracks.every(t=>t.materials.length===0));
      assert.equal((await request(clients.admin,`/api/admin/members/${clients.seller.id}`,{method:'PATCH',body:{...sellerAccess,permissions:[...fullPermissions,'team_results']}})).status,400);
      await request(clients.admin,`/api/admin/members/${clients.seller.id}`,{method:'PATCH',body:sellerAccess});
    });
    let sellerAttempt,sellerCertificate,supervisorCertificate;
    await t.test('permissão revogada bloqueia uma tentativa já aberta, inclusive salvar e concluir',async()=>{
      sellerAttempt=(await request(clients.seller,'/api/attempts',{method:'POST',body:{trackId:'pap'}})).data;
      await request(clients.admin,`/api/admin/members/${clients.seller.id}`,{method:'PATCH',body:{...sellerAccess,permissions:['materials','conquests']}});
      assert.equal((await request(clients.seller,`/api/attempts/${sellerAttempt.id}`)).status,403);
      assert.equal((await request(clients.seller,`/api/attempts/${sellerAttempt.id}`,{method:'PUT',body:{answers:{},revision:0}})).status,403);
      assert.equal((await request(clients.seller,`/api/attempts/${sellerAttempt.id}/finish`,{method:'POST',body:{answers:correctAnswers(sellerAttempt),revision:0}})).status,403);
      await request(clients.admin,`/api/admin/members/${clients.seller.id}`,{method:'PATCH',body:sellerAccess});
      const finish=await request(clients.seller,`/api/attempts/${sellerAttempt.id}/finish`,{method:'POST',body:{answers:correctAnswers(sellerAttempt),revision:0}});assert.equal(finish.data.approved,true);sellerCertificate=finish.data.certificate;
    });
    await t.test('Supervisor realiza suas provas com regra crítica obrigatória e recebe certificado próprio',async()=>{
      const start=(await request(clients.supervisor,'/api/attempts',{method:'POST',body:{trackId:'digital'}})).data;
      const wrong=correctAnswers(start),critical=ctx.bank.tracks.find(t=>t.id==='digital').questions.find(q=>q.critical);wrong[critical.id]=critical.options.find(o=>o.id!==critical.answer).id;
      const fail=await request(clients.supervisor,`/api/attempts/${start.id}/finish`,{method:'POST',body:{answers:wrong,revision:0}});assert.equal(fail.data.score,95);assert.equal(fail.data.approved,false);
      const retry=(await request(clients.supervisor,'/api/attempts',{method:'POST',body:{trackId:'digital'}})).data;
      const pass=await request(clients.supervisor,`/api/attempts/${retry.id}/finish`,{method:'POST',body:{answers:correctAnswers(retry),revision:0}});assert.equal(pass.data.approved,true);supervisorCertificate=pass.data.certificate;
      const profile=(await request(clients.supervisor,'/api/me')).data;assert.equal(profile.certificates[0].id,supervisorCertificate.id);
      assert.equal((await request(clients.supervisor,`/api/certificates/${supervisorCertificate.id}/pdf`)).status,200);
    });
    await t.test('Supervisor vê somente sua equipe; sua própria prova fica fora do relatório e do CSV da equipe',async()=>{
      const unrelated=(await request(clients.other,'/api/attempts',{method:'POST',body:{trackId:'pap'}})).data;
      await request(clients.other,`/api/attempts/${unrelated.id}/finish`,{method:'POST',body:{answers:correctAnswers(unrelated),revision:0}});
      const report=(await request(clients.supervisor,'/api/team/report')).data;assert.deepEqual(report.users.map(u=>u.id),[clients.seller.id]);assert.equal(report.attempts.length,1);assert.equal(report.attempts[0].user_id,clients.seller.id);assert.equal(report.certificates,1);
      const csv=(await request(clients.supervisor,'/api/team/report.csv')).bytes.toString();assert.match(csv,/access-seller@example.test/);assert.doesNotMatch(csv,/access-other@example.test|access-supervisor@example.test/);
      assert.equal((await request(clients.supervisor,`/api/attempts/${sellerAttempt.id}`)).status,404);
      assert.equal((await request(clients.supervisor,`/api/certificates/${sellerCertificate.id}/pdf`)).status,200);
      assert.equal((await request(clients.other,`/api/certificates/${supervisorCertificate.id}/pdf`)).status,404);
    });
    await t.test('trilhas do Supervisor e vínculo com vendedor também limitam relatório e certificados',async()=>{
      await request(clients.admin,`/api/admin/members/${clients.supervisor.id}`,{method:'PATCH',body:{...supervisorAccess,tracks:['digital']}});
      assert.equal((await request(clients.supervisor,'/api/team/report')).data.attempts.length,0);
      assert.equal((await request(clients.supervisor,`/api/certificates/${sellerCertificate.id}/pdf`)).status,404);
      await request(clients.admin,`/api/admin/members/${clients.supervisor.id}`,{method:'PATCH',body:{...supervisorAccess,sellerIds:[]}});
      assert.equal((await request(clients.supervisor,'/api/team/report')).data.users.length,0);
      await request(clients.admin,`/api/admin/members/${clients.supervisor.id}`,{method:'PATCH',body:supervisorAccess});
    });
    await t.test('bloqueio é imediato na sessão existente e preserva histórico; reativação recupera os resultados',async()=>{
      await request(clients.admin,`/api/admin/members/${clients.seller.id}`,{method:'PATCH',body:{...sellerAccess,enabled:false}});
      assert.equal((await request(clients.seller,'/api/me')).status,403);assert.equal((await request(clients.seller,'/api/catalog')).status,403);
      assert.equal((await request(clients.seller,`/api/certificates/${sellerCertificate.id}/pdf`)).status,403);
      await request(clients.admin,`/api/admin/members/${clients.seller.id}`,{method:'PATCH',body:sellerAccess});
      assert.equal((await request(clients.seller,'/api/me')).data.certificates.length,1);
      await request(clients.admin,`/api/admin/members/${clients.seller.id}`,{method:'PATCH',body:{...sellerAccess,permissions:['materials','assessments']}});
      assert.equal((await request(clients.seller,'/api/me')).data.certificates.length,0);
      assert.equal((await request(clients.seller,`/api/certificates/${sellerCertificate.id}/pdf`)).status,404);
      await request(clients.admin,`/api/admin/members/${clients.seller.id}`,{method:'PATCH',body:sellerAccess});
    });
    await t.test('Admin gerencia perfis e convites, mas o último Admin ativo não pode ser removido',async()=>{
      assert.equal((await request(clients.admin,`/api/admin/members/${clients.admin.id}`,{method:'PATCH',body:{role:'seller',tracks:['pap']}})).status,400);
      assert.equal((await request(clients.admin,`/api/admin/members/${clients.admin.id}`,{method:'PATCH',body:{role:'admin',enabled:false}})).status,400);
      const invite=await request(clients.admin,'/api/admin/invitations',{method:'POST',body:{name:'Segundo Admin de teste',email:'access-second-admin@example.test',role:'admin',tracks:[],permissions:[]}});assert.equal(invite.status,201);
      await enroll(clients.newAdmin,{email:'access-second-admin@example.test'},invite.data);
      assert.equal((await request(clients.newAdmin,'/api/admin/access')).status,200);
      assert.equal((await request(clients.newAdmin,'/api/me')).data.tracks.length,5);
      await request(clients.admin,`/api/admin/members/${clients.newAdmin.id}`,{method:'PATCH',body:{role:'seller',tracks:[],permissions:[]}});
      assert.equal((await request(clients.newAdmin,'/api/admin/access')).status,403);
      assert.equal((await request(clients.newAdmin,'/api/catalog')).data.tracks.length,0);
    });
    await t.test('convite pode ser ajustado antes de ativar e revogação impede cadastro',async()=>{
      const invite=await request(clients.admin,'/api/admin/invitations',{method:'POST',body:{name:'Novo Supervisor de teste',email:'access-new-supervisor@example.test',role:'seller',tracks:['pap']}});
      const edit=await request(clients.admin,`/api/admin/invitations/${invite.data.id}`,{method:'PATCH',body:{...supervisorAccess,sellerIds:[clients.seller.id]}});assert.equal(edit.status,200);
      await enroll(clients.newSupervisor,{email:'access-new-supervisor@example.test'},invite.data);
      assert.equal((await request(clients.newSupervisor,'/api/me')).data.role,'supervisor');assert.equal((await request(clients.newSupervisor,'/api/team/report')).data.users[0].id,clients.seller.id);
      const revoked=await request(clients.admin,'/api/admin/invitations',{method:'POST',body:{name:'Convite revogado de teste',email:'access-revoked@example.test',role:'seller'}});
      assert.equal((await request(clients.admin,`/api/admin/invitations/${revoked.data.id}/revoke`,{method:'POST',body:{}})).status,200);
      const token=new URL(revoked.data.url).searchParams.get('convite');assert.equal((await request(null,`/api/invitation/${token}`)).status,404);
      assert.equal((await request(null,'/api/auth/sign-up/email',{method:'POST',body:{name:'Convite revogado',email:'access-revoked@example.test',password:randomBytes(24).toString('base64url')},headers:{'x-academy-invite':token}})).status,403);
      assert.ok(ctx.db.prepare('SELECT count(*) n FROM academy_access_audit').get().n>10);
    });
    await new Promise(resolve=>server.close(resolve));ctx.db.close();
    const restarted=await createApp({dataDir:directory,baseURL,testMode:true,includeLearningFlows:false});ctx=restarted.ctx;server=await new Promise(resolve=>{const instance=restarted.app.listen(4189,'127.0.0.1',()=>resolve(instance));});
    await t.test('perfis, permissões e equipes persistem depois de reiniciar',async()=>{
      assert.equal((await request(clients.supervisor,'/api/me')).data.role,'supervisor');
      assert.equal((await request(clients.supervisor,'/api/team/report')).data.users[0].id,clients.seller.id);
      assert.equal((await request(clients.supervisor,'/api/me')).data.certificates[0].id,supervisorCertificate.id);
    });
  }finally{await new Promise(resolve=>server.close(resolve));ctx.db.close();assert.equal(dirname(directory),resolve(tmpdir()));assert.ok(basename(directory).startsWith('st1-academia-access-test-'));await rm(directory,{recursive:true,force:true});}
});
