// These fixtures isolate the existing grading/access/study contracts.
// Default curriculum and prerequisite enforcement are covered in learning-flows.test.mjs.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {dirname,basename} from 'node:path';
import {createHash,randomBytes} from 'node:crypto';
import {createApp} from '../server.mjs';
import {grade} from '../lib/grading.mjs';
import {createContext} from '../lib/context.mjs';
import {completeOnboardingForTest} from './helpers/academy-fixtures.mjs';

test('A avaliação registra identidade, exige 80% e regras críticas, e emite uma única conquista por trilha',async t=>{
  const directory=await mkdtemp(resolve(tmpdir(),'st1-academia-test-'));
  const baseURL='http://localhost:4186';
  let {app,ctx}=await createApp({dataDir:directory,baseURL,testMode:true,includeLearningFlows:false});
  let server=await new Promise(resolve=>{const server=app.listen(4186,'127.0.0.1',()=>resolve(server));});
  const clients={admin:{cookie:''},seller:{cookie:''},other:{cookie:''}};
  const request=async(client,path,{method='GET',body,headers={}}={})=>{
    const response=await fetch(baseURL+path,{method,headers:{Origin:baseURL,Connection:'close',...(client?.cookie?{Cookie:client.cookie}:{}),...(body?{'Content-Type':'application/json'}:{}),...headers},...(body?{body:JSON.stringify(body)}:{})});
    const cookies=response.headers.getSetCookie();
    if(client&&cookies.length)client.cookie=cookies.map(value=>value.split(';')[0]).join('; ');
    const bytes=Buffer.from(await response.arrayBuffer());
    let data;try{data=JSON.parse(bytes.toString());}catch{data=null;}
    return {status:response.status,data,bytes};
  };
  const enroll=async(client,{name,email,role='seller'})=>{
    const invite=ctx.createInvitation({name,email,role});
    const token=new URL(invite.url).searchParams.get('convite');
    const response=await request(client,'/api/auth/sign-up/email',{method:'POST',body:{name:'Nome adulterado',email,password:randomBytes(24).toString('base64url')},headers:{'x-academy-invite':token}});
    assert.equal(response.status,200,JSON.stringify(response.data));
    assert.equal(response.data.user.name,name);
    completeOnboardingForTest(ctx.db,response.data.user.id);
    return token;
  };
  const answersFor=attempt=>Object.fromEntries(attempt.questions.map(q=>{const original=ctx.bank.tracks.find(t=>t.id===attempt.trackId).questions.find(original=>original.id===q.id);return [q.id,original.answer];}));
  try{
    await t.test('gabarito não é entregue e cadastro sem convite é recusado',async()=>{
      const response=await request(null,'/api/catalog');assert.equal(response.status,200);assert.equal(JSON.stringify(response.data).includes('explanation'),false);assert.equal(JSON.stringify(response.data).includes('answer'),false);
      const register=await request(null,'/api/auth/sign-up/email',{method:'POST',body:{name:'Pessoa sem convite',email:'unauthorized@example.test',password:'SenhaDeTesteSemConvite123'}});assert.equal(register.status,403);
      const attempt=await request(null,'/api/attempts',{method:'POST',body:{trackId:'pap'}});assert.equal(attempt.status,401);
      const raw=await request(null,'/content/questions.json');assert.equal(raw.status,404);
    });
    const usedToken=await enroll(clients.admin,{name:'Gestor de teste',email:'admin@example.test',role:'admin'});
    await enroll(clients.seller,{name:'Vendedor de teste',email:'seller@example.test'});
    await enroll(clients.other,{name:'Outro vendedor de teste',email:'other@example.test'});
    await t.test('convite é pessoal, de uso único, e vendedor não acessa gestão nem troca o nome',async()=>{
      assert.equal((await request(null,`/api/invitation/${usedToken}`)).status,404);
      assert.equal((await request(clients.seller,'/api/admin/report')).status,403);
      assert.equal((await request(clients.seller,'/api/auth/update-user',{method:'POST',body:{name:'Outro nome'}})).status,403);
      const result=await request(clients.admin,'/api/admin/invitations',{method:'POST',body:{name:'Convite de teste',email:'invite@example.test',tracks:['pap'],role:'admin'}});assert.equal(result.status,201);
      const record=ctx.db.prepare('SELECT role FROM academy_invitation WHERE id=?').get(result.data.id);assert.equal(record.role,'admin');
    });
    const track=ctx.bank.tracks[0];
    await t.test('80% com uma regra crítica errada reprova; abaixo de 80% reprova; 80% com críticas certas aprova',()=>{
      const wrong=questions=>{const answers=Object.fromEntries(questions.map(q=>[q.id,q.answer]));return answers;};
      const oneCritical=track.questions.find(q=>q.critical),nonCritical=track.questions.filter(q=>!q.critical);
      const criticalAnswers=wrong(track.questions);
      [oneCritical,...nonCritical.slice(0,3)].forEach(q=>criticalAnswers[q.id]=q.options.find(o=>o.id!==q.answer).id);
      const criticalResult=grade(track.questions,criticalAnswers);assert.equal(criticalResult.score,80);assert.equal(criticalResult.approved,false);assert.equal(criticalResult.failedCritical,1);
      const low=wrong(track.questions);nonCritical.slice(0,5).forEach(q=>low[q.id]=q.options.find(o=>o.id!==q.answer).id);assert.equal(grade(track.questions,low).approved,false);
      const passing=wrong(track.questions);nonCritical.slice(0,4).forEach(q=>passing[q.id]=q.options.find(o=>o.id!==q.answer).id);assert.equal(grade(track.questions,passing).approved,true);
    });
    let firstCertificate;
    for(const track of ctx.bank.tracks){
      await t.test(`trilha ${track.name}: respostas salvas, aprovação e certificado PDF autenticado`,async()=>{
        const start=await request(clients.seller,'/api/attempts',{method:'POST',body:{trackId:track.id}});assert.equal(start.status,201);const attempt=start.data;assert.equal(attempt.questions.length,20);assert.equal(JSON.stringify(attempt.questions).includes('"answer"'),false);
        const owner=await request(clients.other,`/api/attempts/${attempt.id}`);assert.equal(owner.status,404);
        const answers=answersFor(attempt);
        const partial={ [attempt.questions[0].id]:answers[attempt.questions[0].id] };
        const save=await request(clients.seller,`/api/attempts/${attempt.id}`,{method:'PUT',body:{answers:partial,revision:0}});assert.equal(save.status,200);assert.equal(save.data.revision,1);
        assert.equal((await request(clients.seller,`/api/attempts/${attempt.id}`,{method:'PUT',body:{answers:partial,revision:0}})).status,409);
        assert.equal((await request(clients.seller,`/api/attempts/${attempt.id}/finish`,{method:'POST',body:{answers:partial,revision:1,score:100,approved:true}})).status,400);
        const finish=await request(clients.seller,`/api/attempts/${attempt.id}/finish`,{method:'POST',body:{answers,revision:1,score:0}});assert.equal(finish.status,200);assert.equal(finish.data.score,100);assert.equal(finish.data.approved,true);
        const again=await request(clients.seller,`/api/attempts/${attempt.id}/finish`,{method:'POST',body:{answers:{},revision:99}});assert.equal(again.data.certificate.id,finish.data.certificate.id);
        const certificate=finish.data.certificate;if(!firstCertificate)firstCertificate=certificate;
        assert.equal((await request(null,`/api/certificates/${certificate.id}/pdf`)).status,401);
        assert.equal((await request(clients.other,`/api/certificates/${certificate.id}/pdf`)).status,404);
        const pdf=await request(clients.seller,`/api/certificates/${certificate.id}/pdf`);assert.equal(pdf.status,200);assert.equal(pdf.bytes.subarray(0,5).toString(),'%PDF-');
        const verify=await request(null,`/api/verify/${certificate.id}`);assert.equal(verify.data.valid,true);assert.equal(verify.data.pdfSha256,createHash('sha256').update(pdf.bytes).digest('hex'));assert.equal('name' in verify.data,false);
        const retake=await request(clients.seller,'/api/attempts',{method:'POST',body:{trackId:track.id}});const retakeFinish=await request(clients.seller,`/api/attempts/${retake.data.id}/finish`,{method:'POST',body:{answers:answersFor(retake.data),revision:0}});assert.equal(retakeFinish.data.certificate.id,certificate.id);
      });
    }
    await t.test('resultado adulterado no navegador não aprova e não gera certificado',async()=>{
      const start=await request(clients.other,'/api/attempts',{method:'POST',body:{trackId:'digital'}});const attempt=start.data;
      const answers=answersFor(attempt);const critical=ctx.bank.tracks.find(t=>t.id==='digital').questions.find(q=>q.critical);answers[critical.id]=critical.options.find(o=>o.id!==critical.answer).id;
      const response=await request(clients.other,`/api/attempts/${attempt.id}/finish`,{method:'POST',body:{answers,revision:0,score:100,approved:true}});assert.equal(response.data.score,95);assert.equal(response.data.approved,false);assert.equal(response.data.certificate,undefined);
    });
    await t.test('conquistas e integração não duplicam e nada é enviado ao ST1 Sales',async()=>{
      const salesTracks=ctx.bank.tracks.filter(track=>track.id!=='bi').length;assert.equal(ctx.db.prepare('SELECT count(*) n FROM academy_certificate').get().n,ctx.bank.tracks.length);assert.equal(ctx.db.prepare('SELECT count(*) n FROM academy_outbox').get().n,salesTracks);
      const report=await request(clients.admin,'/api/admin/report');assert.equal(report.data.st1SalesConnected,false);assert.equal(report.data.pendingIntegrations,salesTracks);
      const csv=await request(clients.admin,'/api/admin/report.csv');assert.equal(csv.status,200);assert.match(csv.bytes.toString(),/Vendedor de teste/);
    });
    await new Promise(resolve=>server.close(resolve));ctx.db.close();
    const restarted=await createApp({dataDir:directory,baseURL,testMode:true,includeLearningFlows:false});ctx=restarted.ctx;
    server=await new Promise(resolve=>{const server=restarted.app.listen(4186,'127.0.0.1',()=>resolve(server));});
    await t.test('dados, sessões, certificado e respostas persistem depois de reiniciar',async()=>{
      const profile=await request(clients.seller,'/api/me');assert.equal(profile.status,200);assert.equal(profile.data.certificates.length,ctx.bank.tracks.length);
      const pdf=await request(clients.seller,`/api/certificates/${firstCertificate.id}/pdf`);assert.equal(pdf.status,200);
      assert.equal(ctx.db.prepare('SELECT count(*) n FROM academy_attempt').get().n,ctx.bank.tracks.length*2+1);
    });
    await t.test('banco de teste não pode ser aberto como produção',async()=>{
      await assert.rejects(createContext({dataDir:directory,baseURL,testMode:false}),/outro ambiente/);
    });
  }finally{await new Promise(resolve=>server.close(resolve));ctx.db.close();assert.equal(dirname(directory),resolve(tmpdir()));assert.ok(basename(directory).startsWith('st1-academia-test-'));await rm(directory,{recursive:true,force:true});}
});
