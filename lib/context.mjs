import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync, existsSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { betterAuth } from 'better-auth';
import { createAuthMiddleware, APIError, getOAuthState, addOAuthServerContext } from 'better-auth/api';
import { getMigrations } from 'better-auth/db/migration';
import {migrateAccess,normalizeAccess,createAccessService} from './access.mjs';
import {createContentService} from './content.mjs';
import {createContentEngagementService} from './content-engagement.mjs';
import {seedFoundations} from './foundations.mjs';
import {createModuleService} from './modules.mjs';
import {createReadingService} from './readings.mjs';
import {createKnowledgeMapService} from './knowledge-map.mjs';
import {createLearningFlowService} from './learning-flows.mjs';
import {importKnowledgeLibrary} from './knowledge.mjs';
import {createGameService} from './game.mjs';
import {createStudyService} from './study.mjs';
import {createAttemptLimitService} from './attempt-limits.mjs';
import {createProfileService} from './profiles.mjs';
import {createAgendaService} from './agenda.mjs';
import {createManagementService} from './management.mjs';
import {createGoogleCalendarService,googleConfigFromEnv,googleConfigured,GOOGLE_CALENDAR_SCOPE} from './google-calendar.mjs';
import {hostingConfig} from './hosting.mjs';
import {PostgresDatabase} from './postgres-db.mjs';

export const projectRoot=resolve(dirname(fileURLToPath(import.meta.url)),'..');
export const tokenHash=value=>createHash('sha256').update(value).digest('hex');

export async function createContext(options={}) {
  if (process.env.VERCEL) throw new Error('A ST1 Academy exige armazenamento persistente. SQLite não é habilitado em Functions da Vercel. Configure Postgres e o adaptador antes de publicar a avaliação.');
  const runtime=hostingConfig(options,process.env,projectRoot);
  const {dataDir,baseURL,testMode}=runtime;
  mkdirSync(dataDir,{recursive:true});
  const secretFile=resolve(dataDir,'.auth-secret');
  if(runtime.storage==='sqlite'&&!existsSync(secretFile))writeFileSync(secretFile,randomBytes(48).toString('base64url'),{mode:0o600,flag:'wx'});
  const secret=runtime.storage==='postgres'?options.authSecret||process.env.ACADEMY_AUTH_SECRET:readFileSync(secretFile,'utf8');
  const postgresOptions={url:process.env.DATABASE_URL,schema:process.env.ACADEMY_DATABASE_SCHEMA||'academy',...(options.postgres||{})};
  if(runtime.storage==='postgres'&&process.env.ACADEMY_PG_QA==='1'){
    if(!['localhost','127.0.0.1','[::1]'].includes(new URL(postgresOptions.url).hostname))throw new Error('A configuração de QA PostgreSQL é exclusiva do servidor local.');
    postgresOptions.schema='academy_qa_'+createHash('sha256').update(dataDir).digest('hex').slice(0,20);postgresOptions.ssl=false;
  }
  const db=runtime.storage==='postgres'?new PostgresDatabase(postgresOptions):new DatabaseSync(resolve(dataDir,'academy.sqlite'));
  db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');
  const googleConfig={...(options.googleConfig||googleConfigFromEnv()),baseURL};
  const bank=JSON.parse(readFileSync(resolve(projectRoot,'content/questions.json'),'utf8'));
  let access;
  const loadKnowledge=actor=>{if(options.includeLibrary!==false){modules.seed(actor);importKnowledgeLibrary(db,actor,access.audit);modules.linkDefaults();}game.initialize(actor);if(options.includeLibrary!==false&&options.includeLearningFlows!==false){learningFlows.seed(actor);seedFoundations(db,actor,{contents,modules,learningFlows});}};
  const getInvitation=token=>{
    if(typeof token!=='string'||token.length<30||token.length>150)return null;
    const invitation=db.prepare('SELECT * FROM academy_invitation WHERE token_hash=? AND used_by IS NULL AND revoked_at IS NULL AND expires_at>?').get(tokenHash(token),new Date().toISOString());
    return invitation||null;
  };
  const authInvitation=async ctx=>{
    if(ctx?.path==='/sign-up/email')return getInvitation(ctx.headers?.get('x-academy-invite'));
    const id=(await getOAuthState())?.serverContext?.academyInviteId;
    return typeof id==='string'?db.prepare('SELECT * FROM academy_invitation WHERE id=? AND used_by IS NULL AND revoked_at IS NULL AND expires_at>?').get(id,new Date().toISOString()):null;
  };
  const publicGoogleSignup=async(user,ctx)=>ctx?.path==='/callback/:id'&&ctx.params?.id==='google'&&user.emailVerified===true&&(await getOAuthState())?.serverContext?.academyGoogleSignup===true;
  const googleName=(value,email)=>{const name=String(value||'').trim().slice(0,80);return name.length>=3?name:'Participante '+email.split('@')[0].slice(0,55);};
  const authOptions={
    appName:'ST1 Academy',baseURL,secret,database:db,
    trustedOrigins:[baseURL],
    advanced:{cookiePrefix:`academia-st1-${new URL(baseURL).port||'principal'}`,ipAddress:{ipAddressHeaders:['x-academy-client-ip']}},
    emailAndPassword:{enabled:true,minPasswordLength:10,autoSignIn:true},
    account:{encryptOAuthTokens:true,accountLinking:{enabled:true,allowDifferentEmails:false,requireLocalEmailVerified:false,updateUserInfoOnLink:false}},
    socialProviders:googleConfigured(googleConfig)?{google:{clientId:googleConfig.clientId,clientSecret:googleConfig.clientSecret,accessType:'offline',prompt:'select_account consent',scope:[],disableImplicitSignUp:false,overrideUserInfoOnSignIn:false,mapProfileToUser:async p=>{
      if(p.email_verified!==true)throw new APIError('FORBIDDEN',{message:'Use uma conta Google com e-mail verificado.'});
      const email=String(p.email||'').trim().toLowerCase(),existing=db.prepare('SELECT u.id,u.name,m.enabled FROM user u JOIN academy_member m ON m.user_id=u.id WHERE u.email=?').get(email),invite=await authInvitation({path:'/callback/:id'});
      if(existing&&existing.enabled!==1)throw new APIError('FORBIDDEN',{message:'Seu acesso está bloqueado. Procure o Admin da ST1 Academy.'});
      if(invite&&invite.email!==email)throw new APIError('FORBIDDEN',{message:'Use o mesmo e-mail do convite ou entre com Google sem o convite.'});
      return {name:existing?.name||invite?.name||googleName(p.name,email),email,emailVerified:true};
    }}}:{},
    rateLimit:{enabled:true,storage:'database',window:60,max:60,customRules:{'/sign-in/email':{window:60,max:8},'/sign-up/email':{window:60,max:8},'/sign-in/social':{window:60,max:8},'/link-social':{window:60,max:8}}},
    session:{expiresIn:60*60*24*7,updateAge:60*60*24},
    hooks:{before:createAuthMiddleware(async ctx=>{
      if(['/update-user','/change-email','/delete-user'].includes(ctx.path))throw new APIError('FORBIDDEN',{message:'O cadastro e o nome do certificado são definidos pelo gestor da ST1 Academy.'});
      if(['/get-access-token','/refresh-token'].includes(ctx.path)&&ctx.request)throw new APIError('FORBIDDEN',{message:'A integração Google opera somente no servidor.'});
      if(['/sign-in/social','/link-social'].includes(ctx.path)){
        if(!googleConfigured(googleConfig)||ctx.body?.provider!=='google'||ctx.body?.idToken)throw new APIError('FORBIDDEN',{message:'A gestão ainda precisa ativar o acesso pelo Google.'});
        const token=ctx.headers?.get('x-academy-invite'),invite=token?getInvitation(token):null;
        if(token&&!invite)throw new APIError('FORBIDDEN',{message:'Convite inválido ou vencido.'});
        await addOAuthServerContext({...(invite?{academyInviteId:invite.id}:{}),academyGoogleSignup:ctx.path==='/sign-in/social'});
        return {context:{...ctx,body:{...ctx.body,provider:'google',callbackURL:baseURL+'/google/connected',newUserCallbackURL:baseURL+'/google/connected?first=1',errorCallbackURL:baseURL+'/login?google=error',scopes:ctx.path==='/link-social'?[GOOGLE_CALENDAR_SCOPE]:[],...(ctx.path==='/sign-in/social'?{requestSignUp:true}:{})}}};
      }
      if(ctx.path==='/sign-up/email'){
        const invitation=getInvitation(ctx.headers?.get('x-academy-invite'));
        if(!invitation||String(ctx.body?.email||'').trim().toLowerCase()!==invitation.email)throw new APIError('FORBIDDEN',{message:'Use o convite pessoal enviado pelo gestor.'});
        return {context:{...ctx,body:{...ctx.body,name:invitation.name,email:invitation.email}}};
      }
    }),after:createAuthMiddleware(async ctx=>{
      if(ctx.path==='/sign-in/social'&&ctx.context.returned?.url?.startsWith('https://accounts.google.com/')){
        const remember=ctx.headers?.get('x-academy-remember')==='1',cookie=ctx.context.authCookies.dontRememberToken;
        if(remember)ctx.setCookie(cookie.name,'',{...cookie.attributes,maxAge:0});
        else await ctx.setSignedCookie(cookie.name,'true',ctx.context.secret,cookie.attributes);
      }
    })},
    databaseHooks:{user:{create:{before:async(user,ctx)=>{
      const invitation=await authInvitation(ctx);
      if(!invitation&&await publicGoogleSignup(user,ctx))return {data:{...user,name:googleName(user.name,user.email),email:String(user.email).trim().toLowerCase()}};
      if(!invitation||String(user.email).trim().toLowerCase()!==invitation.email||ctx?.path!=='/sign-up/email'&&!user.emailVerified)throw new APIError('FORBIDDEN',{message:'Use o convite pessoal enviado pelo gestor para esta conta.'});
      return {data:{...user,name:invitation.name,email:invitation.email}};
    },after:async(user,ctx)=>{
      const invitation=await authInvitation(ctx);
      if(!invitation){
        if(!await publicGoogleSignup(user,ctx))throw new APIError('FORBIDDEN',{message:'Convite inválido.'});
        db.exec('BEGIN IMMEDIATE');
        try{
          db.prepare("INSERT INTO academy_member(user_id,role,tracks_json,permissions_json) VALUES(?,'seller','[]','[]')").run(user.id);
          access.audit(null,user.id,'member.google_enrolled',null,{role:'seller',tracks:[],permissions:[]});
          db.exec('COMMIT');
        }catch(error){db.exec('ROLLBACK');throw error;}
        for(const admin of db.prepare("SELECT user_id FROM academy_member WHERE role='admin' AND enabled=1").all())game.squads.notify(admin.user_id,'google-enrolled:'+user.id,'Novo acesso pelo Google',user.name+' entrou como Vendedor. Defina as trilhas e áreas na gestão de Acessos.','#acessos');
        return;
      }
      const selection={supervisorIds:JSON.parse(invitation.supervisor_ids_json).filter(id=>db.prepare('SELECT role FROM academy_member WHERE user_id=?').get(id)?.role==='supervisor'),sellerIds:JSON.parse(invitation.seller_ids_json).filter(id=>db.prepare('SELECT role FROM academy_member WHERE user_id=?').get(id)?.role==='seller')};
      db.exec('BEGIN IMMEDIATE');
      try{
        db.prepare('INSERT INTO academy_member(user_id,role,tracks_json,external_user_id,permissions_json) VALUES(?,?,?,?,?)').run(user.id,invitation.role,invitation.tracks_json,invitation.external_user_id,invitation.permissions_json);
        access.applyRelationships(user.id,invitation.role,selection);
        db.prepare('UPDATE academy_invitation SET used_by=? WHERE id=? AND used_by IS NULL').run(user.id,invitation.id);
        access.audit(null,user.id,'member.enrolled',null,{role:invitation.role,tracks:JSON.parse(invitation.tracks_json),permissions:JSON.parse(invitation.permissions_json)});
        db.exec('COMMIT');
      }catch(error){db.exec('ROLLBACK');throw error;}
      if(invitation.role==='admin')loadKnowledge(user.id);
    }}}}
  };
  const migrations=await getMigrations(authOptions);
  await migrations.runMigrations();
  db.exec(`
    CREATE TABLE IF NOT EXISTS academy_member(user_id TEXT PRIMARY KEY REFERENCES user(id),role TEXT NOT NULL CHECK(role IN ('admin','seller')),tracks_json TEXT NOT NULL,external_user_id TEXT);
    CREATE TABLE IF NOT EXISTS academy_invitation(id TEXT PRIMARY KEY,token_hash TEXT NOT NULL UNIQUE,name TEXT NOT NULL,email TEXT NOT NULL,role TEXT NOT NULL CHECK(role IN ('admin','seller')),tracks_json TEXT NOT NULL,external_user_id TEXT,created_at TEXT NOT NULL,expires_at TEXT NOT NULL,used_by TEXT);
    CREATE TABLE IF NOT EXISTS academy_attempt(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES user(id),track_id TEXT NOT NULL,version TEXT NOT NULL,questions_private TEXT NOT NULL,answers_json TEXT NOT NULL DEFAULT '{}',revision INTEGER NOT NULL DEFAULT 0,status TEXT NOT NULL DEFAULT 'open',started_at TEXT NOT NULL,finished_at TEXT,result_json TEXT);
    CREATE INDEX IF NOT EXISTS academy_attempt_user_idx ON academy_attempt(user_id,track_id,started_at);
    CREATE TABLE IF NOT EXISTS academy_certificate(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES user(id),attempt_id TEXT NOT NULL REFERENCES academy_attempt(id),track_id TEXT NOT NULL,version TEXT NOT NULL,name TEXT NOT NULL,score REAL NOT NULL,issued_at TEXT NOT NULL,pdf BLOB,pdf_sha256 TEXT,UNIQUE(user_id,track_id,version));
    CREATE TABLE IF NOT EXISTS academy_outbox(id TEXT PRIMARY KEY,certificate_id TEXT NOT NULL UNIQUE REFERENCES academy_certificate(id),event_type TEXT NOT NULL,payload_json TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'pending',created_at TEXT NOT NULL,delivered_at TEXT);
    CREATE TABLE IF NOT EXISTS academy_settings(key TEXT PRIMARY KEY,value TEXT NOT NULL);
  `);
  migrateAccess(db);
  access=createAccessService(db,bank);
  const modules=createModuleService(db,bank,access.audit);
  const contents=createContentService(db,bank,access.audit);
  const contentEngagement=createContentEngagementService(db,contents);
  const readings=createReadingService(db,contents);
  const attemptLimits=createAttemptLimitService(db,bank,access,{clock:options.clock});
  const game=createGameService(db,bank,access,{clock:options.clock,attemptLimits});
  const study=createStudyService(db,contents,{clock:options.clock});
  const profiles=createProfileService(db,bank,access,game,study,{clock:options.clock});
  const environment=testMode?'test':'production';
  let lockedEnvironment=db.prepare("SELECT value FROM academy_settings WHERE key='environment'").get();
  if(!lockedEnvironment){
    const legacyAttempts=db.prepare('SELECT count(*) n FROM academy_attempt').get().n;
    const initialEnvironment=legacyAttempts>0?'test':environment;
    db.prepare("INSERT INTO academy_settings(key,value) VALUES('environment',?)").run(initialEnvironment);
    lockedEnvironment={value:initialEnvironment};
  }
  if(lockedEnvironment.value!==environment){
    db.close();
    throw new Error('Este banco pertence a outro ambiente. Preserve o modo original e use um banco separado para a publicação: aprovações de teste não se tornam certificados de produção.');
  }
  const auth=betterAuth(authOptions);
  const agenda=createAgendaService(db,access,game,contents,{clock:options.clock});
  const management=createManagementService(db,bank,access,contents,agenda,game,{baseURL,testMode});
  const knowledgeMap=createKnowledgeMapService(db,bank,{game});
  const learningFlows=createLearningFlowService(db,bank,{contents,readings,game,access});
  game.setFlowGuard((viewer,id)=>{if(viewer.role==='admin')return true;const gate=learningFlows.gates(viewer,'quiz',id);return gate?!gate.locked:null;});
  game.setPathProvider(viewer=>{try{return learningFlows.get(viewer,'percurso-bi');}catch(error){if(error.status===404)return null;throw error;}});
  const googleCalendar=createGoogleCalendarService(db,auth,agenda,access,{config:googleConfig,clock:options.clock,...(options.calendarFetch?{fetcher:options.calendarFetch}:{}),...(options.calendarTokenProvider?{tokenProvider:options.calendarTokenProvider}:{})});
  const createInvitation=({name,email,role='seller',tracks,permissions,supervisorIds=[],sellerIds=[],externalUserId=null,actorId=null})=>{
    if(typeof name!=='string'||name.trim().length<3||name.trim().length>80)throw new Error('Informe um nome entre 3 e 80 caracteres.');
    if(typeof email!=='string'||email.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw new Error('Informe um e-mail válido.');
    const value=normalizeAccess({role,tracks,permissions},bank),selection=access.relationships(role,{supervisorIds,sellerIds});
    email=email.trim().toLowerCase();
    if(db.prepare('SELECT id FROM user WHERE email=?').get(email))throw new Error('Esse e-mail já tem uma conta na ST1 Academy.');
    if(db.prepare('SELECT 1 FROM academy_invitation WHERE email=? AND used_by IS NULL AND revoked_at IS NULL AND expires_at>?').get(email,new Date().toISOString()))throw new Error('Já existe um convite válido para esse e-mail. Edite o convite na área de Acessos.');
    const token=randomBytes(32).toString('base64url');
    const id=randomUUID(),createdAt=new Date().toISOString(),expiresAt=new Date(Date.now()+7*86400000).toISOString();
    db.prepare('INSERT INTO academy_invitation(id,token_hash,name,email,role,tracks_json,external_user_id,created_at,expires_at,permissions_json,supervisor_ids_json,seller_ids_json) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run(id,tokenHash(token),name.trim(),email,role,JSON.stringify(value.tracks),externalUserId?String(externalUserId):null,createdAt,expiresAt,JSON.stringify(value.permissions),JSON.stringify(selection.supervisorIds),JSON.stringify(selection.sellerIds));
    access.audit(actorId,id,'invitation.created',null,{name:name.trim(),email,...value,...selection});
    return {id,url:`${baseURL}/login?convite=${token}`,expiresAt};
  };
  const createInvitations=(items,actorId=null)=>{
    if(!Array.isArray(items)||items.length<1||items.length>100)throw new Error('Importe entre 1 e 100 pessoas por arquivo.');
    const seen=new Set(),emails=items.map(item=>{
      if(!item||typeof item.email!=='string')throw new Error('Cada linha precisa informar um e-mail.');
      const email=item.email.trim().toLowerCase();
      if(seen.has(email))throw new Error(`O arquivo contém o e-mail ${email} mais de uma vez.`);
      seen.add(email);return email;
    });
    db.exec('BEGIN IMMEDIATE');
    try{
      const created=items.map((item,index)=>createInvitation({...item,email:emails[index],actorId}));
      db.exec('COMMIT');
      return created.map((invitation,index)=>({...invitation,name:items[index].name.trim(),email:emails[index]}));
    }catch(error){db.exec('ROLLBACK');throw error;}
  };
  const renewInvitation=(id,actorId)=>{
    const current=db.prepare('SELECT id,name,email,expires_at FROM academy_invitation WHERE id=? AND used_by IS NULL AND revoked_at IS NULL').get(id);
    if(!current)throw new Error('Convite indisponível para reenvio.');
    const token=randomBytes(32).toString('base64url'),expiresAt=new Date(Date.now()+7*86400000).toISOString();
    db.prepare('UPDATE academy_invitation SET token_hash=?,expires_at=? WHERE id=?').run(tokenHash(token),expiresAt,id);
    access.audit(actorId,id,'invitation.renewed',{expiresAt:current.expires_at},{expiresAt});
    return {id,name:current.name,email:current.email,url:`${baseURL}/login?convite=${token}`,expiresAt};
  };
  const authContext=await auth.$context;
  await authContext.checkSchema?.();
  const owner=db.prepare("SELECT user_id FROM academy_member WHERE role='admin' AND enabled=1 ORDER BY rowid LIMIT 1").get();if(owner)loadKnowledge(owner.user_id);
  return {db,auth,bank,baseURL,testMode,getInvitation,createInvitation,createInvitations,renewInvitation,dataDir,access,attemptLimits,contents,contentEngagement,modules,readings,game,study,profiles,agenda,management,knowledgeMap,learningFlows,googleCalendar,googleConfig,runtime,integrationKey:secret};
}
