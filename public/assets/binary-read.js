export async function readPrivateFile(item,{signal,onProgress,fetcher=fetch}={}){
  const asset=item.asset;
  if(!asset||!Number.isSafeInteger(asset.size)||asset.size<1||asset.size>25*1024*1024||!/^[a-f0-9]{64}$/.test(asset.sha256))throw new Error('Não foi possível conferir este arquivo.');
  const output=new Uint8Array(asset.size),url='/api/contents/'+encodeURIComponent(item.id)+'/file';
  for(let start=0;start<output.length;start+=1024*1024){
    const end=Math.min(output.length-1,start+1024*1024-1);
    const response=await fetcher(url,{credentials:'same-origin',signal,headers:{Range:`bytes=${start}-${end}`,'If-Match':'"'+asset.sha256+'"'}});
    if(response.status!==206||response.headers.get('content-range')!==`bytes ${start}-${end}/${output.length}`)throw new Error(response.status===401?'Entre novamente para abrir o material.':'O material mudou ou não está disponível. Abra-o novamente.');
    const part=new Uint8Array(await response.arrayBuffer());if(part.length!==end-start+1)throw new Error('O arquivo chegou incompleto. Tente novamente.');
    output.set(part,start);onProgress?.(end+1,output.length);
  }
  const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',output)),byte=>byte.toString(16).padStart(2,'0')).join('');
  if(digest!==asset.sha256)throw new Error('Não foi possível conferir a integridade do material. Abra-o novamente.');
  return output;
}
