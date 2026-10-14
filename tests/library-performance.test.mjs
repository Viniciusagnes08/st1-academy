import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,dirname,basename} from 'node:path';
import {randomBytes} from 'node:crypto';
import {createApp} from '../server.mjs';
import {readProfile} from '../lib/access.mjs';

test('Biblioteca usa leituras em lote e confere acesso e versão novamente a cada solicitação',async t=>{
  const dataDir=await mkdtemp(resolve(tmpdir(),'st1-library-performance-')),baseURL='http://localhost:4268';
  const {app,ctx}=await createApp({dataDir,baseURL,testMode:true,includeLibrary:false,googleConfig:{clientId:'',clientSecret:''}});
  const server=await new Promise(done=>{const s=app.listen(4268,'127.0.0.1',()=>done(s));});
  const request=async(who,path)=>{const response=await fetch(baseURL+path,{headers:{Origin:baseURL,Connection:'close',...(who?{Cookie:who.cookie}:{})}});return {status:response.status,data:await response.json()};};
  const signup=async(key,role,permissions)=>{const email=key+'@batch.example',inv=ctx.createInvitation({name:'QA '+key,email,role,tracks:['pap'],permissions});const response=await fetch(baseURL+'/api/auth/sign-up/email',{method:'POST',headers:{Origin:baseURL,Connection:'close','Content-Type':'application/json','x-academy-invite':new URL(inv.url).searchParams.get('convite')},body:JSON.stringify({name:'QA',email,password:randomBytes(24).toString('base64url')})});assert.equal(response.status,200);return {id:(await response.json()).user.id,cookie:response.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ')};};
  try{
    const admin=await signup('admin','admin'),seller=await signup('seller','seller'),restricted=await signup('restricted','seller',['assessments']);
    const adminProfile=()=>readProfile(ctx.db,admin.id),sellerProfile=()=>readProfile(ctx.db,seller.id);
    const make=(i,extra={})=>ctx.contents.create(admin.id,{title:'Material de estudo '+i,body:'Texto da versão inicial '+i,summary:'Resumo do material',kind:'text',tracks:['pap'],audience:['seller','supervisor'],status:'published',...extra});
    const materials=Array.from({length:20},(_,i)=>make(i));
    const originalPrepare=ctx.db.prepare.bind(ctx.db);let queries=[];
    ctx.db.prepare=sql=>{const statement=originalPrepare(sql);return new Proxy(statement,{get(target,key){const value=Reflect.get(target,key);if(typeof value!=='function')return value;return (...args)=>{if(['get','all','run','iterate'].includes(key)&&/^\s*SELECT/i.test(sql)&&/academy_(content|module|reading|material_study|resource_tag|learning_flow|quiz|attempt|certificate)/.test(sql))queries.push(sql);return value.apply(target,args);};}});};
    const measured=async who=>{queries=[];const result=await request(who,'/api/library');return {...result,queries:queries.length};};
    await t.test('crescer de 20 para 80 materiais não cria uma consulta por material',async()=>{
      const small=await measured(admin);assert.equal(small.status,200);assert.equal(small.data.items.length,20);
      materials.push(...Array.from({length:60},(_,i)=>make(i+20)));
      const large=await measured(admin);assert.equal(large.status,200);assert.equal(large.data.items.length,80);
      assert.ok(large.queries<=25,'Leituras inesperadas: '+large.queries);assert.ok(large.queries<=small.queries+2,JSON.stringify({small:small.queries,large:large.queries}));
      assert.equal('body' in large.data.items[0],false);assert.equal('url' in large.data.items[0],false);
    });
    await t.test('o lote conserva conclusão por pessoa e exige novo estudo ao mudar o corpo',async()=>{
      const id=materials[0].id,profile=sellerProfile(),item=ctx.contents.detail(profile,id);
      ctx.readings.complete(profile,id,{version:ctx.readings.forItem(profile,item).version,completed:true});
      assert.equal((await measured(seller)).data.items.find(v=>v.id===id).study.completed,true);
      assert.equal((await measured(admin)).data.items.find(v=>v.id===id).study.completed,false);
      ctx.contents.update(admin.id,id,{revision:item.revision,body:'Uma nova versão exige estudo.'});
      assert.equal((await measured(seller)).data.items.find(v=>v.id===id).study.completed,false);
    });
    await t.test('rascunhos, BI, público e trilhas permanecem privados na API combinada',async()=>{
      for(const extra of [{status:'draft'},{scope:'strategy'},{audience:[]},{tracks:['pme']}])make('reservado'+JSON.stringify(extra),extra);
      assert.equal((await measured(seller)).data.items.length,80);
      assert.equal((await request(null,'/api/library')).status,401);assert.equal((await request(null,'/api/bootstrap')).status,401);
      assert.equal((await measured(restricted)).status,403);
      const bootstrap=await request(seller,'/api/bootstrap'),legacy=await request(seller,'/api/me');
      assert.equal(bootstrap.status,200);assert.deepEqual(bootstrap.data.user,legacy.data);assert.deepEqual(bootstrap.data.catalog.tracks.map(v=>v.id),['pap']);
    });
    await t.test('bloqueio e conclusão dos pré-requisitos são recalculados entre acessos',async()=>{
      const first=materials[1],second=materials[2];
      ctx.learningFlows.save(adminProfile(),null,{title:'Percurso em lote',trackId:'pap',status:'published',audience:['seller','supervisor'],nodes:[{id:'inicio',kind:'start',title:'Comece aqui'},{id:'estudo',kind:'material',title:'Primeiro estudo',targetId:first.id},{id:'proximo',kind:'material',title:'Próximo estudo',targetId:second.id}],edges:[{from:'inicio',to:'estudo'},{from:'estudo',to:'proximo'}]});
      assert.equal((await measured(seller)).data.items.find(v=>v.id===second.id).flow.locked,true);
      const p=sellerProfile(),detail=ctx.contents.detail(p,first.id);ctx.readings.complete(p,first.id,{version:ctx.readings.forItem(p,detail).version,completed:true});
      assert.equal((await measured(seller)).data.items.find(v=>v.id===second.id).flow.locked,false);
      ctx.db.prepare('UPDATE academy_member SET permissions_json=? WHERE user_id=?').run('[]',seller.id);
      assert.equal((await measured(seller)).status,403);
      ctx.db.prepare('UPDATE academy_member SET enabled=0 WHERE user_id=?').run(seller.id);
      assert.equal((await request(seller,'/api/bootstrap')).status,403);
    });
  }finally{await new Promise(done=>server.close(done));ctx.db.close();assert.equal(dirname(dataDir),resolve(tmpdir()));assert.ok(basename(dataDir).startsWith('st1-library-performance-'));await rm(dataDir,{recursive:true,force:true});}
});
