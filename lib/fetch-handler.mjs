import serverless from 'serverless-http';
import {createServerlessHandler} from './serverless-handler.mjs';

// Preserve the existing Node/Express/auth contract while accepting Netlify's
// standard Request. The same per-instance transaction queue protects both APIs.
export function createFetchHandler({createApp,options={}}){
  const handle=serverless(createServerlessHandler({createApp,options}),{binary:true});
  return async(request,context={})=>{
    const url=new URL(request.url),headers=Object.fromEntries(request.headers);
    headers.host=url.host;headers['x-forwarded-proto']=url.protocol.slice(0,-1);
    const bytes=Buffer.from(await request.arrayBuffer());
    const result=await handle({version:'2.0',rawPath:url.pathname,rawQueryString:url.search.slice(1),headers,body:bytes.toString('base64'),isBase64Encoded:true,requestContext:{requestId:context.requestId,http:{method:request.method,path:url.pathname,sourceIp:context.ip||'127.0.0.1',protocol:'HTTP/1.1'}}},{});
    const responseHeaders=new Headers(result.headers);
    for(const cookie of result.cookies||[])responseHeaders.append('Set-Cookie',cookie);
    responseHeaders.delete('transfer-encoding');
    const empty=request.method==='HEAD'||[204,205,304].includes(result.statusCode);
    if(empty)return new Response(null,{status:result.statusCode,headers:responseHeaders});
    const output=Buffer.from(result.body||'',result.isBase64Encoded?'base64':'utf8');
    responseHeaders.delete('content-length');
    // Explicit Web streams enable Netlify's 20 MB streaming response limit.
    // Larger study files are fetched in authenticated ranges by the reader.
    const stream=new ReadableStream({start(controller){for(let at=0;at<output.length;at+=256*1024)controller.enqueue(output.subarray(at,at+256*1024));controller.close();}});
    return new Response(stream,{status:result.statusCode,headers:responseHeaders});
  };
}
