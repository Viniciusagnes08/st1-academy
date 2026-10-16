import {sendBinary} from './uploads.mjs';

export function sendStudyFile(req,res,asset,{limited=false,contentId}={}){
  const bytes=Buffer.from(asset.bytes),size=bytes.length,etag='"'+asset.sha256+'"';
  res.type(asset.mime).set('Accept-Ranges','bytes').set('ETag',etag).set('Cache-Control','no-store');
  res.setHeader('Content-Disposition',`${req.query.download==='1'?'attachment':'inline'}; filename*=UTF-8''${encodeURIComponent(asset.name)}`);
  if(req.headers['if-match']&&req.headers['if-match']!==etag)return res.status(412).end();
  if(req.method==='HEAD')return res.set('Content-Length',String(size)).end();
  const requested=req.headers.range;
  if(requested){
    const range=/^bytes=(\d*)-(\d*)$/.exec(requested);
    let start=Number(range?.[1]||0),end=range?.[2]?Number(range[2]):size-1;
    if(range&&!range[1]&&range[2]){start=Math.max(0,size-Number(range[2]));end=size-1;}
    if(!range||!range[1]&&!range[2]||!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||start>=size||end<start)return res.status(416).set('Content-Range','bytes */'+size).end();
    end=Math.min(end,size-1,limited?start+1024*1024-1:Infinity);
    res.status(206).set('Content-Range',`bytes ${start}-${end}/${size}`);return sendBinary(res,bytes.subarray(start,end+1));
  }
  // Keep 25 MB materials available on a host with a 20 MB response limit.
  // Every part still goes through the same member/content authorization.
  if(limited&&size>18*1024*1024)return res.redirect(302,'/arquivo.html?conteudo='+encodeURIComponent(contentId)+'&baixar='+(req.query.download==='1'?'1':'0'));
  return sendBinary(res,bytes);
}
