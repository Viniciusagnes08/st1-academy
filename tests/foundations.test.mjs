import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {randomBytes} from 'node:crypto';
import {createApp} from '../server.mjs';
import {seedFoundations} from '../lib/foundations.mjs';
import {importKnowledgeLibrary} from '../lib/knowledge.mjs';
import {readProfile} from '../lib/access.mjs';
import {defaultPermissions} from '../lib/access.mjs';
import {foundationLessons} from '../content/foundations.mjs';
import {renderLessonReading} from '../public/assets/lesson-reading.js';
import {completeOnboardingForTest} from './helpers/academy-fixtures.mjs';

test('Referências viram aulas e pré-requisitos sem sobrescrever curadoria ou progresso',async t=>{
  const dataDir=await mkdtemp(resolve(tmpdir(),'st1-foundations-')),baseURL='http://localhost:4261';
  const {app,ctx}=await createApp({dataDir,baseURL,testMode:true,includeLibrary:false,googleConfig:{clientId:'',clientSecret:''}});
  const server=await new Promise(done=>{const s=app.listen(4261,'127.0.0.1',()=>done(s));});
  const signup=async(key,role)=>{const email=key+'@foundations.example',inv=ctx.createInvitation({name:'QA Formação '+key,email,role,tracks:['pap']});const r=await fetch(baseURL+'/api/auth/sign-up/email',{method:'POST',headers:{Origin:baseURL,'Content-Type':'application/json','x-academy-invite':new URL(inv.url).searchParams.get('convite'),Connection:'close'},body:JSON.stringify({name:'QA Formação',email,password:randomBytes(24).toString('base64url')})});assert.equal(r.status,200);const data=await r.json();completeOnboardingForTest(ctx.db,data.user.id);return readProfile(ctx.db,data.user.id);};
  try{
    const admin=await signup('admin','admin'),seller=await signup('seller','seller'),supervisor=await signup('supervisor','supervisor');
    ctx.modules.seed(admin.user_id);importKnowledgeLibrary(ctx.db,admin.user_id,ctx.access.audit);
    const privatePop=ctx.contents.create(admin.user_id,{title:'POP 01 | Rotina de estudo na Academy',body:'CURADORIA_PRIVADA',kind:'text',tracks:['pap'],audience:[],status:'published'});
    ctx.learningFlows.seed(admin.user_id);
    const digital=ctx.learningFlows.adminGet(admin,'percurso-digital');digital.description='Curadoria feita pela gestão';ctx.learningFlows.save(admin,digital.id,digital);
    const original=ctx.db.prepare('SELECT id,body,revision,audience_json FROM academy_content ORDER BY id').all();
    const importPack=()=>seedFoundations(ctx.db,admin.user_id,ctx);
    await t.test('importação é idempotente, respeita edições e não fabrica estudo ou XP',()=>{
      assert.deepEqual(importPack(),{created:16,upgraded:5});
      assert.deepEqual(importPack(),{created:0,upgraded:0});
      assert.equal(ctx.learningFlows.adminGet(admin,'percurso-digital').description,'Curadoria feita pela gestão');
      assert.equal(ctx.learningFlows.adminGet(admin,'percurso-supervisor-pops-curadoria').status,'draft');
      for(const row of original)assert.deepEqual(ctx.db.prepare('SELECT id,body,revision,audience_json FROM academy_content WHERE id=?').get(row.id),row);
      assert.equal(ctx.db.prepare('SELECT COUNT(*) n FROM academy_material_study').get().n,0);
      assert.equal(ctx.db.prepare('SELECT COUNT(*) n FROM academy_xp').get().n,0);
      for(const lesson of foundationLessons)assert(ctx.contents.adminRecord(lesson.id).body.length<=10000);
    });
    await t.test('ramos liberam pela relação entre estudos; prática exige oferta e habilidades',()=>{
      const graph=()=>ctx.learningFlows.get(seller,'percurso-pap');
      const state=id=>graph().nodes.find(n=>n.id===id);
      const complete=id=>{ctx.learningFlows.assertAccess(seller,'material',id);ctx.readings.complete(seller,id,{version:ctx.readings.detailStudy(seller,id).version,completed:true});};
      assert.equal(state('diagnostico').locked,false);assert.equal(state('recomendacao').locked,true);
      assert.equal(state('caso-canal').locked,true);assert.equal(state('rotina').required,false);
      complete('st1-catalogo-pap');assert.equal(state('recomendacao').locked,true);
      complete('st1-formacao-diagnostico');assert.equal(state('recomendacao').locked,false);
      complete('st1-formacao-recomendacao');assert.equal(state('objecoes').locked,false);assert.equal(state('continuidade').locked,true);
      complete('st1-formacao-objecoes');assert.equal(state('caso-canal').locked,true);
      complete('st1-processo-pap');complete('st1-formacao-continuidade');assert.equal(state('caso-canal').locked,false);
      assert.equal(state('certificacao').locked,true);
    });
    await t.test('Supervisor tem estudos acessíveis; POPs privados e casos de outro canal permanecem privados',()=>{
      const graph=()=>ctx.learningFlows.get(supervisor,'percurso-supervisor');
      assert.equal(graph().nodes.find(n=>n.id==='metas').locked,false);
      assert.equal(graph().nodes.find(n=>n.id==='diagnostico').locked,true);
      assert.throws(()=>ctx.learningFlows.get(seller,'percurso-supervisor'),e=>e.status===404);
      assert.throws(()=>ctx.contents.detail(supervisor,privatePop.id),e=>e.status===404);
      assert.throws(()=>ctx.contents.detail(seller,'st1-formacao-supervisor-coaching'),e=>e.status===404);
      assert.throws(()=>ctx.contents.detail(seller,'st1-formacao-caso-pme'),e=>e.status===404);
      const lesson=ctx.contents.detail(supervisor,'st1-formacao-supervisor-metas');ctx.readings.complete(supervisor,lesson.id,{version:ctx.readings.forItem(supervisor,lesson).version,completed:true});
      assert.equal(graph().nodes.find(n=>n.id==='diagnostico').locked,false);
    });
    await t.test('Pesquisa de Mercado exige liberação BI explícita e herda a restrição do módulo',async()=>{
      assert(!defaultPermissions('seller').includes('strategy'));assert(!defaultPermissions('supervisor').includes('strategy'));
      for(const person of [seller,supervisor]){
        assert(!ctx.modules.visible(person).some(m=>m.id==='pesquisa-mercado-st1'));
        assert(!ctx.contents.visible(person).some(c=>c.id==='st1-formacao-mercado'));
        assert.throws(()=>ctx.contents.detail(person,'st1-formacao-mercado'),e=>e.status===404);
      }
      assert(!ctx.learningFlows.get(supervisor,'percurso-supervisor').nodes.some(n=>n.targetId==='st1-formacao-mercado'));
      const inherited=ctx.contents.create(admin.user_id,{title:'Estudo exclusivo de BI',body:'ESTRATEGIA_PRIVADA',kind:'text',tracks:['pap'],modules:['pesquisa-mercado-st1'],audience:['seller','supervisor'],status:'published',scope:'general'});
      assert.equal(inherited.scope,'strategy');assert.throws(()=>ctx.contents.detail(seller,inherited.id),e=>e.status===404);
      const bi=await signup('bi','seller');ctx.access.updateMember(admin.user_id,bi.user_id,{role:'seller',tracks:[],permissions:[...defaultPermissions('seller'),'strategy'],enabled:true});
      const authorized=readProfile(ctx.db,bi.user_id);
      assert(ctx.modules.visible(authorized).some(m=>m.id==='pesquisa-mercado-st1'));assert.equal(ctx.contents.detail(authorized,'st1-formacao-mercado').scope,'strategy');
      assert.equal(ctx.contents.detail(authorized,inherited.id).body,'ESTRATEGIA_PRIVADA');
    });
  }finally{await new Promise(resolve=>server.close(resolve));ctx.db.close();await rm(dataDir,{recursive:true,force:true});}
});
test('Leitor de aulas aceita estrutura legível e mantém HTML e scripts como texto',()=>{
  const rendered=renderLessonReading('## Uma aula\n\nTexto <script>alert(1)</script>.\n\n- Uma ação\n- <img src=x onerror=alert(1)>');
  assert(rendered.includes('<h2>Uma aula</h2>'));assert(rendered.includes('<ul><li>Uma ação</li>'));assert(!rendered.includes('<script>'));assert(!rendered.includes('<img '));
  assert.equal(renderLessonReading('Texto <b>simples</b>'),'<article class="content-reading">Texto &lt;b&gt;simples&lt;/b&gt;</article>');
});
