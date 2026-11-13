export function createIntegrationHealth({integrations,outbox,dispatcher}={}){
  function snapshot(){
    const config=integrations.list(),state=provider=>dispatcher?.breaker?.state?.(provider)||{failures:0,openedAt:null};
    return {providers:{glitchtip:{ready:config.glitchtip?.ready===true},n8n:{ready:config.n8n?.ready===true,...state('n8n')},openpanel:{ready:config.openpanel?.ready===true,...state('openpanel')}},queue:outbox.counts()};
  }
  return {snapshot};
}
