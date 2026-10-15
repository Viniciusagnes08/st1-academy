import {sendBinary} from './uploads.mjs';
const fail=(message,status=400)=>Object.assign(new Error(message),{status});

export function inspectChatMedia({name,mime,bytes,kind,duration=0}){
  if(typeof name!=='string'||!name.trim()||name.length>160||/[\\/\r\n\u0000-\u001f]/.test(name))throw fail('Nome do arquivo inválido.');
  if(!['image','audio'].includes(kind)||!Buffer.isBuffer(bytes)||bytes.length<32)throw fail('Escolha uma foto ou um áudio válido.');
  const ext=name.split('.').pop().toLowerCase(),size=kind==='image'?5*1024*1024:8*1024*1024;
  if(bytes.length>size)throw fail(kind==='image'?'A foto pode ter até 5 MB.':'O áudio pode ter até 8 MB.',413);
  let detected;
  if(kind==='image'){
    if(ext==='png'&&bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))){
      const width=bytes.readUInt32BE(16),height=bytes.readUInt32BE(20);
      if(!width||!height||width*height>40000000)throw fail('Escolha uma foto com até 40 milhões de pixels.');
      detected='image/png';
    }else if(['jpg','jpeg'].includes(ext)&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255)detected='image/jpeg';
    else if(ext==='webp'&&bytes.subarray(0,4).toString()==='RIFF'&&bytes.subarray(8,12).toString()==='WEBP')detected='image/webp';
  }else{
    if(!Number.isFinite(duration)||duration<0||duration>125)throw fail('Grave um áudio de até 2 minutos.');
    if(ext==='webm'&&bytes.subarray(0,4).equals(Buffer.from([26,69,223,163])))detected='audio/webm';
    else if(ext==='ogg'&&bytes.subarray(0,4).toString()==='OggS')detected='audio/ogg';
    else if(['mp4','m4a'].includes(ext)&&bytes.subarray(4,8).toString()==='ftyp')detected='audio/mp4';
    else if(ext==='wav'&&bytes.subarray(0,4).toString()==='RIFF'&&bytes.subarray(8,12).toString()==='WAVE')detected='audio/wav';
    else if(ext==='mp3'&&(bytes.subarray(0,3).toString()==='ID3'||bytes[0]===255&&(bytes[1]&224)===224))detected='audio/mpeg';
  }
  if(!detected||typeof mime!=='string'||mime.split(';')[0]!==detected&&!(mime==='audio/x-wav'&&detected==='audio/wav'))throw fail(kind==='image'?'Escolha uma foto JPG, PNG ou WebP válida.':'Escolha um áudio WebM, OGG, M4A, MP3 ou WAV válido.');
  return {name:name.trim(),mime:detected,kind,duration:kind==='audio'?duration:null,bytes};
}

export function sendChatMedia(req,res,asset){
  const bytes=Buffer.from(asset.bytes),size=bytes.length;
  res.type(asset.mime).set('Accept-Ranges','bytes').set('Content-Disposition',"inline; filename*=UTF-8''"+encodeURIComponent(asset.name));
  if(!req.headers.range)return sendBinary(res,bytes);
  const range=/^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
  let start=range?.[1]?Number(range[1]):0,end=range?.[2]?Number(range[2]):size-1;
  if(range&&!range[1]&&range[2]){start=Math.max(0,size-Number(range[2]));end=size-1;}
  if(!range||!range[1]&&!range[2]||!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||start>=size||end<start)return res.status(416).set('Content-Range','bytes */'+size).end();
  end=Math.min(end,size-1);
  res.status(206).set('Content-Range',`bytes ${start}-${end}/${size}`);return sendBinary(res,bytes.subarray(start,end+1));
}
