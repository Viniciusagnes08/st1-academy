import {createHmac} from 'node:crypto';

const blocked=/^(email|phone|name|firstName|lastName|cpf|rg|address|endereco|password|senha|token|cookie|authorization|secret)$/i;
function clean(value,depth=0){
  if(depth>3)return undefined;
  if(Array.isArray(value))return value.slice(0,20).map(item=>clean(item,depth+1)).filter(item=>item!==undefined);
  if(value&&typeof value==='object'){
    const result={};for(const [key,item] of Object.entries(value)){if(blocked.test(key))continue;const safe=clean(item,depth+1);if(safe!==undefined)result[key]=safe;}return result;
  }
  if(['string','number','boolean'].includes(typeof value)||value===null)return typeof value==='string'?value.slice(0,500):value;
  return undefined;
}
const pseudonym=(salt,value)=>createHmac('sha256',salt).update(String(value)).digest('hex').slice(0,32);

export function createOpenPanelIntegration({apiUrl='https://api.openpanel.dev',clientId,clientSecret,profileSalt,timeoutMs=2500,fetcher=fetch}={}){
  const base=String(apiUrl||'').replace(/\/+$/,'');
  const ready=()=>Boolean(base&&clientId&&clientSecret&&profileSalt);
  return {
    ready,
    async send(event){
      if(!ready())throw new Error('OPENPANEL_NOT_CONFIGURED');
      const source=event.payload&&typeof event.payload==='object'?event.payload:{};
      const properties=clean(source)||{};delete properties.userId;
      const payload={name:event.eventType,properties:{...properties,academyEventId:event.id,entityType:event.entityType,entityId:event.entityId,schemaVersion:event.schemaVersion}};
      if(source.userId)payload.profileId=pseudonym(profileSalt,source.userId);
      if(source.squadId)payload.groups=[String(source.squadId).slice(0,120)];
      const response=await fetcher(base+'/track',{method:'POST',headers:{'content-type':'application/json','openpanel-client-id':clientId,'openpanel-client-secret':clientSecret},body:JSON.stringify({type:'track',payload}),signal:AbortSignal.timeout(timeoutMs)});
      if(!response.ok)throw new Error(`OPENPANEL_HTTP_${response.status}`);
      return {ok:true,status:response.status};
    }
  };
}
