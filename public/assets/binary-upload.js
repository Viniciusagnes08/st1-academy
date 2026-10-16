// Small requests retain the original route. Larger files are checked and sent
// in bounded parts, then committed once with the original access/revision rules.
export async function binaryFetch(target,options){
  let body=options.body,headers=new Headers(options.headers);
  if(body instanceof FormData){const encoded=new Response(body);body=await encoded.blob();headers.set('Content-Type',encoded.headers.get('Content-Type'));}
  if(!(body instanceof Blob)||body.size<=3*1024*1024)return fetch(target,{...options,headers,body});
  const sha256=[...new Uint8Array(await crypto.subtle.digest('SHA-256',await body.arrayBuffer()))].map(byte=>byte.toString(16).padStart(2,'0')).join('');
  const json=async(path,method,data)=>{
    const response=await fetch(path,{method,credentials:'same-origin',headers:{'Content-Type':'application/json'},...(data?{body:JSON.stringify(data)}:{})});
    const result=await response.json();if(!response.ok)throw new Error(result.message||'Não foi possível enviar o arquivo.');return result;
  };
  const upload=await json('/api/uploads','POST',{target,size:body.size,sha256,headers:Object.fromEntries(headers)});
  for(let index=0;index<upload.chunks;index++){
    const response=await fetch('/api/uploads/'+upload.id+'/parts/'+index,{method:'PUT',credentials:'same-origin',headers:{'Content-Type':'application/octet-stream'},body:body.slice(index*upload.chunkBytes,(index+1)*upload.chunkBytes)});
    if(!response.ok){const result=await response.json();throw new Error(result.message||'O envio foi interrompido. Selecione o arquivo novamente.');}
  }
  const result=await json('/api/uploads/'+upload.id+'/complete','POST');
  return new Response(JSON.stringify(result),{status:201,headers:{'Content-Type':'application/json'}});
}
