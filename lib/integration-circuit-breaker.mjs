export function createCircuitBreaker({clock=Date.now,threshold=5,cooldownMs=300000}={}){
  const states=new Map();
  const read=provider=>states.get(provider)||{failures:0,openedAt:null};
  return {
    canAttempt(provider){const state=read(provider);if(!state.openedAt)return true;if(clock()-state.openedAt>=cooldownMs){states.set(provider,{failures:0,openedAt:null});return true;}return false;},
    success(provider){states.set(provider,{failures:0,openedAt:null});return this.state(provider);},
    failure(provider){const state=read(provider),failures=state.failures+1;states.set(provider,{failures,openedAt:failures>=threshold?(state.openedAt??clock()):null});return this.state(provider);},
    state(provider){return {...read(provider)};}
  };
}
