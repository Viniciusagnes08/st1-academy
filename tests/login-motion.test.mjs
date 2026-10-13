import {test} from 'node:test';
import assert from 'node:assert/strict';
import {motionState} from '../public/assets/login-motion-policy.js';

test('Sem escolha explícita, o login acompanha a preferência de movimento do dispositivo',()=>{
  assert.deepEqual(motionState(null,true),{preference:'auto',enabled:false});
  assert.deepEqual(motionState(null,false),{preference:'auto',enabled:true});
  for(const value of ['invalid','true','{"enabled":true}'])assert.deepEqual(motionState(value,true),{preference:'auto',enabled:false});
});

test('A escolha anterior de efeitos completos continua válida',()=>{
  assert.equal(motionState('full',true).enabled,true);
  assert.equal(motionState('full',false).enabled,true);
});

test('A preferência antiga de pausa não paralisa o login depois da retirada do botão',()=>{
  assert.equal(motionState('paused',true).enabled,false);
  assert.equal(motionState('paused',false).enabled,true);
});
