import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {createOnboardingService} from '../lib/onboarding.mjs';

test('diagnóstico preserva acesso e prioriza trilha do setor',()=>{
  const db=new DatabaseSync(':memory:');
  db.exec("CREATE TABLE user(id TEXT PRIMARY KEY,name TEXT,email TEXT); INSERT INTO user VALUES('u','Pessoa PAP','u@example.test')");
  const service=createOnboardingService(db,{tracks:[{id:'digital',name:'Digital'},{id:'pap',name:'PAP'}]});
  const answers={sector:'PAP',role:'Vendedor(a)',goal:'Supervisor(a)',dream:'Liderar uma equipe',challenges:['Abordagem','Objeções'],squad:'Equipe 1'};
  assert.equal(service.read('u'),null);
  assert.throws(()=>service.save('u',{...answers,sector:'Outro canal'}));
  service.save('u',answers);
  const viewer={tracks:['pap']},plan=service.recommend(viewer,service.read('u'));
  assert.deepEqual(plan.current.map(t=>t.id),['pap']);
  assert.deepEqual(plan.next.map(t=>t.id),['digital']);
  assert.equal(service.adminList()[0].answers.goal,'Supervisor(a)');
  assert.deepEqual(viewer.tracks,['pap']);
  db.close();
});

