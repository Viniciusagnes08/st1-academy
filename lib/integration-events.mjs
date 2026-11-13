const blocked=/^(email|phone|name|firstName|lastName|cpf|rg|address|endereco|password|senha|token|cookie|authorization|secret|answers|answers_json)$/i;
function sanitize(value,depth=0){
  if(depth>4)return undefined;
  if(Array.isArray(value))return value.slice(0,30).map(item=>sanitize(item,depth+1)).filter(item=>item!==undefined);
  if(value&&typeof value==='object'){
    const result={};for(const [key,item] of Object.entries(value)){if(blocked.test(key))continue;const safe=sanitize(item,depth+1);if(safe!==undefined)result[key]=safe;}return result;
  }
  if(typeof value==='string')return value.slice(0,500);
  if(['number','boolean'].includes(typeof value)||value===null)return value;
  return undefined;
}

export function createIntegrationEvents({outbox,integrations,dispatcher,logger=console}={}){
  const destinations=()=>{const config=integrations.list();return ['n8n','openpanel'].filter(provider=>config?.[provider]?.ready===true);};
  function emit(eventType,{entityType='generic',entityId='unknown',payload={},schemaVersion=1}={}){
    const providers=destinations();if(!providers.length)return null;
    try{
      const event=outbox.record(eventType,{entityType,entityId,payload:sanitize(payload)||{},schemaVersion},providers);
      queueMicrotask(()=>Promise.resolve(dispatcher.tick()).catch(error=>logger.error('Falha assíncrona nas integrações da Academy:',String(error?.code||'DELIVERY_FAILED').slice(0,60))));
      return event;
    }catch(error){logger.error('Falha ao registrar integração da Academy:',String(error?.code||'OUTBOX_FAILED').slice(0,60));return null;}
  }
  return {emit};
}
