import {readFileSync} from 'node:fs';
import {PostgresDatabase} from '../lib/postgres-db.mjs';
import {uploadSchema} from '../lib/uploads.mjs';

if(!process.env.DATABASE_URL)throw new Error('Configure DATABASE_URL somente no ambiente privado do servidor.');
const db=new PostgresDatabase({url:process.env.DATABASE_URL,schema:process.env.ACADEMY_DATABASE_SCHEMA||'academy',runtimeOnly:true,ssl:{ca:readFileSync(new URL('../config/supabase-root-ca.crt',import.meta.url),'utf8')}});
try{
  const snapshot=db.schemaSnapshot(),names=new Set(snapshot.tables.map(table=>table.name));
  for(const table of ['user','account','session','academy_member','academy_content','academy_learning_flow'])if(!names.has(table))throw new Error('O banco de origem da Academy não foi identificado.');
  const admins=db.prepare("SELECT count(*) AS n FROM academy_member WHERE role='admin' AND enabled=1").get().n;
  if(!admins)throw new Error('O banco precisa preservar pelo menos um Admin ativo.');
  const pending=['academy_upload','academy_upload_part'].filter(table=>!names.has(table));
  if(process.argv.includes('--apply'))db.exec(uploadSchema);
  const after=new Set(db.schemaSnapshot().tables.map(table=>table.name));
  console.log(JSON.stringify({mode:process.argv.includes('--apply')?'applied':'check-only',pendingTables:pending,uploadTablesReady:['academy_upload','academy_upload_part'].every(name=>after.has(name)),adminsPreserved:db.prepare("SELECT count(*) AS n FROM academy_member WHERE role='admin' AND enabled=1").get().n===admins,credentialsChanged:false,dataReimported:false},null,2));
}finally{db.close();}
