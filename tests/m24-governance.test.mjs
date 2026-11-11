import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {createM24Governance} from '../lib/m24-governance.mjs';

const setup=()=>{
  const db=new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE academy_content(id TEXT PRIMARY KEY,title TEXT,revision INTEGER,status TEXT,scope TEXT,tracks_json TEXT,deleted_at TEXT);
    INSERT INTO academy_content VALUES('c','Material autorizado',3,'published','general','["pap"]',NULL)`);
  const service=createM24Governance(db),actor='owner';
  const source=service.createSource(actor,{title:'Manual oficial de teste',type:'manual_interno',reference:'https://example.test/manual',version:'v1'});
  const metadata=()=>({revision:service.detail('c').revision,contentRevision:3,curator:'Curadoria',criticality:'comercial_critico',sourceIds:[source.id],nextReviewOn:'2099-01-01'});
  const request=(action,extra={})=>service.review(actor,'c',{action,revision:service.detail('c').revision,contentRevision:3,requestKey:crypto.randomUUID(),reason:'Revisão de teste com fonte conferida',...extra});
  return {db,service,source,actor,metadata,request};
};
test('legado preservado, ficha e aprovação não alteram conteúdo publicado',()=>{
  const x=setup();try{
    assert.equal(x.service.detail('c').effectiveState,'legacy_unreviewed');
    x.service.save(x.actor,'c',x.metadata());x.request('request');
    assert.throws(()=>x.request('approve'),/exceção/i);
    const result=x.request('approve',{selfReviewReason:'Piloto conduzido pelo único responsável'});
    assert.equal(result.effectiveState,'approved');assert.equal(result.history.length,3);
    assert.equal(x.db.prepare('SELECT status,revision FROM academy_content').get().status,'published');
    x.db.prepare('UPDATE academy_content SET revision=4').run();
    assert.equal(x.service.detail('c').effectiveState,'review_due');
  }finally{x.db.close();}
});
test('concorrência e repetição não duplicam decisões ou sobrescrevem dados',()=>{
  const x=setup();try{
    x.service.save(x.actor,'c',x.metadata());
    assert.throws(()=>x.service.save(x.actor,'c',{...x.metadata(),revision:0}),e=>e.status===409);
    const input={action:'request',revision:1,contentRevision:3,requestKey:crypto.randomUUID(),reason:'Conferir fonte'};
    const first=x.service.review(x.actor,'c',input);
    assert.deepEqual(x.service.review(x.actor,'c',input),first);
    assert.throws(()=>x.service.review(x.actor,'c',{...input,action:'block'}),e=>e.status===409);
    assert.equal(x.service.detail('c').history.length,2);
    assert.throws(()=>x.request('approve',{contentRevision:2,selfReviewReason:'Piloto individual'}),e=>e.status===409);
    assert.equal(x.service.detail('c').state,'pending_review');
  }finally{x.db.close();}
});
test('validade e fonte alterada invalidam aprovação, bloqueio exige justificativa',()=>{
  const x=setup();try{
    x.service.save(x.actor,'c',x.metadata());x.request('request');x.request('approve',{selfReviewReason:'Piloto individual'});
    x.service.updateSource(x.actor,x.source.id,{revision:0,title:x.source.title,type:x.source.type,reference:x.source.reference,version:'v2'});
    assert.equal(x.service.detail('c').effectiveState,'review_due');
    assert.throws(()=>x.request('request'),e=>e.status===409);
    x.service.save(x.actor,'c',x.metadata());x.request('request');x.request('approve',{selfReviewReason:'Piloto individual'});
    x.db.prepare("UPDATE academy_m24_governance SET next_review_on='2000-01-01' WHERE content_id='c'").run();
    assert.equal(x.service.detail('c').effectiveState,'review_due');
    assert.throws(()=>x.request('block',{reason:''}),e=>e.status===400);
    assert.equal(x.request('block').effectiveState,'blocked');
    assert.throws(()=>x.request('approve',{selfReviewReason:'Piloto individual'}),/solicite/i);
  }finally{x.db.close();}
});
test('metadados e referências rejeitam valores inválidos sem gravação parcial',()=>{
  const x=setup();try{
    for(const patch of [{nextReviewOn:'2027-02-31'},{sourceIds:['missing']},{criticality:'invalid'},{curator:''}])assert.throws(()=>x.service.save(x.actor,'c',{...x.metadata(),...patch}),e=>e.status===400);
    for(const reference of ['javascript:alert(1)','https://user:pass@example.test','https://example.test/?token=secret'])assert.throws(()=>x.service.createSource(x.actor,{title:'Fonte inválida',type:'manual_interno',reference,version:'1'}));
    assert.equal(x.service.detail('c').history.length,0);
    assert.throws(()=>x.service.detail('missing'),e=>e.status===404);
    assert.equal(x.service.inventory({search:'inexistente'}).total,0);
    assert.throws(()=>x.service.inventory({limit:'999'}),e=>e.status===400);
  }finally{x.db.close();}
});

test('falha na auditoria reverte a decisão e sua chave de repetição',()=>{
  const x=setup();try{
    x.service.save(x.actor,'c',x.metadata());x.request('request');
    const before=x.service.detail('c');
    x.db.exec("CREATE TRIGGER refuse_m24_event BEFORE INSERT ON academy_m24_event BEGIN SELECT RAISE(ABORT,'audit unavailable'); END");
    assert.throws(()=>x.request('approve',{selfReviewReason:'Piloto individual'}),/audit unavailable/);
    assert.equal(x.service.detail('c').revision,before.revision);
    assert.equal(x.service.detail('c').state,'pending_review');
    assert.equal(x.service.detail('c').history.length,before.history.length);
    assert.equal(x.db.prepare('SELECT count(*) n FROM academy_m24_request').get().n,1);
  }finally{x.db.close();}
});

test('bloqueio sobrevive à edição de metadados e dados sobrevivem à recriação do serviço',()=>{
  const x=setup();try{
    x.service.save(x.actor,'c',x.metadata());x.request('block');
    const result=x.service.save(x.actor,'c',x.metadata());
    assert.equal(result.effectiveState,'blocked');
    const reloaded=createM24Governance(x.db);
    assert.equal(reloaded.detail('c').effectiveState,'blocked');
    assert.equal(reloaded.sources().length,1);
    assert.equal(reloaded.detail('c').history.length,3);
  }finally{x.db.close();}
});
