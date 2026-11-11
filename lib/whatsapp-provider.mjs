const version=value=>/^v\d+\.\d+$/.test(value||'');
const numeric=value=>/^\d+$/.test(String(value||''));
export const compatibleAutomationTemplate=item=>{
  if(item?.status!=='APPROVED')return false;
  const components=Array.isArray(item.components)?item.components:[];
  const body=components.find(x=>String(x.type).toUpperCase()==='BODY');
  if(!body||typeof body.text!=='string')return false;
  const variables=[...body.text.matchAll(/{{\s*(\d+)\s*}}/g)].map(x=>Number(x[1]));
  if(variables.length!==1||variables[0]!==1)return false;
  return components.filter(x=>String(x.type).toUpperCase()!=='BODY').every(x=>!/{{\s*\d+\s*}}/.test(JSON.stringify(x)));
};

export function createWhatsAppProvider(env=process.env,{fetcher=fetch}={}){
  const ready=()=>!!(env.WHATSAPP_ACCESS_TOKEN&&numeric(env.WHATSAPP_PHONE_NUMBER_ID)&&version(env.WHATSAPP_GRAPH_VERSION));
  const templatesReady=()=>ready()&&numeric(env.WHATSAPP_BUSINESS_ACCOUNT_ID);
  const auth=()=>({Authorization:`Bearer ${env.WHATSAPP_ACCESS_TOKEN}`});
  async function json(url,options={}){
    const response=await fetcher(url,{...options,signal:AbortSignal.timeout(15000)});
    const result=await response.json();
    if(!response.ok)throw new Error(String(result.error?.message||`Meta retornou HTTP ${response.status}`).slice(0,200));
    return result;
  }
  async function send(to,templateName,language='pt_BR',firstName=null){
    if(!ready())throw new Error('Conecte a API oficial do WhatsApp Business.');
    const template={name:templateName,language:{code:language}};
    if(firstName)template.components=[{type:'body',parameters:[{type:'text',text:firstName}]}];
    const result=await json(`https://graph.facebook.com/${env.WHATSAPP_GRAPH_VERSION}/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`,{
      method:'POST',headers:{...auth(),'Content-Type':'application/json'},
      body:JSON.stringify({messaging_product:'whatsapp',to,type:'template',template})
    });
    if(!result.messages?.[0]?.id)throw new Error('A Meta não confirmou o aceite da mensagem.');
    return result.messages[0].id;
  }
  async function templates(){
    if(!templatesReady())throw new Error('Configure o ID da conta WhatsApp Business para consultar os modelos.');
    const root=`https://graph.facebook.com/${env.WHATSAPP_GRAPH_VERSION}/${env.WHATSAPP_BUSINESS_ACCOUNT_ID}/message_templates?fields=name,language,status,components&limit=100`;
    const rows=[];let next=root;
    for(let page=0;next&&page<10;page++){
      const data=await json(next,{headers:auth()});
      rows.push(...(data.data||[]).map(({name,language,status,components})=>({name,language,status,components})));
      next=data.paging?.next;
      if(next&&new URL(next).hostname!=='graph.facebook.com')throw new Error('Resposta inesperada da Meta.');
    }
    if(next)throw new Error('A lista de modelos da Meta ultrapassou o limite de consulta.');
    return rows;
  }
  async function approved(name,language){return (await templates()).some(item=>item.name===name&&item.language===language&&item.status==='APPROVED');}
  async function approvedForAutomation(name,language){return (await templates()).some(item=>item.name===name&&item.language===language&&compatibleAutomationTemplate(item));}
  return {ready,templatesReady,send,templates,approved,approvedForAutomation};
}
