import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,sep,basename} from 'node:path';
import {randomBytes} from 'node:crypto';
import {createServer as createNetServer} from 'node:net';
import {createApp} from '../server.mjs';
import {readProfile} from '../lib/access.mjs';

test('trilha BI oferece materiais, percurso e certificação sem alterar o comercial',async()=>{
  const dataDir=await mkdtemp(resolve(tmpdir(),'st1-bi-learning-'));
  const probe=createNetServer();await new Promise((done,reject)=>{probe.once('error',reject);probe.listen(0,'127.0.0.1',done);});const port=probe.address().port;await new Promise(done=>probe.close(done));
  const baseURL='http://localhost:'+port;
  const {app,ctx}=await createApp({dataDir,baseURL,testMode:true,googleConfig:{clientId:'',clientSecret:''}});
  const server=await new Promise(done=>{const current=app.listen(port,'127.0.0.1',()=>done(current));});
  const request=async(who,url,{method='GET',body}={})=>{
    const response=await fetch(baseURL+url,{method,headers:{Origin:baseURL,Connection:'close',...(who?{Cookie:who.cookie}:{}),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
    const text=await response.text();let data;try{data=JSON.parse(text);}catch{}return {status:response.status,data,text,contentType:response.headers.get('content-type')};
  };
  const signup=async(key,role='seller',tracks=[],permissions=[])=>{
    const invitation=ctx.createInvitation({name:'QA BI '+key,email:key+'@bi.example',role,tracks,permissions});
    const token=new URL(invitation.url).searchParams.get('convite');
    const response=await fetch(baseURL+'/api/auth/sign-up/email',{method:'POST',headers:{Origin:baseURL,'Content-Type':'application/json','x-academy-invite':token,Connection:'close'},body:JSON.stringify({name:'QA BI',email:key+'@bi.example',password:randomBytes(24).toString('base64url')})});
    assert.equal(response.status,200);const payload=await response.json();
    const participant={id:payload.user.id,cookie:response.headers.getSetCookie().map(v=>v.split(';')[0]).join('; ')};
    const onboarding=await fetch(baseURL+'/api/onboarding',{method:'POST',headers:{Origin:baseURL,Connection:'close',Cookie:participant.cookie,'Content-Type':'application/json'},body:JSON.stringify({sector:'Gestão',role:'Vendedor(a)',goal:'Especialista',dream:'Aprender outro canal',challenges:['Organização'],squad:''})});
    assert.equal(onboarding.status,200);
    return participant;
  };
  try{
    const admin=await signup('admin','admin');
    const student=await signup('student','seller',['bi'],['materials','assessments','conquests','community']);
    const noMaterials=await signup('no-materials','seller',['pap'],['conquests']);

    assert.equal(ctx.bank.tracks.find(track=>track.id==='bi')?.questions.length,20,'a certificação BI deve usar 20 questões próprias');

    const library=await request(student,'/api/library');
    assert.equal(library.status,200,library.text);
    assert.equal(library.data.modules.filter(module=>module.id.startsWith('st1-bi-m')).length,16);
    const biItems=library.data.items.filter(item=>item.id.startsWith('st1-bi-'));
    assert.equal(biItems.length,80,'16 cadernos, 48 aulas e 16 laboratórios publicados');
    assert.ok(biItems.every(item=>item.scope==='general'));
    assert.ok(biItems.every(item=>item.tracks.includes('bi')));

    const quizzes=await request(student,'/api/quizzes');
    assert.equal(quizzes.status,200);
    assert.equal(quizzes.data.items.filter(item=>item.id.startsWith('avaliacao-bi-m')).length,16);

    const trackCatalog=await request(student,'/api/catalog');
    assert.ok(trackCatalog.data.tracks.some(track=>track.id==='bi'),'o aluno liberado na trilha BI não precisa da permissão de Estratégia');
    const restrictedCatalog=await request(noMaterials,'/api/catalog');
    assert.equal(restrictedCatalog.status,200);
    assert.equal(restrictedCatalog.data.tracks.some(track=>track.id==='bi'),false);
    assert.equal((await request(noMaterials,'/api/contents/st1-bi-m01')).status,404);
    assert.equal((await request(student,'/api/admin/learning-flows/percurso-bi')).status,403);

    const flows=await request(student,'/api/learning-flows');
    assert.equal(flows.status,200);
    assert.ok(flows.data.items.some(flow=>flow.id==='percurso-bi'));
    const flow=await request(student,'/api/learning-flows/percurso-bi');
    assert.equal(flow.status,200);
    assert.equal(flow.data.nodes.filter(node=>node.kind==='material').length,16);
    assert.equal(flow.data.nodes.filter(node=>node.kind==='quiz').length,16);
    const initialPath=(await request(student,'/api/game/me')).data.paths.find(path=>path.id==='bi');
    assert.equal(initialPath.nodes.length,34);
    assert.equal(initialPath.nodes[0].kind,'material');
    assert.equal(initialPath.nodes[0].status,'available');
    assert.equal(initialPath.nodes[1].kind,'quiz');
    assert.equal(initialPath.nodes[1].status,'locked');

    assert.equal((await request(student,'/api/attempts',{method:'POST',body:{trackId:'bi'}})).status,423,'a certificação final deve respeitar o percurso');
    for(let index=1;index<=16;index++){
      const suffix='m'+String(index).padStart(2,'0'),contentId='st1-bi-'+suffix,quizId='avaliacao-bi-'+suffix;
      const material=await request(student,'/api/contents/'+contentId);
      assert.equal(material.status,200,material.text);
      const completed=await request(student,'/api/contents/'+contentId+'/study',{method:'POST',body:{version:material.data.study.version,completed:true}});
      assert.equal(completed.status,200,completed.text);
      const started=await request(student,'/api/quizzes/'+quizId+'/start',{method:'POST',body:{}});
      assert.equal(started.status,201,started.text);
      const privateQuestions=JSON.parse(ctx.db.prepare('SELECT questions_private FROM academy_quiz_attempt WHERE id=?').get(started.data.id).questions_private);
      const answers=Object.fromEntries(privateQuestions.map(question=>[question.id,question.answer]));
      const result=await request(student,'/api/quiz-attempts/'+started.data.id+'/finish',{method:'POST',body:{revision:started.data.revision,answers}});
      assert.equal(result.status,200,result.text);
      assert.equal(result.data.result.approved,true,'avaliação '+suffix+' deve aprovar com o gabarito correto');
      assert.equal(ctx.db.prepare("SELECT count(*) n FROM academy_xp WHERE user_id=? AND track_id='bi'").get(student.id).n,0,'avaliações BI não criam XP comercial');
    }

    const unlocked=await request(student,'/api/attempts',{method:'POST',body:{trackId:'bi'}});
    assert.equal(unlocked.status,201,unlocked.text);
    const readyPath=(await request(student,'/api/game/me')).data.paths.find(path=>path.id==='bi');
    assert.ok(readyPath.nodes.slice(0,32).every(node=>node.status==='done'));
    assert.equal(readyPath.nodes[32].status,'available');
    assert.equal(readyPath.nodes[33].status,'locked');
    assert.equal(unlocked.data.questions.length,20);
    const answers=Object.fromEntries(unlocked.data.questions.map(question=>[question.id,ctx.bank.tracks.find(track=>track.id==='bi').questions.find(item=>item.id===question.id).answer]));
    const final=await request(student,'/api/attempts/'+unlocked.data.id+'/finish',{method:'POST',body:{revision:unlocked.data.revision,answers}});
    assert.equal(final.status,200,final.text);
    assert.equal(final.data.approved,true);
    assert.equal(final.data.certificate.trackId,'bi');
    assert.ok((await request(student,'/api/game/me')).data.paths.find(path=>path.id==='bi').nodes.every(node=>node.status==='done'));
    assert.equal(ctx.db.prepare('SELECT count(*) n FROM academy_outbox WHERE certificate_id=?').get(final.data.certificate.id).n,0,'certificados BI não são enviados ao CRM comercial');
    assert.equal(ctx.game.me(readProfile(ctx.db,student.id)).xp,0,'conclusões BI não alteram o XP comercial');
    assert.equal((await request(student,'/api/certificates/'+final.data.certificate.id+'/share',{method:'POST',body:{}})).status,403,'certificados BI não são compartilhados no squad comercial');
    const pdf=await request(student,'/api/certificates/'+final.data.certificate.id+'/pdf');
    assert.equal(pdf.status,200,pdf.text);
    assert.match(pdf.contentType,/application\/pdf/);
    assert.equal((await request(admin,'/api/admin/learning-flows/percurso-bi')).status,200);
  }finally{
    await new Promise(done=>server.close(done));ctx.db.close();
    if(!resolve(dataDir).startsWith(resolve(tmpdir())+sep)||!basename(dataDir).startsWith('st1-bi-learning-'))throw new Error('Pasta temporária inesperada.');
    await rm(dataDir,{recursive:true,force:true});
  }
});
