import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';

test('Central de Integrações expõe configuração, teste e saúde de GlitchTip n8n e OpenPanel',async()=>{
  const source=await readFile(resolve('public/assets/integrations.js'),'utf8');
  for(const text of ['GlitchTip','n8n','OpenPanel','GLITCHTIP_DSN','N8N_WEBHOOK_URL','OPENPANEL_CLIENT_ID','/api/admin/integrations/health','/api/admin/integrations/deliveries','data-test-integration','data-retry-delivery'])assert.equal(source.includes(text),true,'faltou '+text);
  await import('../public/assets/integrations.js');
});
