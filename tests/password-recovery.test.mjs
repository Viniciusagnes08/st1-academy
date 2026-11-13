import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {createPasswordRecoveryLimiter,RECOVERY_WINDOW_MS} from '../lib/password-recovery.mjs';
import {resetMailContent,passwordChangedMailContent,createPasswordResetMailer} from '../lib/password-reset-mail.mjs';

test('throttle persiste por conta e IP sem gravar e-mails ou IPs em texto claro',()=>{
  const db=new DatabaseSync(':memory:');let now=1000000;
  const opts={secret:'chave-de-testes-com-pelo-menos-32-caracteres',clock:()=>now};
  try{
    const first=createPasswordRecoveryLimiter(db,opts);
    const email='teste@example.test';
    for(let i=0;i<3;i++)assert.equal(first.permit(email,'192.0.2.1'),true);
    assert.equal(first.permit(email,'192.0.2.1'),false);
    // Outras origens continuam limitadas pela conta, não apenas pelo endereço de IP.
    assert.equal(first.permit('  TESTE@EXAMPLE.TEST  ','192.0.2.2'),false);
    assert.equal(first.permit('outro@example.test','192.0.2.1'),true);
    const rows=db.prepare('SELECT fingerprint,window_start,hits FROM academy_password_recovery_limit').all();
    assert.equal(rows.length,3);
    assert.ok(rows.every(row=>!row.fingerprint.includes('example.test')&&!row.fingerprint.includes('192.0.2.')));
    const second=createPasswordRecoveryLimiter(db,opts);
    assert.equal(second.permit('teste@example.test','192.0.2.3'),false);
    now+=RECOVERY_WINDOW_MS+1;
    assert.equal(second.permit('teste@example.test','192.0.2.3'),true);
    for(let i=0;i<9;i++)assert.equal(second.permit('conta-'+i+'@example.test','192.0.2.4'),true);
    assert.equal(second.permit('ultima@example.test','192.0.2.4'),true);
    assert.equal(second.permit('limite@example.test','192.0.2.4'),false);
    assert.equal(second.permit('malformado','192.0.2.5'),false);
  }finally{db.close();}
});

test('e-mails de segurança escapam HTML e nunca enviam senha',()=>{
  const token='token-sintetico-apenas-para-teste';
  const link='https://academy.example/reset-password?token='+token;
  const reset=resetMailContent({name:'<img src=x onerror=alert(1)>',url:link});
  assert.match(reset.html,/&lt;img/);
  assert.doesNotMatch(reset.html,/<img src=x onerror/);
  assert.match(reset.text,/30 minutos/);
  assert.match(reset.text,/token-sintetico/);
  const changed=passwordChangedMailContent({name:'Ana'});
  assert.match(changed.text,/sessões anteriores foram encerradas/);
  assert.doesNotMatch(changed.text,/token-sintetico/);
  assert.throws(()=>resetMailContent({name:'Ana',url:'http://example.com/reset?token=teste'}),/não confiável/);
  assert.equal(createPasswordResetMailer({}),null);
});
