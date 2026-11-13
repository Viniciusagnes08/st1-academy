import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {createGlitchTipIntegration} from '../lib/glitchtip-integration.mjs';

async function server(handler){
  const instance=createServer(handler);await new Promise(resolve=>instance.listen(0,'127.0.0.1',resolve));
  return {url:`http://127.0.0.1:${instance.address().port}`,close:()=>new Promise(resolve=>instance.close(resolve))};
}

test('GlitchTip envia envelope Sentry sem PII e nunca inclui query string',async()=>{
  let received;
  const s=await server((req,res)=>{let body='';req.on('data',x=>body+=x);req.on('end',()=>{received={url:req.url,headers:req.headers,body};res.writeHead(200).end();});});
  try{
    const dsn=s.url.replace('http://','http://public-key@')+'/1';
    const integration=createGlitchTipIntegration({dsn,release:'2.6.3',environment:'production',allowHttpForTests:true});
    const ok=await integration.capture(new Error('falhou para pessoa@example.com token=segredo-123 Bearer synthetic-token.value.signature'),{method:'POST',path:'/api/quiz?token=abc',statusCode:500});
    assert.equal(ok,true);
    assert.equal(received.url,'/api/1/envelope/');
    assert.match(received.headers['x-sentry-auth'],/sentry_key=public-key/);
    assert.equal(received.headers['content-type'],'application/x-sentry-envelope');
    assert.doesNotMatch(received.body,/pessoa@example\.com/);
    assert.doesNotMatch(received.body,/segredo-123/);
    assert.doesNotMatch(received.body,/synthetic-token/);
    assert.match(received.body,/Bearer \[REDACTED\]/);
    assert.doesNotMatch(received.body,/token=abc/);
    assert.match(received.body,/\[REDACTED_EMAIL\]/);
    assert.match(received.body,/\/api\/quiz/);
  }finally{await s.close();}
});

test('GlitchTip falha fechado e não propaga erro de observabilidade',async()=>{
  const integration=createGlitchTipIntegration({dsn:'https://public@example.invalid/1',release:'2.6.3',timeoutMs:25});
  const ok=await integration.capture(new Error('boom'),{method:'GET',path:'/healthz',statusCode:500});
  assert.equal(ok,false);
});
