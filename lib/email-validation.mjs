import { resolve4, resolve6, resolveMx } from 'node:dns/promises';
import { domainToASCII } from 'node:url';

const NO_RECORD_CODES=new Set(['ENODATA','ENOTFOUND','EAI_NONAME','ENONAME']);
const ADDRESS_PATTERN=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function hasAddressRecord(domain){
  const results=await Promise.allSettled([resolve4(domain),resolve6(domain)]);
  if(results.some(result=>result.status==='fulfilled'&&result.value.length))return true;
  if(results.every(result=>result.status==='rejected'&&NO_RECORD_CODES.has(result.reason?.code)))return false;
  return null;
}

async function checkDomainRecords(domain){
  let records;
  try{records=await resolveMx(domain);}
  catch(error){
    if(!NO_RECORD_CODES.has(error?.code))return 'unknown';
    const address=await hasAddressRecord(domain);
    return address===true?'valid':address===false?'invalid':'unknown';
  }
  if(records.some(record=>String(record.exchange).trim()==='.'))return 'invalid';
  if(records.length)return 'valid';
  const address=await hasAddressRecord(domain);
  return address===true?'valid':address===false?'invalid':'unknown';
}

async function checkDomain(domain){
  let timer;
  try{
    return await Promise.race([
      checkDomainRecords(domain),
      new Promise(resolve=>{timer=setTimeout(()=>resolve('unknown'),4000);})
    ]);
  }catch{return 'unknown';}
  finally{clearTimeout(timer);}
}

export async function validateEmailAddresses(emails){
  if(!Array.isArray(emails)||emails.length<1||emails.length>100)throw new Error('Valide entre 1 e 100 endereços de e-mail por vez.');
  const items=emails.map((value,index)=>{
    const email=typeof value==='string'?value.trim().toLowerCase():'';
    if(email.length>254||!ADDRESS_PATTERN.test(email))return {index,email,status:'invalid',message:'Formato de e-mail inválido.'};
    const rawDomain=email.slice(email.lastIndexOf('@')+1),domain=domainToASCII(rawDomain);
    if(!domain||domain.length>253||!domain.split('.').every(label=>label.length<=63&&/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label)))return {index,email,status:'invalid',message:'Domínio de e-mail inválido.'};
    return {index,email,domain};
  });
  const domains=[...new Set(items.filter(item=>item.domain).map(item=>item.domain))];
  const domainStatus=new Map();
  let next=0;
  await Promise.all(Array.from({length:Math.min(8,domains.length)},async()=>{
    while(next<domains.length){
      const domain=domains[next++];
      domainStatus.set(domain,await checkDomain(domain));
    }
  }));
  return items.map(item=>{
    if(!item.domain)return item;
    const status=domainStatus.get(item.domain)||'unknown';
    const message=status==='valid'
      ?'Domínio com servidor de e-mail confirmado; a caixa postal não foi testada.'
      :status==='invalid'
        ?'Não encontramos servidor de e-mail para este domínio.'
        :'Não foi possível confirmar o domínio agora; o envio ainda pode ser tentado.';
    return {index:item.index,email:item.email,status,message};
  });
}
