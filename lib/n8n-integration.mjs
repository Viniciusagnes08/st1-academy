const envelope=event=>({event:{id:event.id,type:event.eventType,schemaVersion:event.schemaVersion,createdAt:event.createdAt,entity:{type:event.entityType,id:event.entityId},payload:event.payload}});

export function createN8nIntegration({webhookUrl,secret,timeoutMs=2500,fetcher=fetch}={}){
  const ready=()=>Boolean(webhookUrl&&secret);
  return {
    ready,
    async send(event){
      if(!ready())throw new Error('N8N_NOT_CONFIGURED');
      const response=await fetcher(webhookUrl,{method:'POST',headers:{
        'content-type':'application/json',
        'x-academy-event-id':event.id,
        'x-academy-event-type':event.eventType,
        'x-academy-schema-version':String(event.schemaVersion),
        'x-academy-timestamp':event.createdAt,
        'x-academy-secret':secret
      },body:JSON.stringify(envelope(event)),signal:AbortSignal.timeout(timeoutMs)});
      if(!response.ok)throw new Error(`N8N_HTTP_${response.status}`);
      return {ok:true,status:response.status};
    }
  };
}
