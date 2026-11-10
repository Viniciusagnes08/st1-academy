import {test} from 'node:test';
import assert from 'node:assert/strict';
import {emailAutomationCatalog,renderEmailAutomationTemplate} from '../lib/email-automation-catalog.mjs';

test('catálogo mantém vinte modelos e chaves únicas',()=>{
  assert.equal(emailAutomationCatalog.length,20);
  assert.equal(new Set(emailAutomationCatalog.map(item=>item.key)).size,20);
});

test('modelo só é renderizado com todos os dados reais',()=>{
  const welcome=emailAutomationCatalog.find(item=>item.key==='welcome');
  assert.throws(()=>renderEmailAutomationTemplate(welcome,{primeiro_nome:'Ana'}),/Falta o dado real/);
  const rendered=renderEmailAutomationTemplate(welcome,{primeiro_nome:'Ana',trilha:'PAP',aula_inicial:'Comece aqui'});
  assert.match(rendered.subject,/Ana/);
  assert.match(rendered.bodyMarkdown,/Comece aqui/);
  assert.doesNotMatch(rendered.bodyMarkdown,/\{\{/);
});
