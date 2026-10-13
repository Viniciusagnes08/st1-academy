import {createHash,randomUUID} from 'node:crypto';
import {readProfile} from './access.mjs';

export const GOOGLE_CALENDAR_SCOPE='https://www.googleapis.com/auth/calendar.app.created';
export const googleConfigFromEnv=()=>({clientId:process.env.GOOGLE_CLIENT_ID||'',clientSecret:process.env.GOOGLE_CLIENT_SECRET||''});
export const googleConfigured=config=>!!config.clientId&&!!config.clientSecret;
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
const fingerprint=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');

export function createGoogleCalendarService(db,auth,agenda,access,{config=googleConfigFromEnv(),clock=Date.now,fetcher=fetch,tokenProvider}={}){
  let timer=null;const running=new Map();
  const account=id=>db.prepare("SELECT id,scope FROM account WHERE userId=? AND providerId='google'").get(id);
  const connection=id=>db.prepare('SELECT * FROM academy_calendar_connection WHERE user_id=?').get(id);
  const status=viewer=>{const c=connection(viewer.user_id),a=account(viewer.user_id);return {configured:googleConfigured(config),linked:!!a,calendarAuthorized:!!a?.scope?.split(/[ ,]+/).includes(GOOGLE_CALENDAR_SCOPE),state:c?.status||'disconnected',lastSync:c?.last_sync||null,lastError:c?.last_error||null,calendarUrl:c?.calendar_id?'https://calendar.google.com/calendar/u/0/r':null};};
  const token=async id=>{
    if(tokenProvider)return tokenProvider(id);
    const a=account(id);if(!a||!a.scope?.split(/[ ,]+/).includes(GOOGLE_CALENDAR_SCOPE))throw fail('Autorize a agenda ST1 pelo Google para sincronizar.',401);
    const value=await auth.api.getAccessToken({body:{accountId:a.id,userId:id}});
    if(!value.accessToken)throw fail('Reconecte sua conta Google.',401);
    return value.accessToken;
  };
  const call=async(id,path,{method='GET',body,etag}={})=>{
    const accessToken=await token(id);
    let response;try{response=await fetcher('https://www.googleapis.com/calendar/v3'+path,{method,headers:{Authorization:'Bearer '+accessToken,...(etag?{'If-Match':etag}:{}),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(20000)});}catch{throw fail('Não foi possível alcançar o Google. A agenda interna permanece salva.',503);}
    if(!response.ok){const code=response.status;throw fail(code===401?'Reconecte sua conta Google.':code===403?'Confira a autorização do Google Calendar.':code===429?'O Google limitou as solicitações. A sincronização será tentada novamente.':'O Google não concluiu a sincronização. Tente novamente.',code);}
    return response.status===204?{}:response.json();
  };
  const markError=(id,error)=>{db.prepare("UPDATE academy_calendar_connection SET status=?,last_error=? WHERE user_id=?").run([401,403].includes(error.status)?'needs_reconnect':'error',error.message,id);};
  const connect=async viewer=>{
    if(!googleConfigured(config))throw fail('A gestão ainda precisa ativar a conexão com o Google.',503);
    if(!tokenProvider&&!status(viewer).calendarAuthorized)throw fail('Autorize a agenda ST1 pelo Google para sincronizar.',403);
    let c=connection(viewer.user_id);
    if(!c)db.prepare("INSERT INTO academy_calendar_connection(user_id,status,connected_at) VALUES(?,'connecting',?)").run(viewer.user_id,new Date(clock()).toISOString());
    try{
      if(!c?.calendar_id){
        const calendar=await call(viewer.user_id,'/calendars',{method:'POST',body:{summary:'ST1 Academy · Minha evolução',description:'Compromissos e entregas da ST1 Academy. A agenda pessoal permanece separada.',timeZone:'America/Fortaleza'}});
        if(typeof calendar.id!=='string'||!calendar.id)throw fail('O Google não confirmou a criação da agenda.',502);
        db.prepare("UPDATE academy_calendar_connection SET calendar_id=?,status='connected',last_error=NULL,sync_token=NULL WHERE user_id=?").run(calendar.id,viewer.user_id);
      }else db.prepare("UPDATE academy_calendar_connection SET status='connected',last_error=NULL WHERE user_id=?").run(viewer.user_id);
      await sync(viewer.user_id);return status(viewer);
    }catch(e){markError(viewer.user_id,e);throw e;}
  };
  const eventBody=(item,userId)=>{
    const personal=item.kind==='task',p=personal?db.prepare('SELECT * FROM academy_agenda_assignment WHERE item_id=? AND user_id=?').get(item.id,userId):null;
    const start=personal?new Date(Date.parse(item.due_at)-900000).toISOString():item.start_at,end=personal?item.due_at:item.end_at;
    const link=new URL('/#agenda/'+item.id,config.baseURL||'http://localhost:4175').href;
    const body={summary:(personal?(p?.progress==='accepted'?'✓ Entrega validada · ':'Tarefa · '):'Treinamento · ')+item.title,status:item.status==='active'?'confirmed':'cancelled',description:item.description+'\n\n'+(personal?'Preencha e acompanhe a validação na Academy.':'Confirme o convite. A presença é conferida pela gestão na Academy.')+'\n'+link,location:item.meeting_url||item.location,start:{dateTime:start,timeZone:'America/Fortaleza'},end:{dateTime:end,timeZone:'America/Fortaleza'},visibility:'private',extendedProperties:{private:{st1AcademyItem:item.id,st1AcademyKind:item.kind}},reminders:{useDefault:false,overrides:[{method:'popup',minutes:15},{method:'email',minutes:1440}]}};
    if(!personal){body.attendees=agenda.members(item).filter(a=>a.active&&agenda.eligible(item,readProfile(db,a.user_id))).map(a=>({email:a.email,responseStatus:({confirmed:'accepted',declined:'declined',tentative:'tentative'})[a.rsvp]||'needsAction'}));body.guestsCanInviteOthers=false;body.guestsCanModify=false;body.guestsCanSeeOtherGuests=false;}
    return body;
  };
  const pull=async(id,c)=>{
    let pageToken,finalSyncToken,restarted=false;const base='/calendars/'+encodeURIComponent(c.calendar_id)+'/events';
    const records=[];for(;;){
      const params=new URLSearchParams({maxResults:'250',showDeleted:'true'});if(c.sync_token)params.set('syncToken',c.sync_token);if(pageToken)params.set('pageToken',pageToken);
      let value;try{value=await call(id,base+'?'+params);}catch(e){if(e.status===410&&!restarted){c.sync_token=null;pageToken=null;records.length=0;restarted=true;continue;}throw e;}
      if(!Array.isArray(value.items))throw fail('Resposta incompleta do Google. A sincronização será repetida.',502);
      records.push(...value.items);pageToken=value.nextPageToken;finalSyncToken=value.nextSyncToken;if(records.length>20000)throw fail('A agenda é muito grande para uma atualização. Procure a gestão.',503);if(!pageToken)break;
    }
    for(const event of records){
      const mirror=db.prepare('SELECT * FROM academy_calendar_mirror WHERE user_id=? AND event_id=?').get(id,event.id);if(!mirror)continue;
      const item=agenda.row(mirror.item_id);if(!item)continue;
      if(event.etag&&event.etag===mirror.etag)continue;
      if(item.kind==='training'&&item.creator_id===id){
        const normalized={...event,summary:event.summary?.replace(/^Treinamento · /,'')};
        try{agenda.importMeeting(item.id,normalized);}catch{db.prepare("UPDATE academy_calendar_mirror SET status='error',last_error='A alteração do Google precisa ser corrigida na Academy.' WHERE item_id=? AND user_id=?").run(item.id,id);continue;}
        const current=agenda.row(item.id);db.prepare('UPDATE academy_calendar_mirror SET etag=?,desired_hash=? WHERE item_id=? AND user_id=?').run(event.etag||null,fingerprint(eventBody(current,id)),item.id,id);
      }else if(event.status==='cancelled'){
        db.prepare("UPDATE academy_calendar_mirror SET status='external_removed',etag=?,desired_hash=NULL WHERE item_id=? AND user_id=?").run(event.etag||null,item.id,id);
      }else if(event.etag!==mirror.etag)db.prepare('UPDATE academy_calendar_mirror SET desired_hash=NULL,etag=? WHERE item_id=? AND user_id=?').run(event.etag||null,item.id,id);
    }
    if(finalSyncToken)db.prepare('UPDATE academy_calendar_connection SET sync_token=? WHERE user_id=?').run(finalSyncToken,id);
  };
  const push=async(id,c)=>{
    const items=db.prepare('SELECT * FROM academy_agenda_item ORDER BY created_at').all().filter(i=>i.kind==='training'?i.creator_id===id:!!db.prepare('SELECT 1 FROM academy_agenda_assignment WHERE item_id=? AND user_id=?').get(i.id,id));
    for(const item of items){
      let mirror=db.prepare('SELECT * FROM academy_calendar_mirror WHERE item_id=? AND user_id=?').get(item.id,id);
      const own=db.prepare('SELECT active FROM academy_agenda_assignment WHERE item_id=? AND user_id=?').get(item.id,id),cancelled=item.status==='cancelled'||item.kind==='task'&&(!own?.active||!agenda.eligible(item,readProfile(db,id)));
      if(cancelled){
        if(mirror&&mirror.status!=='cancelled'){let saved;try{saved=await call(id,'/calendars/'+encodeURIComponent(c.calendar_id)+'/events/'+mirror.event_id+'?sendUpdates=all',{method:'PATCH',body:{status:'cancelled'}});}catch(e){if(![404,410].includes(e.status))throw e;}db.prepare("UPDATE academy_calendar_mirror SET status='cancelled',etag=?,desired_hash=? WHERE item_id=? AND user_id=?").run(saved?.etag||mirror.etag,fingerprint({...eventBody(item,id),status:'cancelled'}),item.id,id);}continue;
      }
      if(mirror?.status==='external_removed')continue;
      const body=eventBody(item,id),hash=fingerprint(body);if(mirror?.status==='synced'&&mirror.desired_hash===hash)continue;
      const newEvent=!mirror,eventId=mirror?.event_id||'st1'+fingerprint([id,item.id]).slice(0,48);
      if(!mirror){db.prepare("INSERT INTO academy_calendar_mirror(item_id,user_id,event_id,status) VALUES(?,?,?,'pending')").run(item.id,id,eventId);mirror={event_id:eventId};}
      let saved;
      try{
        if(newEvent||['pending','error'].includes(mirror.status)){
          try{saved=await call(id,'/calendars/'+encodeURIComponent(c.calendar_id)+'/events?sendUpdates=all',{method:'POST',body:{...body,id:eventId}});}
          catch(e){if(e.status!==409)throw e;saved=await call(id,'/calendars/'+encodeURIComponent(c.calendar_id)+'/events/'+eventId+'?sendUpdates=all',{method:'PATCH',body,etag:mirror.etag});}
        }else saved=await call(id,'/calendars/'+encodeURIComponent(c.calendar_id)+'/events/'+eventId+'?sendUpdates=all',{method:'PATCH',body,etag:mirror.etag});
        if(saved.id!==eventId||!saved.etag)throw fail('O Google não confirmou o evento. A sincronização será repetida.',502);
        db.prepare("UPDATE academy_calendar_mirror SET desired_hash=?,etag=?,status='synced',html_url=?,last_error=NULL WHERE item_id=? AND user_id=?").run(hash,saved.etag,saved.htmlLink?.startsWith('https://calendar.google.com/')?saved.htmlLink:null,item.id,id);
      }catch(e){db.prepare("UPDATE academy_calendar_mirror SET status='error',last_error=? WHERE item_id=? AND user_id=?").run(e.message,item.id,id);throw e;}
    }
  };
  async function sync(id,{restore=false}={}){
    if(!googleConfigured(config))throw fail('A gestão ainda precisa ativar a conexão com o Google.',503);
    if(running.has(id))return running.get(id);
    const promise=(async()=>{
      const viewer=readProfile(db,id),c=connection(id);if(viewer?.enabled!==1||!c?.calendar_id||c.status==='paused'||c.status==='needs_reconnect')throw fail('Conecte sua agenda Google para sincronizar.',409);
      try{
        agenda.remind();await pull(id,c);
        if(restore)for(const m of db.prepare("SELECT * FROM academy_calendar_mirror WHERE user_id=? AND status='external_removed'").all(id))db.prepare("UPDATE academy_calendar_mirror SET event_id=?,status='pending',etag=NULL,desired_hash=NULL WHERE item_id=? AND user_id=?").run('st1'+randomUUID().replaceAll('-',''),m.item_id,id);
        await push(id,c);db.prepare("UPDATE academy_calendar_connection SET status='connected',last_sync=?,last_error=NULL WHERE user_id=?").run(new Date(clock()).toISOString(),id);
        return status(viewer);
      }catch(e){markError(id,e);throw e;}
    })();running.set(id,promise);try{return await promise;}finally{running.delete(id);}
  }
  const pause=viewer=>{db.prepare("UPDATE academy_calendar_connection SET status='paused' WHERE user_id=?").run(viewer.user_id);access.audit(viewer.user_id,viewer.user_id,'calendar.paused',null,{paused:true});return status(viewer);};
  const tick=async()=>{
    agenda.remind();if(!googleConfigured(config))return {configured:false,synchronized:0,failed:0};
    const users=db.prepare("SELECT c.user_id FROM academy_calendar_connection c JOIN academy_member m ON m.user_id=c.user_id WHERE m.enabled=1 AND c.calendar_id IS NOT NULL AND c.status IN ('connected','error')").all();let synchronized=0,failed=0;
    for(const u of users)try{await sync(u.user_id);synchronized++;}catch{failed++;}
    return {configured:true,synchronized,failed};
  };
  const start=()=>{if(timer)return;timer=setInterval(()=>void tick().catch(()=>{}),60000);timer.unref();void tick().catch(()=>{});};
  const stop=()=>{clearInterval(timer);timer=null;};
  return {status,connect,sync,pause,tick,start,stop,eventBody,drain:()=>Promise.allSettled([...running.values()])};
}
