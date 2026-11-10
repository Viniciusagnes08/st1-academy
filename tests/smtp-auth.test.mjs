import {test} from 'node:test';
import assert from 'node:assert/strict';
import {smtpPasswordForAuth} from '../lib/smtp-auth.mjs';

test('senha de app Google remove espaços de formatação sem alterar senhas SMTP comuns',()=>{
  assert.equal(smtpPasswordForAuth('smtp.gmail.com','abcd efgh ijkl mnop'),'abcdefghijklmnop');
  assert.equal(smtpPasswordForAuth('smtp.googlemail.com',' abcd\nefgh\tijkl mnop '),'abcdefghijklmnop');
  assert.equal(smtpPasswordForAuth('mail.example.test','keep these spaces'),'keep these spaces');
});

