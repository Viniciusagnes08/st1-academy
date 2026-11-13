import express from 'express';
import {mountM24} from './lib/m24-routes.mjs';
import {toNodeHandler,fromNodeHeaders} from 'better-auth/node';
import {randomUUID,createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {readFileSync} from 'node:fs';
import {createContext,projectRoot} from './lib/context.mjs';
import {grade,publicQuestion,shuffle} from './lib/grading.mjs';
import {certificatePdf} from './lib/certificate.mjs';
import {readProfile,hasPermission,hasTrack} from './lib/access.mjs';
import {sendChatMedia} from './lib/chat-media.mjs';
import {createBackupService} from './lib/storage-backup.mjs';
import {hostingConfig} from './lib/hosting.mjs';
import {applyStagedProduction} from './lib/production-transfer.mjs';
import {withLearningReadBatch} from './lib/learning-read-batch.mjs';
import {createInvitationMailer} from './lib/invitation-mail.mjs';
import {createPasswordRecoveryLimiter} from './lib/password-recovery.mjs';
import {validateEmailAddresses} from './lib/email-validation.mjs';
import {createCampaignService} from './lib/campaigns.mjs';
import {createEmailAutomationService} from './lib/email-automation-service.mjs';
import {createWhatsAppCampaignService} from './lib/whatsapp-campaigns.mjs';
import {createWhatsAppAutomationService} from './lib/whatsapp-automations.mjs';
import {createWhatsAppReceipts} from './lib/whatsapp-receipts.mjs';
import {createWhatsAppTemplateService} from './lib/whatsapp-templates.mjs';
import {createIntegrationService} from './lib/integrations.mjs';
import {createOnboardingService} from './lib/onboarding.mjs';

export async function createApp(options={}) {
  const ctx=await createContext(options);
  const {db,auth,bank,baseURL,testMode,access,attemptLimits}=ctx;
  const recoveryLimiter=createPasswordRecoveryLimiter(db,{secret:ctx.integrationKey,clock:options.clock});
  const validateInvitationEmails=emails=>validateEmailAddresses(emails,{checkDomainFn:testMode?async()=> 'unknown':undefined});
  const integrations=createIntegrationService(db,{secret:ctx.integrationKey,env:process.env});
  const mailEnv=options.mailEnv||integrations.effective(),whatsappEnv=options.whatsappEnv||integrations.effective();
  const invitationMailer=options.invitationMailer|| (async invitation=>{const mailer=createInvitationMailer(mailEnv);if(!mailer)throw new Error('SMTP indisponível.');return mailer(invitation);});
  const onboarding=createOnboardingService(db,bank);
  const campaigns=createCampaignService(db,{env:mailEnv,baseURL});
  const emailAutomations=createEmailAutomationService(db,{env:mailEnv,baseURL,mailerTransport:options.emailAutomationTransport,context:ctx});
  const whatsappReceipts=createWhatsAppReceipts(db,{env:whatsappEnv});
  const whatsappTemplates=createWhatsAppTemplateService(db,{env:whatsappEnv});
  const whatsappCampaigns=createWhatsAppCampaignService(db,{env:whatsappEnv,sendTemplate:options.whatsappSender,receipts:whatsappReceipts});
  const whatsappAutomations=createWhatsAppAutomationService(db,{env:whatsappEnv,baseURL,context:ctx,sendTemplate:options.whatsappSender,receipts:whatsappReceipts});
  const deliverInvitation=async invitation=>{
    if(!options.invitationMailer&&!createInvitationMailer(mailEnv))return {...invitation,delivery:'not_configured'};
    try{await invitationMailer(invitation);return {...invitation,delivery:'sent'};}
    catch(error){console.error('Falha no envio de convite da Academy:',error.code||error.message);return {...invitation,delivery:'failed'};}
  };
  const app=express();
  const appVersion=JSON.parse(readFileSync(resolve(projectRoot,'package.json'),'utf8')).version;
  app.disable('x-powered-by');
  app.set('trust proxy',ctx.runtime.proxyHops);
  app.locals.shuttingDown=false;
  app.use((req,res,next)=>{
    req.headers['x-academy-client-ip']=req.ip||req.socket.remoteAddress||'127.0.0.1';
    res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
    res.setHeader('X-Frame-Options','SAMEORIGIN');
    if(ctx.runtime.production)res.setHeader('Strict-Transport-Security','max-age=31536000; includeSubDomains');
    res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; media-src 'self' blob:; font-src 'self' data: blob:; connect-src 'self'; worker-src 'self' blob:; frame-ancestors 'self'; base-uri 'none'; form-action 'self'");
    if(req.path.startsWith('/api/'))res.setHeader('Cache-Control','no-store');
    next();
  });
  const ready=()=>!app.locals.shuttingDown&&(!ctx.runtime.production||!!db.prepare("SELECT 1 FROM academy_member WHERE role='admin' AND enabled=1").get());
  app.get('/healthz',(_,res)=>{
    res.setHeader('Cache-Control','no-store');
    try{db.prepare('SELECT 1').get();const ok=ready();res.status(ok?200:503).json({status:ok?'ok':'preparing',version:appVersion,environment:ctx.runtime.environment});}
    catch{res.status(503).json({status:'unavailable'});}
  });
  app.use((req,res,next)=>ready()?next():res.status(503).set('Retry-After','30').json({message:'A ST1 Academy está sendo preparada. Tente novamente em alguns instantes.'}));
  app.get('/api/webhooks/whatsapp',(req,res)=>{const challenge=whatsappReceipts.verify(req.query['hub.mode'],req.query['hub.verify_token'],req.query['hub.challenge']);if(challenge===null)return res.sendStatus(403);res.type('text/plain').send(challenge);});
  app.post('/api/webhooks/whatsapp',express.raw({type:'application/json',limit:'256kb'}),(req,res)=>whatsappReceipts.ingest(req.body,req.get('x-hub-signature-256'))?res.sendStatus(200):res.sendStatus(403));
  // Prevent bypassing our per-mailbox and per-IP throttling through native Better Auth aliases.
  app.all(['/api/auth/request-password-reset','/api/auth/forget-password','/api/auth/forgot-password'],(_,res)=>res.sendStatus(404));
  app.all('/api/auth/*splat',toNodeHandler(auth));
  app.use((req,res,next)=>express.json({limit:req.path==='/api/admin/campaigns'?'6mb':'128kb'})(req,res,next));
  app.get('/api/campaigns/open/:token.gif',(req,res)=>{campaigns.mark('open',req.params.token);res.setHeader('Cache-Control','no-store');res.type('image/gif').send(Buffer.from('R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=','base64'));});
  app.get('/api/campaigns/click/:token',(req,res)=>{const target=campaigns.mark('click',req.params.token);if(!target)return res.sendStatus(404);res.redirect(302,new URL(target,baseURL).href);});
  app.get('/api/campaigns/preferences/:token',(req,res)=>{const person=campaigns.preference(req.params.token);if(!person)return res.sendStatus(404);res.type('html').send(`<main style="font:16px Arial,sans-serif;max-width:560px;margin:80px auto;padding:24px"><h1>E-mails de incentivo</h1><p>Você pode deixar de receber as campanhas da ST1 Academy.</p><form method="post"><button style="background:#f77716;color:white;border:0;padding:14px 20px;cursor:pointer">Parar de receber</button></form></main>`);});
  app.post('/api/campaigns/preferences/:token',express.urlencoded({extended:false}),(req,res)=>{if(!campaigns.optout(req.params.token))return res.sendStatus(404);res.type('html').send('<main style="font:16px Arial,sans-serif;max-width:560px;margin:80px auto;padding:24px"><h1>Preferência salva</h1><p>Você não receberá novas campanhas de incentivo da ST1 Academy.</p></main>');});
  app.get('/api/email-automations/preferences/:token',(req,res)=>{res.type('html').send(`<main style="font:16px Arial,sans-serif;max-width:560px;margin:80px auto;padding:24px"><h1>Preferências de e-mail</h1><form method="post"><button>Parar de receber e-mails de incentivo</button></form></main>`);});
  app.post('/api/email-automations/preferences/:token',express.urlencoded({extended:false}),(req,res)=>{if(!emailAutomations.optout(req.params.token))return res.sendStatus(404);res.type('html').send('<main style="font:16px Arial,sans-serif;max-width:560px;margin:80px auto;padding:24px"><h1>Preferência salva</h1><p>Você não receberá novos e-mails de incentivo da ST1 Academy.</p></main>');});
  app.get('/api/email-automations/feedback/:token',(req,res)=>{const html=emailAutomations.npsFeedbackPage(req.params.token);if(!html)return res.sendStatus(404);res.type('html').send(html);});
  app.post('/api/email-automations/feedback/:token',express.urlencoded({extended:false}),(req,res)=>{if(req.headers.origin!==baseURL)return res.sendStatus(403);try{emailAutomations.submitFeedback(req.params.token,req.body);res.type('html').send('<main style="font:16px Arial,sans-serif;max-width:640px;margin:60px auto;padding:28px"><h1>Obrigado pelo seu feedback.</h1><p>As suas respostas foram registradas de forma privada e vão ajudar a melhorar a ST1 Academy.</p></main>');}catch(error){res.status(400).type('html').send(`<main style="font:16px Arial,sans-serif;max-width:640px;margin:60px auto;padding:28px"><h1>Não foi possível registrar.</h1><p>${String(error.message).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]))}</p></main>`);}});
  app.use('/api',(req,res,next)=>{

    if(['POST','PUT','PATCH','DELETE'].includes(req.method)&&req.headers.origin!==baseURL)return res.status(403).json({message:'Solicitação de outra origem não permitida.'});
    next();
  });
  const recoveryMessage='Se o e-mail estiver cadastrado e habilitado para login por senha, você receberá instruções para redefinição. Verifique a caixa de entrada e o spam.';
  app.post('/api/password-recovery/request',async(req,res)=>{
    const started=Date.now(),email=typeof req.body?.email==='string'?req.body.email.trim().toLowerCase():'';
    try{
      if(recoveryLimiter.permit(email,req.ip)){
        // Never let an untrusted Host or redirectTo field determine where tokens are delivered.
        await auth.api.requestPasswordReset({body:{email,redirectTo:baseURL+'/redefinir-senha'}});
      }
    }catch(error){
      // Generic reply prevents account enumeration and hides SMTP/internal errors.
      console.error('Falha controlada na solicitação de redefinição:',String(error.code||'RECOVERY_REQUEST_FAILED').slice(0,50));
    }
    const minimum=350-(Date.now()-started);
    if(minimum>0)await new Promise(resolve=>setTimeout(resolve,minimum));
    res.status(202).json({message:recoveryMessage});
  });
  const member=async(req,res,next)=>{
    if(req.member)return next();
    const session=await auth.api.getSession({headers:fromNodeHeaders(req.headers)});
    if(!session)return res.status(401).json({message:'Entre com a sua conta da ST1 Academy.'});
    const profile=readProfile(db,session.user.id);
    if(!profile||profile.enabled!==1)return res.status(403).json({message:'Seu acesso está bloqueado. Procure o Admin da ST1 Academy.'});
    req.member=profile;
    if(!onboarding.read(profile.user_id)&&!['/api/onboarding','/api/bootstrap','/api/me'].includes(req.path))return res.status(403).json({code:'ONBOARDING_REQUIRED',message:'Conclua seu primeiro acesso antes de usar a Academy.'});
    next();
  };
  const admin=(req,res,next)=>req.member.role==='admin'?next():res.status(403).json({message:'Acesso exclusivo de Admin.'});
  const team=(req,res,next)=>['supervisor','admin'].includes(req.member.role)&&hasPermission(req.member,'team_results')?next():res.status(403).json({message:'Você não tem acesso ao acompanhamento da equipe.'});
  const agendaAction=handler=>async(req,res,next)=>{try{await handler(req,res);}catch(e){if(e.status)return res.status(e.status>=400&&e.status<=599?e.status:400).json({message:e.message});next(e);}};
  const m24=mountM24(app,{ctx,member,config:options.m24||{enabled:process.env.ACADEMY_M24_ENABLED!=='0'}});
  app.get('/api/admin/manage',member,admin,agendaAction((req,res)=>res.json(ctx.management.catalog(req.member))));
  app.get('/api/admin/manage/choices',member,admin,agendaAction((req,res)=>res.json(ctx.management.choices(req.member))));
  app.get('/api/admin/manage/:entity',member,admin,agendaAction((req,res)=>res.json(ctx.management.list(req.member,req.params.entity,{trash:req.query.trash==='1'}))));
  app.post('/api/admin/manage/:entity',member,admin,agendaAction((req,res)=>res.status(201).json(ctx.management.save(req.member,req.params.entity,null,req.body))));
  app.get('/api/admin/manage/:entity/:id/preview.svg',member,admin,agendaAction((req,res)=>res.type('image/svg+xml').send(ctx.management.preview(req.member,req.params.entity,req.params.id))));
  app.post('/api/admin/manage/:entity/:id/issue',member,admin,agendaAction(async(req,res)=>res.status(201).json(await ctx.management.issue(req.member,req.params.entity,req.params.id,req.body))));
  app.get('/api/admin/manage/:entity/:id',member,admin,agendaAction((req,res)=>res.json(ctx.management.detail(req.member,req.params.entity,req.params.id))));
  app.patch('/api/admin/manage/:entity/:id',member,admin,agendaAction((req,res)=>res.json(ctx.management.save(req.member,req.params.entity,req.params.id,req.body))));
  app.delete('/api/admin/manage/:entity/:id',member,admin,agendaAction((req,res)=>res.json(ctx.management.remove(req.member,req.params.entity,req.params.id,req.body))));
  app.post('/api/admin/manage/:entity/:id/restore',member,admin,agendaAction((req,res)=>res.json(ctx.management.restore(req.member,req.params.entity,req.params.id,req.body))));
  app.patch('/api/admin/manage/:entity/:id/tags',member,admin,agendaAction((req,res)=>res.json(ctx.management.setTags(req.member,req.params.entity,req.params.id,req.body))));
  app.get('/api/admin/recognitions',member,admin,agendaAction((req,res)=>res.json(ctx.management.issued(req.member))));
  app.patch('/api/admin/recognitions/:id',member,admin,agendaAction((req,res)=>res.json(ctx.management.changeIssue(req.member,req.params.id,req.body))));
  app.get('/api/recognitions',member,agendaAction((req,res)=>res.json({items:ctx.management.recognitions(req.member)})));
  app.get('/api/recognitions/:id/:type',member,agendaAction((req,res)=>{if(!['art','pdf'].includes(req.params.type))return res.status(404).json({message:'Arquivo não encontrado.'});const file=ctx.management.artifact(req.member,req.params.id,req.params.type);res.type(file.mime).set('Content-Disposition',(req.params.type==='pdf'?'attachment':'inline')+'; filename="ST1-Conquista-'+req.params.id+(req.params.type==='pdf'?'.pdf':'.svg')+'"').send(file.bytes);}));
  app.get('/api/admin/calendar-setup',member,admin,(req,res)=>res.json({configured:!!ctx.googleConfig.clientId&&!!ctx.googleConfig.clientSecret,origin:baseURL,callbackURL:baseURL+'/api/auth/callback/google'}));
  app.get('/api/auth-settings',(_,res)=>res.json({googleEnabled:!!ctx.googleConfig.clientId&&!!ctx.googleConfig.clientSecret}));
  app.get('/api/agenda',member,agendaAction((req,res)=>res.json(ctx.agenda.list(req.member,{month:req.query.month,management:req.query.management==='1'}))));
  app.get('/api/agenda/choices',member,agendaAction((req,res)=>res.json(ctx.agenda.choices(req.member))));
  app.get('/api/agenda/participation',member,agendaAction((req,res)=>res.json(ctx.agenda.report(req.member))));
  app.get('/api/agenda/google',member,(req,res)=>res.json(ctx.googleCalendar.status(req.member)));
  app.post('/api/agenda/google/connect',member,agendaAction(async(req,res)=>res.json(await ctx.googleCalendar.connect(req.member))));
  app.post('/api/agenda/google/sync',member,agendaAction(async(req,res)=>res.json(await ctx.googleCalendar.sync(req.member.user_id,{restore:true}))));
  app.post('/api/agenda/google/pause',member,agendaAction((req,res)=>res.json(ctx.googleCalendar.pause(req.member))));
  app.post('/api/agenda/items',member,agendaAction((req,res)=>res.status(201).json(ctx.agenda.save(req.member,req.body))));
  app.get('/api/agenda/items/:id',member,agendaAction((req,res)=>res.json(ctx.agenda.detail(req.member,req.params.id))));
  app.patch('/api/agenda/items/:id',member,agendaAction((req,res)=>res.json(ctx.agenda.save(req.member,req.body,req.params.id))));
  app.post('/api/agenda/items/:id/respond',member,agendaAction((req,res)=>res.json(ctx.agenda.respond(req.member,req.params.id,req.body))));
  app.post('/api/agenda/items/:id/submit',member,agendaAction((req,res)=>res.json(ctx.agenda.submit(req.member,req.params.id,req.body))));
  app.post('/api/agenda/items/:id/review/:userId',member,agendaAction((req,res)=>res.json(ctx.agenda.review(req.member,req.params.id,req.params.userId,req.body))));
  app.get('/api/agenda/items/:id/calendar.ics',member,agendaAction((req,res)=>res.type('text/calendar').set('Content-Disposition','attachment; filename="ST1-Academy.ics"').send(ctx.agenda.ics(req.member,req.params.id))));
  app.get('/google/connected',member,async(req,res)=>{
    try{await ctx.googleCalendar.connect(req.member);res.redirect('/'+(req.query.first==='1'?'#perfil/editar/boas-vindas':'#agenda'));}
    catch{res.redirect('/?google=permission#agenda');}
  });
  const trackSummary=(track,includeMaterials=false)=>({id:track.id,name:track.name,badge:track.badge,color:track.color,description:track.description,version:track.version,estimatedMinutes:track.estimatedMinutes,questionCount:track.questions.length,criticalCount:track.questions.filter(q=>q.critical).length,materials:includeMaterials?track.materials:[]});
  const certificates=userId=>db.prepare('SELECT id,track_id,version,score,issued_at FROM academy_certificate WHERE user_id=? ORDER BY issued_at').all(userId);
  const ownedAttempt=(req,res)=>{
    const attempt=db.prepare('SELECT * FROM academy_attempt WHERE id=? AND user_id=?').get(req.params.id,req.member.user_id);
    if(!attempt){res.status(404).json({message:'Tentativa não encontrada.'});return null;}
    if(!hasPermission(req.member,'assessments')||!hasTrack(req.member,attempt.track_id)){res.status(403).json({message:'Esta avaliação não está liberada para sua conta.'});return null;}
    if(attempt.status==='open'){try{ctx.learningFlows.assertAccess(req.member,'certificate',attempt.track_id);}catch(error){res.status(error.status||400).json({message:error.message});return null;}}
    return attempt;
  };
  const attemptPayload=attempt=>({id:attempt.id,trackId:attempt.track_id,version:attempt.version,status:attempt.status,revision:attempt.revision,answers:JSON.parse(attempt.answers_json),questions:JSON.parse(attempt.questions_private).map(publicQuestion),startedAt:attempt.started_at,result:attempt.result_json?JSON.parse(attempt.result_json):null,attemptLimit:attemptLimits.quota(attempt.user_id,'certificate',attempt.track_id,attempt.version)});
  const validateAnswers=(questions,answers,complete=false)=>{
    if(!answers||typeof answers!=='object'||Array.isArray(answers))throw new Error('Respostas inválidas.');
    for(const [id,answer] of Object.entries(answers)){
      const question=questions.find(q=>q.id===id);
      if(!question||!question.options.some(o=>o.id===answer))throw new Error('Uma resposta não pertence a esta tentativa.');
    }
    if(complete&&Object.keys(answers).length!==questions.length)throw new Error('Responda todas as perguntas antes de concluir.');
  };
  app.get('/api/catalog',async(req,res)=>{
    const session=await auth.api.getSession({headers:fromNodeHeaders(req.headers)});
    const profile=session?readProfile(db,session.user.id):null;
    if(session&&(!profile||profile.enabled!==1))return res.status(403).json({message:'Seu acesso está bloqueado. Procure o Admin da ST1 Academy.'});
    res.json({title:bank.title,version:appVersion,minimumPercent:bank.minimumPercent,criticalRequired:bank.criticalRequired,testMode,environment:ctx.runtime.environment,totalTracks:bank.tracks.length,tracks:bank.tracks.filter(track=>!profile||hasTrack(profile,track.id)).map(track=>trackSummary(track,hasPermission(profile,'materials')))});
  });
  app.get('/api/invitation/:token',(req,res)=>{
    const invite=ctx.getInvitation(req.params.token);
    if(!invite)return res.status(404).json({message:'Convite inválido, utilizado ou vencido. Peça outro ao gestor.'});
    ctx.markInvitationAccessed(invite.id);
    res.json({name:invite.name,email:invite.email,role:invite.role,expiresAt:invite.expires_at});
  });
  const memberPayload=profile=>({attemptLimits:Object.fromEntries(bank.tracks.filter(t=>hasTrack(profile,t.id)).map(t=>[t.id,attemptLimits.quota(profile.user_id,'certificate',t.id,t.version)])),m24Homologation:m24.canAccess(profile),id:profile.user_id,name:profile.name,email:profile.email,role:profile.role,avatarUrl:ctx.profiles.avatar(profile,profile.user_id),recognitions:ctx.management.recognitions(profile),tracks:profile.tracks,permissions:profile.permissions,certificates:hasPermission(profile,'conquests')?certificates(profile.user_id).filter(c=>hasTrack(profile,c.track_id)):[],attempts:hasPermission(profile,'assessments')?db.prepare('SELECT id,track_id,status,started_at,finished_at,result_json FROM academy_attempt WHERE user_id=? ORDER BY started_at DESC').all(profile.user_id).filter(a=>hasTrack(profile,a.track_id)).map(a=>({...a,result:a.result_json?JSON.parse(a.result_json):null,result_json:undefined})):[],testMode});
  app.get('/api/me',member,(req,res)=>res.json(memberPayload(req.member)));
  app.post('/api/attempts',member,(req,res)=>{
    const track=bank.tracks.find(t=>t.id===req.body.trackId);
    if(!track||!hasTrack(req.member,track.id)||!hasPermission(req.member,'assessments'))return res.status(403).json({message:'Avaliação não liberada para sua conta.'});
    try{ctx.learningFlows.assertAccess(req.member,'certificate',track.id);}catch(error){return res.status(error.status||400).json({message:error.message});}
    db.exec('BEGIN IMMEDIATE');
    try{
      attemptLimits.lock(req.member.user_id,'certificate',track.id,track.version);
      const current=db.prepare("SELECT * FROM academy_attempt WHERE user_id=? AND track_id=? AND version=? AND status='open' ORDER BY started_at DESC LIMIT 1").get(req.member.user_id,track.id,track.version);
      if(current){const response=attemptPayload(current);db.exec('COMMIT');return res.json(response);}
      attemptLimits.assertAvailable(req.member.user_id,'certificate',track.id,track.version);
      const id=randomUUID(),questions=shuffle(track.questions).map(q=>({...q,options:shuffle(q.options)}));
      db.prepare('INSERT INTO academy_attempt(id,user_id,track_id,version,questions_private,started_at) VALUES(?,?,?,?,?,?)').run(id,req.member.user_id,track.id,track.version,JSON.stringify(questions),new Date().toISOString());
      const response=attemptPayload(db.prepare('SELECT * FROM academy_attempt WHERE id=?').get(id));
      db.exec('COMMIT');res.status(201).json(response);
    }catch(error){db.exec('ROLLBACK');res.status(error.status||500).json({message:error.status?error.message:'Não foi possível iniciar a avaliação.'});}
  });
  app.get('/api/attempt-limits/:kind/:id',member,agendaAction((req,res)=>res.json(attemptLimits.status(req.member,req.params.kind,req.params.id))));
  app.get('/api/attempt-authorizations/blocked',member,team,agendaAction((req,res)=>res.json({items:attemptLimits.blocked(req.member)})));
  app.post('/api/attempt-authorizations',member,team,agendaAction((req,res)=>res.status(201).json(attemptLimits.grant(req.member,req.body))));
  app.get('/api/attempts/:id',member,(req,res)=>{const attempt=ownedAttempt(req,res);if(attempt)res.json(attemptPayload(attempt));});
  app.put('/api/attempts/:id',member,(req,res)=>{
    const attempt=ownedAttempt(req,res);if(!attempt)return;
    if(attempt.status!=='open')return res.status(409).json({message:'Esta tentativa já foi concluída.'});
    try{validateAnswers(JSON.parse(attempt.questions_private),req.body.answers);}catch(error){return res.status(400).json({message:error.message});}
    const result=db.prepare("UPDATE academy_attempt SET answers_json=?,revision=revision+1 WHERE id=? AND user_id=? AND status='open' AND revision=?").run(JSON.stringify(req.body.answers),attempt.id,req.member.user_id,req.body.revision);
    if(result.changes!==1)return res.status(409).json({message:'A tentativa foi atualizada em outra aba. Reabra para continuar.'});
    res.json({revision:attempt.revision+1});
  });
  app.post('/api/attempts/:id/finish',member,(req,res)=>{
    const attempt=ownedAttempt(req,res);if(!attempt)return;
    if(attempt.status==='complete')return res.json(JSON.parse(attempt.result_json));
    if(req.body.revision!==attempt.revision)return res.status(409).json({message:'Reabra a tentativa para recuperar as respostas atuais.'});
    const questions=JSON.parse(attempt.questions_private);
    let result;
    try{validateAnswers(questions,req.body.answers,true);result=grade(questions,req.body.answers,bank.minimumPercent);}catch(error){return res.status(400).json({message:error.message});}
    const issuedAt=new Date().toISOString();
    db.exec('BEGIN IMMEDIATE');
    try{
      if(result.approved){
        let certificate=db.prepare('SELECT * FROM academy_certificate WHERE user_id=? AND track_id=? AND version=?').get(req.member.user_id,attempt.track_id,attempt.version);
        if(!certificate){
          const id=randomUUID();
          db.prepare('INSERT INTO academy_certificate(id,user_id,attempt_id,track_id,version,name,score,issued_at) VALUES(?,?,?,?,?,?,?,?)').run(id,req.member.user_id,attempt.id,attempt.track_id,attempt.version,req.member.name,result.score,issuedAt);
          if(attempt.track_id!=='bi'){
            const payload={eventId:randomUUID(),eventType:'academia.trilha.aprovada',academyUserId:req.member.user_id,st1SalesUserId:req.member.external_user_id,trackId:attempt.track_id,version:attempt.version,score:result.score,criticalRulesPassed:true,certificateId:id,approvedAt:issuedAt};
            db.prepare('INSERT INTO academy_outbox(id,certificate_id,event_type,payload_json,created_at) VALUES(?,?,?,?,?)').run(payload.eventId,id,payload.eventType,JSON.stringify(payload),issuedAt);
          }
          certificate=db.prepare('SELECT * FROM academy_certificate WHERE id=?').get(id);
          ctx.game.onCertificate(certificate);
        }
        result.certificate={id:certificate.id,trackId:certificate.track_id,score:certificate.score,issuedAt:certificate.issued_at};
      }
      db.prepare("UPDATE academy_attempt SET answers_json=?,result_json=?,status='complete',finished_at=?,revision=revision+1 WHERE id=? AND status='open'").run(JSON.stringify(req.body.answers),JSON.stringify(result),issuedAt,attempt.id);
      ctx.learningNps.queue({userId:req.member.user_id,sourceType:'certification',sourceId:attempt.id,sourceVersion:String(attempt.version),title:bank.tracks.find(track=>track.id===attempt.track_id)?.name||attempt.track_id,context:'Prova de certificação',trackIds:[attempt.track_id]});
      db.exec('COMMIT');
    }catch(error){db.exec('ROLLBACK');throw error;}
    res.json(result);
  });
  app.get('/api/certificates/:id/pdf',member,async(req,res)=>{
    let record=db.prepare('SELECT * FROM academy_certificate WHERE id=?').get(req.params.id);
    const allowed=record&&(record.user_id===req.member.user_id?hasPermission(req.member,'conquests')&&hasTrack(req.member,record.track_id):(ctx.game.squads.canInspect(req.member,record.user_id)&&hasTrack(req.member,record.track_id))||ctx.game.squads.canReadCertificate(req.member,record));
    if(!allowed)return res.status(404).json({message:'Certificado não encontrado ou não liberado.'});
    if(!record.pdf){
      const track=bank.tracks.find(t=>t.id===record.track_id);
      const pdf=await certificatePdf({id:record.id,name:record.name,track,score:record.score,issuedAt:record.issued_at,baseURL,testMode});
      const hash=createHash('sha256').update(pdf).digest('hex');
      db.prepare('UPDATE academy_certificate SET pdf=?,pdf_sha256=? WHERE id=? AND pdf IS NULL').run(pdf,hash,record.id);
      record=db.prepare('SELECT * FROM academy_certificate WHERE id=?').get(record.id);
    }
    res.type('application/pdf').setHeader('Content-Disposition',`attachment; filename="ST1-Certificado-${record.track_id}.pdf"`);
    res.send(Buffer.from(record.pdf));
  });
  app.get('/api/verify/:id',(req,res)=>{
    if(!/^[a-f0-9-]{36}$/i.test(req.params.id))return res.status(404).json({valid:false});
    const record=db.prepare('SELECT track_id,version,issued_at,pdf_sha256 FROM academy_certificate WHERE id=?').get(req.params.id);
    if(!record){const custom=ctx.management.verify(req.params.id);return custom?res.json({valid:custom.status==='issued',issuer:'ST1 Academy',...custom}):res.status(404).json({valid:false});}
    res.json({valid:true,track:bank.tracks.find(t=>t.id===record.track_id)?.name,version:record.version,issuedAt:record.issued_at,pdfSha256:record.pdf_sha256,testMode,issuer:'ST1 Academy'});
  });
  const reportFor=viewer=>{
    const attempts=db.prepare("SELECT a.id,a.user_id,a.track_id,a.status,a.finished_at,a.started_at,a.result_json,u.name,u.email FROM academy_attempt a JOIN user u ON u.id=a.user_id ORDER BY a.started_at DESC").all().filter(a=>ctx.game.squads.canInspect(viewer,a.user_id)&&hasTrack(viewer,a.track_id)).map(a=>({...a,result:a.result_json?JSON.parse(a.result_json):null,result_json:undefined}));
    const users=db.prepare('SELECT u.id,u.name,u.email,m.role FROM academy_member m JOIN user u ON u.id=m.user_id').all().filter(u=>ctx.game.squads.canInspect(viewer,u.id));
    const certificateRecords=db.prepare('SELECT c.id,c.user_id,c.track_id,c.version,c.score,c.issued_at,u.name,u.email FROM academy_certificate c JOIN user u ON u.id=c.user_id ORDER BY c.issued_at DESC').all().filter(c=>ctx.game.squads.canInspect(viewer,c.user_id)&&hasTrack(viewer,c.track_id));
    return {attempts,users,certificates:certificateRecords.length,certificateRecords,...(viewer.role==='admin'?{pendingIntegrations:db.prepare("SELECT count(*) n FROM academy_outbox WHERE status='pending'").get().n}:{}),st1SalesConnected:false};
  };
  app.get('/api/admin/report',member,admin,(req,res)=>res.json(reportFor(req.member)));
  app.get('/api/team/report',member,team,(req,res)=>res.json(reportFor(req.member)));
  app.get('/api/learning-nps/pending',member,agendaAction((req,res)=>res.json({item:ctx.learningNps.pending(req.member.user_id)})));
  app.post('/api/learning-nps/:id',member,agendaAction((req,res)=>res.json(ctx.learningNps.submit(req.member,req.params.id,req.body))));
  app.get('/api/learning-nps/report',member,admin,agendaAction((req,res)=>res.json(ctx.learningNps.report({period:req.query.period,track:req.query.track}))));
  app.get('/api/admin/access',member,admin,(_,res)=>res.json(access.directory()));
  const contentAction=action=>(req,res)=>{try{const work=()=>action(req,res);if(req.method==='GET'&&/^\/api\/(?:bootstrap|library|contents(?:\/|$)|reading(?:\/|$)|learning-flows(?:\/|$)|(?:game|progress)\/(?:me|knowledge)$)/.test(req.path))withLearningReadBatch(ctx,work);else if(req.method==='GET'&&db.withReadScope)db.withReadScope(work);else work();}catch(error){res.status(error.status||400).json({message:error.message});}};
  app.get('/api/bootstrap',member,contentAction((req,res)=>res.json({user:memberPayload(req.member),catalog:{title:bank.title,version:appVersion,minimumPercent:bank.minimumPercent,criticalRequired:bank.criticalRequired,testMode,environment:ctx.runtime.environment,totalTracks:bank.tracks.length,tracks:bank.tracks.filter(track=>hasTrack(req.member,track.id)).map(track=>trackSummary(track,hasPermission(req.member,'materials')))}})));
  app.get('/api/profile',member,contentAction((req,res)=>{const value=ctx.profiles.detail(req.member);res.json({...value,onboarding:onboarding.read(req.member.user_id),recognitions:ctx.management.recognitions(req.member,value.id)});}));
  app.get('/api/onboarding',member,(req,res)=>{const record=onboarding.read(req.member.user_id);res.json({choices:{...onboarding.choices,squads:db.prepare("SELECT name FROM academy_squad WHERE status='active' ORDER BY name").all().map(s=>s.name)},record,recommendations:onboarding.recommend(req.member,record)});});
  app.post('/api/onboarding',member,(req,res)=>{try{const record=onboarding.save(req.member.user_id,req.body);res.json({record,recommendations:onboarding.recommend(req.member,record)});}catch(error){res.status(400).json({message:error.message});}});
  app.get('/api/admin/onboarding',member,admin,(_,res)=>res.json({items:onboarding.adminList()}));
  app.get('/api/profiles',member,contentAction((req,res)=>res.json({items:ctx.profiles.peers(req.member)})));
  app.get('/api/profiles/:id',member,contentAction((req,res)=>{const value=ctx.profiles.detail(req.member,req.params.id);res.json({...value,recognitions:ctx.management.recognitions(req.member,value.id)});}));
  app.patch('/api/profile',member,contentAction((req,res)=>res.json(ctx.profiles.save(req.member,req.body))));
  app.patch('/api/profile/style',member,contentAction((req,res)=>res.json(ctx.profiles.saveStyle(req.member,req.body))));
  app.post('/api/profile/media/:kind',member,express.raw({type:'application/octet-stream',limit:'5mb'}),contentAction((req,res)=>res.status(201).json(ctx.profiles.upload(req.member,req.params.kind,Number(req.headers['x-profile-revision']),req.headers['x-file-name'],req.body))));
  app.delete('/api/profile/media/:kind',member,contentAction((req,res)=>res.json(ctx.profiles.removeMedia(req.member,req.params.kind,req.body.revision))));
  app.get('/api/profile-media/:id',member,contentAction((req,res)=>{const asset=ctx.profiles.media(req.member,req.params.id);res.type(asset.mime).setHeader('Content-Disposition',"inline; filename*=UTF-8''"+encodeURIComponent(asset.name));res.send(Buffer.from(asset.bytes));}));
  app.get('/api/admin/profile-rules',member,admin,contentAction((req,res)=>res.json(ctx.profiles.rules())));
  app.patch('/api/admin/profile-rules',member,admin,contentAction((req,res)=>res.json(ctx.profiles.setRules(req.member,req.body))));
  app.post('/api/profile/squad-request',member,contentAction((req,res)=>res.status(201).json(ctx.profiles.requests.request(req.member,req.body.squadId))));
  app.delete('/api/profile/squad-request/:id',member,contentAction((req,res)=>res.json(ctx.profiles.requests.cancel(req.member,req.params.id,req.body.revision))));
  app.get('/api/squad-requests',member,contentAction((req,res)=>res.json({items:ctx.profiles.requests.inbox(req.member)})));
  app.patch('/api/squad-requests/:id',member,contentAction((req,res)=>res.json(ctx.profiles.requests.decide(req.member,req.params.id,req.body))));
  app.post('/api/study',member,contentAction((req,res)=>{ctx.learningFlows.assertAccess(req.member,'material',req.body.contentId);res.status(201).json(ctx.study.start(req.member,req.body.contentId));}));
  app.post('/api/study/:id/heartbeat',member,contentAction((req,res)=>{const session=db.prepare('SELECT content_id FROM academy_study_session WHERE id=? AND user_id=?').get(req.params.id,req.member.user_id);if(session)ctx.learningFlows.assertAccess(req.member,'material',session.content_id);res.json(ctx.study.heartbeat(req.member,req.params.id));}));
  app.get(['/api/game/me','/api/progress/me'],member,contentAction((req,res)=>res.json(ctx.game.me(req.member))));
  app.get(['/api/game/knowledge','/api/progress/knowledge'],member,contentAction((req,res)=>res.json(ctx.game.knowledge(req.member,req.query.userId||req.member.user_id))));
  app.get('/api/learning-flows',member,contentAction((req,res)=>res.json(ctx.learningFlows.list(req.member,req.query.userId))));
  app.get('/api/learning-flows/:id',member,contentAction((req,res)=>res.json(ctx.learningFlows.get(req.member,req.params.id,req.query.userId))));
  app.get('/api/admin/learning-flows',member,admin,contentAction((req,res)=>res.json({items:ctx.learningFlows.adminList(req.member)})));
  app.get('/api/admin/learning-flows/choices',member,admin,contentAction((req,res)=>res.json(ctx.learningFlows.choices(req.member))));
  app.get('/api/admin/learning-flows/:id',member,admin,contentAction((req,res)=>res.json(ctx.learningFlows.adminGet(req.member,req.params.id))));
  app.post('/api/admin/learning-flows',member,admin,contentAction((req,res)=>res.status(201).json(ctx.learningFlows.save(req.member,null,req.body))));
  app.patch('/api/admin/learning-flows/:id',member,admin,contentAction((req,res)=>res.json(ctx.learningFlows.save(req.member,req.params.id,req.body))));
  app.delete('/api/admin/learning-flows/:id',member,admin,contentAction((req,res)=>res.json(ctx.learningFlows.save(req.member,req.params.id,{...ctx.learningFlows.adminGet(req.member,req.params.id),revision:req.body.revision,status:'archived'}))));
  const learningGate=(kind,id)=>((req,res,next)=>{try{const work=()=>{ctx.learningFlows.assertAccess(req.member,kind,id(req));next();};if(req.method==='GET')withLearningReadBatch(ctx,work);else work();}catch(error){res.status(error.status||400).json({message:error.message,flowId:error.flowId||null});}});
  app.use('/api/contents/:id',member,(req,res,next)=>req.path==='/cover'?next():learningGate('material',r=>r.params.id)(req,res,next));
  app.use('/api/quizzes/:id/start',member,learningGate('quiz',r=>r.params.id));
  app.use('/api/quiz-attempts/:id',member,(req,res,next)=>{const attempt=db.prepare('SELECT quiz_id,status FROM academy_quiz_attempt WHERE id=? AND user_id=?').get(req.params.id,req.member.user_id);if(!attempt||attempt.status!=='open')return next();learningGate('quiz',()=>attempt.quiz_id)(req,res,next);});
  app.get('/api/knowledge-map',member,contentAction((req,res)=>res.json(ctx.knowledgeMap.overview(req.member,req.query))));
  app.get('/api/knowledge-map/:kind/:id',member,contentAction((req,res)=>res.json(ctx.knowledgeMap.children(req.member,req.params.kind,req.params.id,req.query))));
  app.get(['/api/game/results','/api/progress/results'],member,contentAction((req,res)=>res.json(ctx.game.results(req.member,{period:req.query.period||'all',role:req.query.role||'seller'}))));
  app.get(['/api/admin/game/rules','/api/admin/progress/rules'],member,admin,contentAction((req,res)=>res.json(ctx.game.rules())));
  app.patch(['/api/admin/game/rules','/api/admin/progress/rules'],member,admin,contentAction((req,res)=>res.json(ctx.game.setRules(req.member.user_id,req.body))));
  app.get('/api/quizzes',member,contentAction((req,res)=>res.json({items:ctx.game.quizzes.list(req.member,req.query.type)})));
  app.get('/api/quizzes/:id',member,contentAction((req,res)=>res.json(ctx.game.quizzes.detail(req.member,req.params.id))));
  const learningNpsForQuiz=(req,value,before,attemptId=req.params.id)=>{
    if(before?.status!=='open'||value.status!=='complete')return;
    ctx.learningNps.queue({userId:req.member.user_id,sourceType:'quiz',sourceId:attemptId,sourceVersion:String(value.version),title:value.title,context:value.type==='checkpoint'?'Prova de etapa':'Prova relâmpago',trackIds:value.tracks});
  };
  app.post('/api/quizzes/:id/start',member,contentAction((req,res)=>{
    const previous=db.prepare("SELECT a.id FROM academy_quiz_attempt a JOIN academy_quiz q ON q.id=a.quiz_id WHERE a.user_id=? AND a.quiz_id=? AND a.version=q.version AND a.status='open' ORDER BY a.started_at DESC LIMIT 1").get(req.member.user_id,req.params.id);
    const value=ctx.game.quizzes.start(req.member,req.params.id);
    if(previous&&value.id===previous.id&&value.status==='complete')learningNpsForQuiz(req,value,{status:'open'},previous.id);
    res.status(value.status==='complete'?200:201).json(value);
  }));
  app.get('/api/quiz-attempts/:id',member,contentAction((req,res)=>{const before=db.prepare('SELECT status FROM academy_quiz_attempt WHERE id=? AND user_id=?').get(req.params.id,req.member.user_id);const value=ctx.game.quizzes.get(req.member,req.params.id);learningNpsForQuiz(req,value,before);res.json(value);}));
  app.put('/api/quiz-attempts/:id',member,contentAction((req,res)=>{const before=db.prepare('SELECT status FROM academy_quiz_attempt WHERE id=? AND user_id=?').get(req.params.id,req.member.user_id);const value=ctx.game.quizzes.update(req.member,req.params.id,req.body);learningNpsForQuiz(req,value,before);res.json(value);}));
  app.post('/api/quiz-attempts/:id/finish',member,contentAction((req,res)=>{const before=db.prepare('SELECT status FROM academy_quiz_attempt WHERE id=? AND user_id=?').get(req.params.id,req.member.user_id);const value=ctx.game.quizzes.update(req.member,req.params.id,req.body,true);learningNpsForQuiz(req,value,before);res.json(value);}));
  app.get('/api/admin/quizzes',member,admin,contentAction((req,res)=>res.json({items:ctx.game.quizzes.adminList()})));
  app.get('/api/admin/quizzes/pool',member,admin,contentAction((req,res)=>res.json({tracks:ctx.game.quizzes.pool()})));
  app.get('/api/admin/quizzes/:id',member,admin,contentAction((req,res)=>res.json(ctx.game.quizzes.adminDetail(req.params.id))));
  app.post('/api/admin/quizzes',member,admin,contentAction((req,res)=>res.status(201).json(ctx.game.quizzes.save(req.member.user_id,null,req.body))));
  app.patch('/api/admin/quizzes/:id',member,admin,contentAction((req,res)=>res.json(ctx.game.quizzes.save(req.member.user_id,req.params.id,req.body))));
  app.get('/api/squads',member,contentAction((req,res)=>res.json({items:ctx.game.squads.list(req.member).map(s=>({...s,members:s.members.map(p=>({...p,avatarUrl:ctx.profiles.avatar(req.member,p.id),canViewProfile:ctx.profiles.canRead(req.member,p.id)}))}))})));
  app.get('/api/squads/:id',member,contentAction((req,res)=>res.json(ctx.game.squads.detail(req.member,req.params.id))));
  app.get('/api/squads/:id/messages',member,contentAction((req,res)=>res.json((()=>{const value=ctx.game.squads.messages(req.member,req.params.id,Number(req.query.after||0));return {...value,items:value.items.map(m=>({...m,avatarUrl:m.userId?ctx.profiles.avatar(req.member,m.userId):null,canViewProfile:m.userId?ctx.profiles.canRead(req.member,m.userId):false}))};})())));
  app.post('/api/squads/:id/messages',member,contentAction((req,res)=>res.status(201).json(ctx.game.squads.post(req.member,req.params.id,req.body))));
  app.post('/api/squads/:id/messages/media',member,express.raw({type:'multipart/form-data',limit:'9mb'}),async(req,res)=>{
    try{
      ctx.game.squads.detail(req.member,req.params.id);
      if(!Buffer.isBuffer(req.body))throw Object.assign(new Error('Escolha uma foto ou um áudio.'),{status:400});
      const form=await new Response(req.body,{headers:{'Content-Type':req.headers['content-type']}}).formData();
      if([...form.keys()].some(k=>!['file','body','kind','duration'].includes(k))||['file','body','kind','duration'].some(k=>form.getAll(k).length>1))throw Object.assign(new Error('Arquivo inválido.'),{status:400});
      const file=form.get('file');if(!file||typeof file.arrayBuffer!=='function')throw Object.assign(new Error('Escolha uma foto ou um áudio.'),{status:400});
      const value=ctx.game.squads.postMedia(req.member,req.params.id,{name:file.name,mime:file.type,bytes:Buffer.from(await file.arrayBuffer()),body:form.get('body')??'',kind:form.get('kind'),duration:Number(form.get('duration')||0)});
      res.status(201).json(value);
    }catch(error){res.status(error.status||400).json({message:error.status?error.message:'Não foi possível ler o arquivo. Escolha uma foto ou um áudio válido.'});}
  });
  app.get('/api/chat-media/:id',member,contentAction((req,res)=>sendChatMedia(req,res,ctx.game.squads.media(req.member,req.params.id))));
  app.patch('/api/messages/:id',member,contentAction((req,res)=>res.json(ctx.game.squads.moderate(req.member,req.params.id,req.body.hidden))));
  app.post('/api/certificates/:id/share',member,contentAction((req,res)=>res.json(ctx.game.squads.share(req.member,req.params.id))));
  app.get('/api/notifications',member,contentAction((req,res)=>res.json(ctx.game.squads.notifications(req.member))));
  app.post('/api/notifications/:id/read',member,contentAction((req,res)=>res.json(ctx.game.squads.markRead(req.member,req.params.id))));
  app.get('/api/admin/squads',member,admin,contentAction((req,res)=>res.json({items:ctx.game.squads.list(req.member),people:access.directory().users})));
  app.post('/api/admin/squads',member,admin,contentAction((req,res)=>res.status(201).json(ctx.game.squads.save(req.member.user_id,null,req.body))));
  app.patch('/api/admin/squads/:id',member,admin,contentAction((req,res)=>res.json(ctx.game.squads.save(req.member.user_id,req.params.id,req.body))));
  app.get('/api/modules',member,contentAction((req,res)=>res.json({items:ctx.modules.visible(req.member)})));
  app.get('/api/admin/modules',member,admin,contentAction((req,res)=>res.json({items:ctx.modules.list()})));
  app.get('/api/admin/modules/:id',member,admin,contentAction((req,res)=>res.json(ctx.modules.detail(req.params.id))));
  app.post('/api/admin/modules',member,admin,contentAction((req,res)=>res.status(201).json(ctx.modules.create(req.member.user_id,req.body))));
  app.patch('/api/admin/modules/:id',member,admin,contentAction((req,res)=>res.json(ctx.modules.update(req.member.user_id,req.params.id,req.body))));
  app.get('/api/reading',member,contentAction((req,res)=>res.json({reading:ctx.readings.latest(req.member),recent:ctx.readings.recent(req.member)})));
  app.get('/api/contents/:id/progress',member,contentAction((req,res)=>res.json({reading:ctx.readings.detail(req.member,req.params.id)})));
  app.post('/api/contents/:id/progress',member,contentAction((req,res)=>res.json(ctx.readings.save(req.member,req.params.id,req.body))));
  app.post('/api/contents/:id/progress/dismiss',member,contentAction((req,res)=>res.json(ctx.readings.dismiss(req.member,req.params.id))));
  app.get('/api/contents/:id/study',member,contentAction((req,res)=>res.json(ctx.readings.detailStudy(req.member,req.params.id))));
  app.post('/api/contents/:id/study/start',member,contentAction((req,res)=>res.json(ctx.readings.start(req.member,req.params.id,req.body))));
  app.post('/api/contents/:id/study',member,contentAction((req,res)=>{const wasCompleted=ctx.readings.detailStudy(req.member,req.params.id).completed;const study=ctx.readings.complete(req.member,req.params.id,req.body);if(!wasCompleted&&study.completed){const item=ctx.contents.detail(req.member,req.params.id);ctx.learningNps.queue({userId:req.member.user_id,sourceType:'material',sourceId:item.id,sourceVersion:study.version+'@'+study.completedAt,title:item.title,context:'Conteúdo concluído',trackIds:item.tracks});}res.json(study);}));
  const libraryItems=viewer=>{const flags=ctx.learningFlows.materialFlags(viewer),visible=ctx.contents.visible(viewer),tags=ctx.management.tagsForMany('contents',visible.map(item=>item.id));return visible.map(item=>({...item,flow:flags.get(item.id)||null,study:ctx.readings.detailStudy(viewer,item.id),tags:tags.get(item.id)||[]}));};
  app.get('/api/contents',member,contentAction((req,res)=>res.json({items:libraryItems(req.member)})));
  app.get('/api/library',member,contentAction((req,res)=>res.json({items:libraryItems(req.member),modules:ctx.modules.visible(req.member),reading:ctx.readings.latest(req.member),recent:ctx.readings.recent(req.member)})));
  app.get('/api/saved-contents',member,contentAction((req,res)=>res.json(ctx.contentEngagement.saved(req.member))));
  app.get('/api/contents/:id',member,contentAction((req,res)=>{const item=ctx.contents.detail(req.member,req.params.id);res.json({...item,study:ctx.readings.forItem(req.member,item),tags:ctx.management.tagsFor('contents',req.params.id)});}));
  app.get('/api/contents/:id/engagement',member,contentAction((req,res)=>res.json(ctx.contentEngagement.detail(req.member,req.params.id))));
  app.put('/api/contents/:id/engagement/reaction',member,contentAction((req,res)=>res.json(ctx.contentEngagement.react(req.member,req.params.id,req.body.emoji))));
  app.put('/api/contents/:id/engagement/saved',member,contentAction((req,res)=>res.json(ctx.contentEngagement.save(req.member,req.params.id,req.body.saved))));
  app.post('/api/contents/:id/engagement/comments',member,contentAction((req,res)=>res.status(201).json(ctx.contentEngagement.comment(req.member,req.params.id,req.body.body))));
  app.delete('/api/contents/:id/engagement/comments/:commentId',member,contentAction((req,res)=>res.json(ctx.contentEngagement.removeComment(req.member,req.params.id,req.params.commentId))));
  app.get('/api/contents/:id/cover',member,contentAction((req,res)=>res.type('image/webp').send(ctx.contents.cover(req.member,req.params.id))));
  app.get('/api/contents/:id/file',member,contentAction((req,res)=>{
    const asset=ctx.contents.file(req.member,req.params.id);
    const bytes=Buffer.from(asset.bytes),size=bytes.length;
    res.type(asset.mime).set('Cache-Control','no-store').set('X-Content-Type-Options','nosniff').set('Accept-Ranges','bytes').setHeader('Content-Disposition',`${req.query.download==='1'?'attachment':'inline'}; filename*=UTF-8''${encodeURIComponent(asset.name)}`);
    if(asset.mime.startsWith('video/')&&req.headers.range&&req.query.download!=='1'){
      const range=/^bytes=(\d*)-(\d*)$/.exec(req.headers.range),start=range?(range[1]?Number(range[1]):size-Number(range[2])):NaN,end=range?(range[1]?(range[2]?Number(range[2]):size-1):size-1):NaN;
      if(!range||!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||start>=size||end<start)return res.status(416).set('Content-Range',`bytes */${size}`).end();
      const last=Math.min(end,size-1);return res.status(206).set('Content-Range',`bytes ${start}-${last}/${size}`).set('Content-Length',String(last-start+1)).send(bytes.subarray(start,last+1));
    }
    res.set('Content-Length',String(size)).send(bytes);
  }));
  app.get('/api/admin/contents',member,admin,contentAction((req,res)=>res.json({items:ctx.contents.list()})));
  app.get('/api/admin/contents/:id',member,admin,contentAction((req,res)=>res.json(ctx.contents.detail(req.member,req.params.id,true))));
  app.post('/api/admin/contents',member,admin,contentAction((req,res)=>res.status(201).json(ctx.contents.create(req.member.user_id,req.body))));
  app.patch('/api/admin/contents/:id',member,admin,contentAction((req,res)=>res.json(ctx.contents.update(req.member.user_id,req.params.id,req.body))));
  app.post('/api/admin/contents/:id/file',member,admin,express.raw({type:'application/octet-stream',limit:'40mb'}),contentAction((req,res)=>res.status(201).json(ctx.contents.upload(req.member.user_id,req.params.id,Number(req.headers['x-content-revision']),req.headers['x-file-name'],req.body))));
  app.post('/api/admin/invitations/validate',member,admin,async(req,res)=>{
    try{
      const items=await validateInvitationEmails(req.body?.emails);
      res.json({items:items.map((item,index)=>({...item,index}))});
    }catch(error){res.status(400).json({message:error.message});}
  });
  app.post('/api/admin/invitations',member,admin,async(req,res)=>{
    try{
      const emailCheck=(await validateInvitationEmails([req.body?.email]))[0];
      if(emailCheck.status==='invalid')throw new Error(emailCheck.message);
      const invitation=ctx.createInvitation({name:req.body.name,email:req.body.email,role:req.body.role??'seller',tracks:req.body.tracks,permissions:req.body.permissions,supervisorIds:req.body.supervisorIds,sellerIds:req.body.sellerIds,externalUserId:req.body.externalUserId,actorId:req.member.user_id});
      res.status(201).json(await deliverInvitation({...invitation,name:req.body.name,email:emailCheck.email,emailDomainStatus:emailCheck.status,emailDomainMessage:emailCheck.message}));
    }catch(error){res.status(400).json({message:error.message});}
  });
  app.post('/api/admin/invitations/bulk',member,admin,async(req,res)=>{
    try{
      const input=req.body?.items;
      if(!Array.isArray(input))throw new Error('Importe entre 1 e 100 pessoas por arquivo.');
      const emailChecks=await validateInvitationEmails(input.map(item=>item?.email));
      const invalidIndexes=emailChecks.map((item,index)=>item.status==='invalid'?index:-1).filter(index=>index>=0);
      if(invalidIndexes.length)throw new Error(`Corrija os endereços de e-mail nas linhas ${invalidIndexes.map(index=>Number.isSafeInteger(input[index]?.rowNumber)?input[index].rowNumber:index+2).join(', ')} antes de criar os convites.`);
      const invitations=ctx.createInvitations(input,req.member.user_id),items=[];
      for(let index=0;index<invitations.length;index+=5){
        const batch=invitations.slice(index,index+5);
        items.push(...await Promise.all(batch.map((invitation,offset)=>deliverInvitation({...invitation,emailDomainStatus:emailChecks[index+offset].status,emailDomainMessage:emailChecks[index+offset].message}))));
      }
      res.status(201).json({created:items.length,sent:items.filter(item=>item.delivery==='sent').length,notSent:items.filter(item=>item.delivery!=='sent').length,items});
    }catch(error){res.status(400).json({message:error.message});}
  });
  app.post('/api/admin/invitations/:id/resend',member,admin,async(req,res)=>{
    if(!invitationMailer)return res.status(503).json({message:'O envio de e-mail ainda não foi configurado no servidor.'});
    try{
      const current=db.prepare('SELECT email FROM academy_invitation WHERE id=? AND used_by IS NULL AND revoked_at IS NULL').get(req.params.id);
      if(!current)throw new Error('Convite indisponível para reenvio.');
      const emailCheck=(await validateInvitationEmails([current.email]))[0];
      if(emailCheck.status==='invalid')throw new Error(emailCheck.message);
      const invitation=ctx.renewInvitation(req.params.id,req.member.user_id);
      res.json(await deliverInvitation({...invitation,emailDomainStatus:emailCheck.status,emailDomainMessage:emailCheck.message}));
    }catch(error){res.status(400).json({message:error.message});}
  });
  app.get('/api/admin/campaigns',member,admin,(_,res)=>res.json(campaigns.list()));
  app.get('/api/admin/campaigns/automations',member,admin,(_,res)=>res.json(emailAutomations.list()));
  app.get('/api/admin/campaigns/automations/editorial',member,admin,(_,res)=>res.json(emailAutomations.editorialCatalog()));
  app.post('/api/admin/campaigns/automations/editorial',member,admin,(req,res)=>{try{res.status(201).json(emailAutomations.createEditorialEvent(req.member.user_id,req.body));}catch(error){res.status(400).json({message:error.message});}});
  app.get('/api/admin/campaigns/automations/feedback',member,admin,(_,res)=>res.json(emailAutomations.feedbackResults()));
  app.get('/api/admin/nps',member,admin,(req,res)=>{
    const email=emailAutomations.npsDashboard({period:req.query.period,track:req.query.track});
    const learning=ctx.learningNps.report({period:req.query.period,track:req.query.track});
    const distribution=email.distribution.map(item=>({...item,count:item.count+(learning.distribution.find(row=>row.score===item.score)?.count||0)}));
    const totals={responses:0,promoters:0,passives:0,detractors:0};
    for(const item of distribution){totals.responses+=item.count;if(item.score>=9)totals.promoters+=item.count;else if(item.score>=7)totals.passives+=item.count;else totals.detractors+=item.count;}
    const percentage=count=>totals.responses?Math.round(count/totals.responses*1000)/10:0;
    const trendMap=new Map([...email.trend,...learning.trend].map(item=>[item.month,{month:item.month,total:0,promoters:0,detractors:0}]));
    for(const source of [email.trend,learning.trend])for(const item of source){const target=trendMap.get(item.month);target.total+=item.total;target.promoters+=item.promoters;target.detractors+=item.detractors;}
    const trackMap=new Map();
    for(const item of [...email.trackBreakdown,...learning.trackBreakdown]){const target=trackMap.get(item.trackId)||{trackId:item.trackId,track:item.track,total:0,promoters:0,passives:0,detractors:0};target.total+=item.total;target.promoters+=item.promoters;target.passives+=item.passives;target.detractors+=item.detractors;trackMap.set(item.trackId,target);}
    const trackBreakdown=[...trackMap.values()].map(item=>({...item,nps:Math.round((item.promoters-item.detractors)/item.total*100)})).sort((a,b)=>b.total-a.total);
    const trackOptions=[...new Map([...email.trackOptions,...learning.trackOptions].map(item=>[item.id,item])).values()].sort((a,b)=>a.title.localeCompare(b.title,'pt-BR'));
    const responseRate=email.summary.responseRate;
    res.json({...email,summary:{...email.summary,...totals,nps:totals.responses?Math.round((totals.promoters-totals.detractors)/totals.responses*100):null,promotersPct:percentage(totals.promoters),passivesPct:percentage(totals.passives),detractorsPct:percentage(totals.detractors),responseRate},distribution,trend:[...trendMap.values()].map(item=>({...item,nps:Math.round((item.promoters-item.detractors)/item.total*100)})).sort((a,b)=>a.month.localeCompare(b.month)),trackOptions,trackBreakdown,totalResponsesEver:email.totalResponsesEver+learning.totalResponsesEver,sources:{email:email.summary.responses,learning:learning.summary.total},learningFeedback:learning});
  });
  app.post('/api/admin/campaigns/automations/enable-available',member,admin,(req,res)=>{try{res.json(emailAutomations.activateAvailable());}catch(error){res.status(400).json({message:error.message});}});
  app.put('/api/admin/campaigns/automations/:key',member,admin,(req,res)=>{try{res.json(emailAutomations.save(req.member.user_id,req.params.key,req.body));}catch(error){res.status(400).json({message:error.message});}});
  app.delete('/api/admin/campaigns/automations/:key',member,admin,(req,res)=>{try{res.json(emailAutomations.restore(req.params.key));}catch(error){res.status(400).json({message:error.message});}});
  app.post('/api/admin/campaigns/automations/:key/enable',member,admin,(req,res)=>{try{res.json(emailAutomations.activate(req.params.key));}catch(error){res.status(400).json({message:error.message});}});
  app.post('/api/admin/campaigns/automations/:key/pause',member,admin,(req,res)=>{try{res.json(emailAutomations.pause(req.params.key));}catch(error){res.status(400).json({message:error.message});}});
  app.post('/api/admin/campaigns',member,admin,(req,res)=>{try{res.status(201).json(campaigns.create(req.member.user_id,req.body));}catch(error){res.status(400).json({message:error.message});}});
  app.patch('/api/admin/campaigns/:id',member,admin,(req,res)=>{try{res.json(campaigns.update(req.member.user_id,req.params.id,req.body));}catch(error){res.status(400).json({message:error.message});}});
  app.delete('/api/admin/campaigns/:id',member,admin,(req,res)=>{try{campaigns.remove(req.params.id);res.json({ok:true});}catch(error){res.status(400).json({message:error.message});}});
  app.post('/api/admin/campaigns/:id/schedule',member,admin,(req,res)=>{try{res.json(campaigns.schedule(req.params.id,req.body.scheduledAt));}catch(error){res.status(400).json({message:error.message});}});
  app.post('/api/admin/campaigns/:id/cancel-schedule',member,admin,(req,res)=>{try{res.json(campaigns.cancelSchedule(req.params.id));}catch(error){res.status(400).json({message:error.message});}});
  app.post('/api/admin/campaigns/:id/send',member,admin,async(req,res)=>{try{res.json(await campaigns.send(req.params.id));}catch(error){res.status(400).json({message:error.message});}});
  app.get('/api/admin/whatsapp-campaigns',member,admin,(_,res)=>res.json(whatsappCampaigns.list()));
  app.get('/api/admin/whatsapp-automations',member,admin,(_,res)=>res.json(whatsappAutomations.list()));
  app.get('/api/admin/whatsapp-templates',member,admin,(_,res)=>res.json(whatsappTemplates.list()));
  app.post('/api/admin/whatsapp-templates/sync',member,admin,async(_,res)=>{try{res.json(await whatsappTemplates.sync());}catch(error){res.status(400).json({message:error.message});}});
  app.post('/api/admin/whatsapp-templates',member,admin,(req,res)=>{try{res.status(201).json(whatsappTemplates.saveDraft(req.member.user_id,req.body));}catch(error){res.status(400).json({message:error.message});}});
  app.patch('/api/admin/whatsapp-templates/:id',member,admin,(req,res)=>{try{res.json(whatsappTemplates.saveDraft(req.member.user_id,req.body,req.params.id));}catch(error){res.status(400).json({message:error.message});}});
  app.post('/api/admin/whatsapp-templates/:id/submit',member,admin,async(req,res)=>{try{res.json(await whatsappTemplates.submit(req.params.id));}catch(error){res.status(400).json({message:error.message});}});
  app.get('/api/admin/whatsapp-automations/templates',member,admin,async(_,res)=>{try{res.json(await whatsappAutomations.approvedTemplates());}catch(error){res.status(400).json({message:error.message});}});
  app.put('/api/admin/whatsapp-automations/:key',member,admin,(req,res)=>{try{res.json(whatsappAutomations.save(req.params.key,req.body));}catch(error){res.status(400).json({message:error.message});}});
  app.post('/api/admin/whatsapp-automations/activate-approved',member,admin,async(_,res)=>{try{res.json(await whatsappAutomations.activateApproved());}catch(error){res.status(400).json({message:error.message});}});
  app.post('/api/admin/whatsapp-automations/:key/enable',member,admin,async(req,res)=>{try{res.json(await whatsappAutomations.activate(req.params.key));}catch(error){res.status(400).json({message:error.message});}});
  app.post('/api/admin/whatsapp-automations/:key/pause',member,admin,(req,res)=>{try{res.json(whatsappAutomations.pause(req.params.key));}catch(error){res.status(400).json({message:error.message});}});
  app.get('/api/admin/integrations',member,admin,(_,res)=>res.json(integrations.list()));
  app.put('/api/admin/integrations/:type',member,admin,(req,res)=>{try{res.json(integrations.save(req.member.user_id,req.params.type,req.body));}catch(error){res.status(400).json({message:error.message});}});
  app.post('/api/admin/integrations/webhooks',member,admin,(req,res)=>{try{res.status(201).json(integrations.addWebhook(req.member.user_id,req.body));}catch(error){res.status(400).json({message:error.message});}});
  app.delete('/api/admin/integrations/webhooks/:id',member,admin,(req,res)=>{try{integrations.removeWebhook(req.params.id);res.sendStatus(204);}catch(error){res.status(400).json({message:error.message});}});
  app.post('/api/admin/integrations/custom',member,admin,(req,res)=>{try{res.status(201).json(integrations.addCustom(req.member.user_id,req.body));}catch(error){res.status(400).json({message:error.message});}});
  app.delete('/api/admin/integrations/custom/:id',member,admin,(req,res)=>{try{integrations.removeCustom(req.params.id);res.sendStatus(204);}catch(error){res.status(400).json({message:error.message});}});
  app.post('/api/admin/whatsapp-campaigns',member,admin,(req,res)=>{try{res.status(201).json(whatsappCampaigns.create(req.member.user_id,req.body));}catch(error){res.status(400).json({message:error.message});}});
  app.patch('/api/admin/whatsapp-campaigns/:id',member,admin,(req,res)=>{try{res.json(whatsappCampaigns.update(req.member.user_id,req.params.id,req.body));}catch(error){res.status(400).json({message:error.message});}});
  app.delete('/api/admin/whatsapp-campaigns/:id',member,admin,(req,res)=>{try{whatsappCampaigns.remove(req.params.id);res.json({ok:true});}catch(error){res.status(400).json({message:error.message});}});
  app.post('/api/admin/whatsapp-campaigns/consent/:userId',member,admin,(req,res)=>{try{res.json(whatsappCampaigns.consent(req.member.user_id,req.params.userId,req.body));}catch(error){res.status(400).json({message:error.message});}});
  app.post('/api/admin/whatsapp-campaigns/:id/schedule',member,admin,(req,res)=>{try{res.json(whatsappCampaigns.schedule(req.params.id,req.body.scheduledAt));}catch(error){res.status(400).json({message:error.message});}});
  app.post('/api/admin/whatsapp-campaigns/:id/cancel-schedule',member,admin,(req,res)=>{try{res.json(whatsappCampaigns.cancelSchedule(req.params.id));}catch(error){res.status(400).json({message:error.message});}});
  app.post('/api/admin/whatsapp-campaigns/:id/send',member,admin,async(req,res)=>{try{res.json(await whatsappCampaigns.send(req.params.id));}catch(error){res.status(400).json({message:error.message});}});
  app.locals.runDueCampaigns=campaigns.runDue;
  app.locals.runEmailAutomations=emailAutomations.tick;
  app.locals.runDueWhatsAppCampaigns=whatsappCampaigns.runDue;
  app.locals.runWhatsAppAutomations=whatsappAutomations.tick;
  app.post('/api/admin/members/bulk-status',member,admin,(req,res)=>{
    try{res.json(access.setMembersEnabled(req.member.user_id,req.body?.userIds,req.body?.enabled));}catch(error){res.status(400).json({message:error.message});}
  });
  app.post('/api/admin/members/bulk-access',member,admin,(req,res)=>{
    try{res.json(access.adjustMembersAccess(req.member.user_id,req.body?.userIds,req.body));}catch(error){res.status(400).json({message:error.message});}
  });
  app.patch('/api/admin/members/:id',member,admin,(req,res)=>{
    try{res.json(access.updateMember(req.member.user_id,req.params.id,req.body));}catch(error){res.status(400).json({message:error.message});}
  });
  app.post('/api/admin/invitations/bulk-revoke',member,admin,(req,res)=>{
    try{res.json(access.revokeInvitations(req.member.user_id,req.body?.invitationIds));}catch(error){res.status(400).json({message:error.message});}
  });
  app.patch('/api/admin/invitations/:id',member,admin,(req,res)=>{
    try{res.json(access.updateInvitation(req.member.user_id,req.params.id,req.body));}catch(error){res.status(400).json({message:error.message});}
  });
  app.post('/api/admin/invitations/:id/revoke',member,admin,(req,res)=>{
    try{res.json(access.revokeInvitation(req.member.user_id,req.params.id));}catch(error){res.status(400).json({message:error.message});}
  });
  const reportCsv=(req,res)=>{
    const safe=value=>{let text=String(value??'');if(/^[=+@\-\t\r]/.test(text))text="'"+text;return '"'+text.replaceAll('"','""')+'"';};
    const rows=reportFor(req.member).attempts.filter(a=>a.status==='complete');
    const header=['Vendedor','E-mail','Trilha','Nota (%)','Acertos','Total','Regras críticas erradas','Resultado','Conclusão'];
    const csv=[header,...rows.map(row=>{const result=row.result;return [row.name,row.email,row.track_id,result.score,result.correct,result.total,result.failedCritical,result.approved?'Aprovado':'Revisar e tentar novamente',row.finished_at];})].map(row=>row.map(safe).join(';')).join('\r\n');
    res.type('text/csv; charset=utf-8').setHeader('Content-Disposition','attachment; filename="ST1-Resultados-Academia.csv"');res.send('\uFEFF'+csv);
  };
  app.get('/api/admin/report.csv',member,admin,reportCsv);
  app.get('/api/team/report.csv',member,team,reportCsv);
  app.get('/esqueci-senha',(_,res)=>res.setHeader('Cache-Control','no-store').sendFile(resolve(projectRoot,'public/forgot-password.html')));
  app.get('/redefinir-senha',(_,res)=>res.setHeader('Cache-Control','no-store').sendFile(resolve(projectRoot,'public/reset-password.html')));
  app.get('/login',(_,res)=>res.setHeader('Cache-Control','no-store').sendFile(resolve(projectRoot,'public/login.html')));
  app.get('/login.html',(req,res)=>res.redirect(302,'/login'+(req.url.includes('?')?req.url.slice(req.url.indexOf('?')):'')));
  app.get(['/','/index.html'],async(req,res)=>{
    res.setHeader('Cache-Control','no-store');
    if(typeof req.query.convite==='string')return res.redirect(302,'/login?convite='+encodeURIComponent(req.query.convite));
    const session=await auth.api.getSession({headers:fromNodeHeaders(req.headers)});
    const profile=session?readProfile(db,session.user.id):null;
    if(!profile||profile.enabled!==1)return res.redirect(302,'/login');
    res.sendFile(resolve(projectRoot,'public/index.html'));
  });
  app.use(express.static(resolve(projectRoot,'public'),{index:'index.html',maxAge:0}));
  app.use((error,req,res,next)=>{console.error('Falha na ST1 Academy:',error.message);if(!res.headersSent)res.status(error.status===413?413:500).json({message:error.status===413?'O arquivo ou conteúdo ultrapassa o limite permitido. Arquivos podem ter até 25 MB; vídeos MP4/WebM, até 40 MB.':'Não foi possível concluir. Suas respostas salvas continuam disponíveis.'});});
  return {app,ctx};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  const runtime=hostingConfig({},process.env,projectRoot);
  if(runtime.production&&runtime.storage==='sqlite')applyStagedProduction(runtime.dataDir);
  const {app,ctx}=await createApp();
  const backups=runtime.storage==='sqlite'?createBackupService(ctx):{start(){},stop(){},drain:()=>Promise.resolve()};
  const server=app.listen(runtime.port,runtime.host,()=>{
    ctx.googleCalendar.start();if(runtime.production)backups.start();
    app.locals.runDueCampaigns().catch(error=>console.error('Falha ao verificar campanhas agendadas:',error.message));
    app.locals.runEmailAutomations().catch(error=>console.error('Falha ao verificar automações de e-mail:',error.message));
    app.locals.runDueWhatsAppCampaigns().catch(error=>console.error('Falha ao verificar campanhas WhatsApp agendadas:',error.message));
    app.locals.runWhatsAppAutomations().catch(error=>console.error('Falha ao verificar automações WhatsApp:',error.message));
    console.log(`ST1 Academy disponível em ${ctx.baseURL}`);
  });
  const campaignTimer=setInterval(()=>{app.locals.runDueCampaigns().catch(error=>console.error('Falha ao verificar campanhas agendadas:',error.message));app.locals.runEmailAutomations().catch(error=>console.error('Falha ao verificar automações de e-mail:',error.message));app.locals.runDueWhatsAppCampaigns().catch(error=>console.error('Falha ao verificar campanhas WhatsApp agendadas:',error.message));app.locals.runWhatsAppAutomations().catch(error=>console.error('Falha ao verificar automações WhatsApp:',error.message));},30000);campaignTimer.unref();
  let stopping=false;
  const stop=()=>{
    if(stopping)return;stopping=true;app.locals.shuttingDown=true;clearInterval(campaignTimer);ctx.googleCalendar.stop();backups.stop();
    const forced=setTimeout(()=>process.exit(1),25000);forced.unref();
    server.close(async()=>{await Promise.allSettled([ctx.googleCalendar.drain(),backups.drain()]);ctx.db.close();clearTimeout(forced);process.exit(0);});
    server.closeIdleConnections();
  };
  process.on('SIGTERM',stop);process.on('SIGINT',stop);
}

