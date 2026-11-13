import {randomBytes} from 'node:crypto';

const emailRe=/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const secretRe=/(?:token|secret|password|senha|authorization|cookie)=([^\s&]+)/gi;
const redact=value=>String(value??'').replace(emailRe,'[REDACTED_EMAIL]').replace(secretRe,match=>match.split('=')[0]+'=[REDACTED]');
const safePath=value=>{try{return new URL(String(value||'/'),'https://academy.invalid').pathname.slice(0,500);}catch{return '/';}};

function parseDsn(dsn,{allowHttpForTests=false}={}){
  let url;try{url=new URL(dsn);}catch{return null;}
  if(!['https:',...(allowHttpForTests?['http:']:[])].includes(url.protocol)||!url.username)return null;
  const parts=url.pathname.split('/').filter(Boolean);const projectId=parts.pop();if(!projectId)return null;
  const prefix=parts.length?'/'+parts.join('/'):'';
  return {endpoint:`${url.protocol}//${url.host}${prefix}/api/${encodeURIComponent(projectId)}/envelope/`,key:url.username,secret:url.password||'',publicDsn:`${url.protocol}//${url.username}@${url.host}${prefix}/${projectId}`};
}

export function createGlitchTipIntegration({dsn,release='unknown',environment='production',timeoutMs=1500,fetcher=fetch,allowHttpForTests=false}={}){
  const config=parseDsn(dsn,{allowHttpForTests});
  const ready=()=>Boolean(config);
  async function capture(error,context={}){
    if(!config)return false;
    const eventId=randomBytes(16).toString('hex'),createdAt=new Date().toISOString();
    const message=redact(error?.message||error||'Unhandled error').slice(0,1000);
    const envelopeHeader={event_id:eventId,dsn:config.publicDsn,sdk:{name:'st1-academy.native',version:'1'}};
    const event={event_id:eventId,timestamp:createdAt,platform:'node',level:'error',environment:String(environment).slice(0,80),release:String(release).slice(0,120),exception:{values:[{type:redact(error?.name||'Error').slice(0,120),value:message}]},request:{method:String(context.method||'UNKNOWN').slice(0,12),url:safePath(context.path)},tags:{status_code:String(context.statusCode||500)}};
    const body=JSON.stringify(envelopeHeader)+'\n'+JSON.stringify({type:'event'})+'\n'+JSON.stringify(event);
    const auth=`Sentry sentry_version=7, sentry_key=${config.key}${config.secret?`, sentry_secret=${config.secret}`:''}`;
    try{const response=await fetcher(config.endpoint,{method:'POST',headers:{'content-type':'application/x-sentry-envelope','x-sentry-auth':auth},body,signal:AbortSignal.timeout(timeoutMs)});return response.ok;}catch{return false;}
  }
  return {ready,capture};
}
