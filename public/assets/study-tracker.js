export function trackStudy({api,contentId}){
  let disposed=false,session=null,timer=null,pending=false,generation=0;
  async function tick(){
    if(disposed||pending||!session||document.visibilityState!=='visible')return;
    pending=true;try{await api('/api/study/'+session+'/heartbeat',{method:'POST',body:{}});}catch{clearInterval(timer);}finally{pending=false;}
  }
  async function start(){
    const turn=++generation;clearInterval(timer);session=null;
    if(disposed||document.visibilityState!=='visible')return;
    try{const result=await api('/api/study',{method:'POST',body:{contentId}});if(disposed||generation!==turn)return;session=result.id;timer=setInterval(tick,result.intervalSeconds*1000);}catch{}
  }
  const visibility=()=>{if(document.visibilityState==='visible')start();else{generation++;session=null;clearInterval(timer);}};
  document.addEventListener('visibilitychange',visibility);start();
  return ()=>{disposed=true;generation++;clearInterval(timer);document.removeEventListener('visibilitychange',visibility);};
}
