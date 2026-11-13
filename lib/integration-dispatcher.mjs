import {createCircuitBreaker} from './integration-circuit-breaker.mjs';

export function createIntegrationDispatcher({outbox,adapters={},breaker=createCircuitBreaker(),limit=25}={}){
  let running=false;
  async function tick(){
    if(running)return {running:true,delivered:0,failed:0,skipped:0};
    running=true;let delivered=0,failed=0,skipped=0;
    try{
      for(const item of outbox.due(limit)){
        const adapter=adapters[item.provider];
        if(!adapter||typeof adapter.send!=='function'||adapter.ready?.()===false){skipped++;continue;}
        if(!breaker.canAttempt(item.provider)){skipped++;continue;}
        if(!outbox.markSending(item.id)){skipped++;continue;}
        try{await adapter.send(item);outbox.succeed(item.id);breaker.success(item.provider);delivered++;}
        catch(error){outbox.fail(item.id,error);breaker.failure(item.provider);failed++;}
      }
      return {running:false,delivered,failed,skipped};
    }finally{running=false;}
  }
  return {tick,breaker};
}
