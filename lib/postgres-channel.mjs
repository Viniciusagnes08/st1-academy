import {performance} from 'node:perf_hooks';

export function waitForPostgresResponse(control,timeout){
  const deadline=performance.now()+timeout;
  // A notification from the previous response may arrive after the next request
  // starts waiting. Only the state change confirms that its data is ready.
  while(Atomics.load(control,0)===1){
    const remaining=deadline-performance.now();
    if(remaining<=0)throw new Error('O banco não respondeu dentro do prazo. Reinicie a conexão.');
    Atomics.wait(control,0,1,remaining);
  }
  if(Atomics.load(control,0)!==2)throw new Error('A resposta do banco não foi concluída.');
}
