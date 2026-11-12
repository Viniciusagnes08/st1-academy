import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {createAttemptLimitService} from '../lib/attempt-limits.mjs';

test('three attempts per assessment and version; linked supervisor and admin grant exactly one extra',()=>{
  const db=new DatabaseSync(':memory:');
  try{
    db.exec(`PRAGMA foreign_keys=ON;
      CREATE TABLE user(id TEXT PRIMARY KEY,name TEXT NOT NULL,email TEXT NOT NULL);
      CREATE TABLE academy_member(user_id TEXT PRIMARY KEY REFERENCES user(id),role TEXT NOT NULL,enabled INTEGER NOT NULL,tracks_json TEXT NOT NULL,permissions_json TEXT NOT NULL);
      CREATE TABLE academy_supervision(supervisor_id TEXT NOT NULL,seller_id TEXT NOT NULL,PRIMARY KEY(supervisor_id,seller_id));
      CREATE TABLE academy_attempt(id TEXT PRIMARY KEY,user_id TEXT NOT NULL,track_id TEXT NOT NULL,version TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'complete');
      CREATE TABLE academy_quiz(id TEXT PRIMARY KEY,title TEXT NOT NULL,version INTEGER NOT NULL,tracks_json TEXT NOT NULL);
      CREATE TABLE academy_quiz_attempt(id TEXT PRIMARY KEY,user_id TEXT NOT NULL,quiz_id TEXT NOT NULL,version INTEGER NOT NULL,status TEXT NOT NULL DEFAULT 'complete',expires_at TEXT);
    `);
    for(const [id,role] of [['admin','admin'],['supervisor','supervisor'],['otherSupervisor','supervisor'],['seller','seller'],['peer','seller']]){
      db.prepare('INSERT INTO user(id,name,email) VALUES(?,?,?)').run(id,id,id+'@example.test');
      db.prepare('INSERT INTO academy_member(user_id,role,enabled,tracks_json,permissions_json) VALUES(?,?,?,?,?)').run(id,role,1,'["pap"]','["assessments","team_results"]');
    }
    db.prepare('INSERT INTO academy_supervision(supervisor_id,seller_id) VALUES(?,?)').run('supervisor','seller');
    db.prepare('INSERT INTO academy_quiz(id,title,version,tracks_json) VALUES(?,?,?,?)').run('etapa-pap-0','Prática PAP',1,'["pap"]');
    const bank={tracks:[{id:'pap',name:'PAP',version:'2026-11'}]};
    const events=[];
    const access={audit:(...args)=>events.push(args)};
    const limits=createAttemptLimitService(db,bank,access);
    const who=id=>({user_id:id,role:id==='admin'?'admin':id.endsWith('Supervisor')||id==='supervisor'?'supervisor':'seller',enabled:1,tracks:['pap'],permissions:['assessments','team_results']});
    const add=(kind,id,version,n)=>db.prepare(kind==='certificate'?'INSERT INTO academy_attempt(id,user_id,track_id,version) VALUES(?,?,?,?)':'INSERT INTO academy_quiz_attempt(id,user_id,quiz_id,version) VALUES(?,?,?,?)').run('attempt-'+kind+'-'+n,'seller',id,version);
    for(let n=1;n<=3;n++){
      limits.assertAvailable('seller','certificate','pap','2026-11');
      add('certificate','pap','2026-11',n);
    }
    assert.equal(limits.status(who('seller'),'certificate','pap').used,3);
    assert.equal(limits.status(who('seller'),'certificate','pap').remaining,0);
    assert.throws(()=>limits.assertAvailable('seller','certificate','pap','2026-11'),e=>e.status===423);
    assert.throws(()=>limits.grant(who('seller'),{userId:'seller',kind:'certificate',id:'pap',reason:'Revisou os conteúdos'}),e=>e.status===403);
    assert.throws(()=>limits.grant(who('otherSupervisor'),{userId:'seller',kind:'certificate',id:'pap',reason:'Revisou os conteúdos'}),e=>e.status===403);
    assert.throws(()=>limits.grant(who('supervisor'),{userId:'peer',kind:'certificate',id:'pap',reason:'Revisou os conteúdos'}),e=>e.status===403);
    assert.throws(()=>limits.grant(who('supervisor'),{userId:'seller',kind:'certificate',id:'pap',reason:'Curto'}),e=>e.status===400);
    const grant=limits.grant(who('supervisor'),{userId:'seller',kind:'certificate',id:'pap',reason:'Acompanhamento supervisionado e revisão das regras críticas.'});
    assert.equal(grant.quota.remaining,1);
    assert.equal(events.length,1);
    assert.equal(db.prepare('SELECT actor_id FROM academy_attempt_grant').get().actor_id,'supervisor');
    assert.throws(()=>limits.grant(who('supervisor'),{userId:'seller',kind:'certificate',id:'pap',reason:'Autorizar novamente antes de usar'}),e=>e.status===409);
    limits.assertAvailable('seller','certificate','pap','2026-11');
    add('certificate','pap','2026-11',4);
    assert.throws(()=>limits.assertAvailable('seller','certificate','pap','2026-11'),e=>e.status===423);
    limits.grant(who('admin'),{userId:'seller',kind:'certificate',id:'pap',reason:'Nova tentativa após acompanhamento especializado'});
    assert.equal(limits.status(who('seller'),'certificate','pap').remaining,1);
    const q=limits.status(who('seller'),'quiz','etapa-pap-0');
    assert.equal(q.remaining,3);
    for(let n=1;n<=3;n++)add('quiz','etapa-pap-0',1,n);
    assert.throws(()=>limits.assertAvailable('seller','quiz','etapa-pap-0',1),e=>e.status===423);
    assert.equal(limits.blocked(who('supervisor')).length,1);
    limits.grant(who('supervisor'),{userId:'seller',kind:'quiz',id:'etapa-pap-0',reason:'Realizada nova revisão do módulo PAP'});
    assert.equal(limits.status(who('seller'),'quiz','etapa-pap-0').remaining,1);
    db.prepare('UPDATE academy_quiz SET version=2 WHERE id=?').run('etapa-pap-0');
    assert.equal(limits.status(who('seller'),'quiz','etapa-pap-0').remaining,3);
    assert.equal(limits.status(who('seller'),'quiz','etapa-pap-0').used,0);
    assert.equal(db.prepare('SELECT count(*) n FROM academy_quiz_attempt').get().n,3);
    assert.throws(()=>limits.status(who('otherSupervisor'),'certificate','pap','seller'),e=>e.status===404);
  }finally{db.close();}
});
