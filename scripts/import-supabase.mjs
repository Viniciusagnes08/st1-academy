import {importSupabase} from '../lib/supabase-transfer.mjs';
const args=process.argv.slice(2),bundle=args.includes('--bundle')?args[args.indexOf('--bundle')+1]:null;
if(!bundle||!process.env.DATABASE_URL||!process.env.ACADEMY_BASE_URL)throw new Error('Configure as variáveis privadas DATABASE_URL e ACADEMY_BASE_URL; execute node --env-file=ARQUIVO_PRIVADO scripts/import-supabase.mjs --bundle PASTA_PRIVADA_TRANSFERIDA.');
console.log(JSON.stringify(await importSupabase(bundle,{url:process.env.DATABASE_URL,schema:process.env.ACADEMY_DATABASE_SCHEMA||'academy',baseURL:process.env.ACADEMY_BASE_URL}),null,2));
