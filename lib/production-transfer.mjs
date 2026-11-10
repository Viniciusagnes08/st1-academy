import {backup,DatabaseSync} from 'node:sqlite';
import {constants,copyFileSync,existsSync,mkdirSync,readFileSync,readdirSync,renameSync,rmdirSync,statSync,unlinkSync,writeFileSync,chmodSync} from 'node:fs';
import {resolve,relative,sep} from 'node:path';
import {createHash} from 'node:crypto';

const format='st1-academy-production-v1';
const files=['academy.sqlite','.auth-secret'];
const fingerprint=bytes=>createHash('sha256').update(bytes).digest('hex');
const hasTable=(db,name)=>!!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name);
const count=(db,name)=>hasTable(db,name)?db.prepare('SELECT count(*) n FROM "'+name+'"').get().n:0;
const preservedTables=['user','academy_member','academy_supervision','academy_access_audit','academy_content','academy_content_asset','academy_module','academy_quiz','academy_learning_flow','academy_game_rules','academy_profile_rules','academy_squad','academy_squad_member','academy_squad_request','academy_personal_profile','academy_onboarding','academy_profile_media','academy_design','academy_resource_tag','academy_agenda_item','academy_agenda_assignment','academy_agenda_submission','academy_reading','academy_material_study','academy_study_day'];
const tableDigest=(db,name)=>{
  if(!hasTable(db,name))return null;
  const hash=createHash('sha256');
  for(const row of db.prepare('SELECT * FROM "'+name+'" ORDER BY rowid').iterate()){
    const value=Object.fromEntries(Object.entries(row).map(([key,value])=>[key,value instanceof Uint8Array?{sha256:fingerprint(value),bytes:value.length}:value]));
    hash.update(JSON.stringify(value)+'\n');
  }
  return hash.digest('hex');
};
const passwordDigest=db=>fingerprint(JSON.stringify(db.prepare("SELECT id,userId,accountId,providerId,password FROM account WHERE providerId='credential' ORDER BY id").all()));
function checkDatabase(db){
  if(db.prepare('PRAGMA quick_check').get().quick_check!=='ok'||db.prepare('PRAGMA foreign_key_check').all().length)throw new Error('O banco da transferência não passou na verificação de integridade.');
  if(!db.prepare("SELECT 1 FROM academy_member WHERE role='admin' AND enabled=1").get())throw new Error('A transferência precisa preservar um Admin ativo.');
  for(const table of ['academy_content_asset','academy_profile_media','academy_message_asset']){
    if(hasTable(db,table))for(const asset of db.prepare('SELECT sha256,bytes FROM '+table).iterate())if(fingerprint(asset.bytes)!==asset.sha256)throw new Error('Um arquivo da transferência não corresponde ao hash registrado.');
  }
}

// A cópia do piloto permanece privada. Este processo nunca altera o banco de origem.
export async function exportProduction(sourceDir,outputDir){
  sourceDir=resolve(sourceDir);outputDir=resolve(outputDir);
  const relation=relative(sourceDir,outputDir);
  if(relation===''||!relation.startsWith('..'+sep)&&relation!=='..'&&!relation.includes(':'))throw new Error('Guarde a transferência fora do diretório do banco original.');
  if(existsSync(outputDir)&&readdirSync(outputDir).length)throw new Error('Use uma pasta nova para a transferência; nenhum arquivo será sobrescrito.');
  mkdirSync(outputDir,{recursive:true,mode:0o700});
  const source=new DatabaseSync(resolve(sourceDir,'academy.sqlite'),{readOnly:true});
  try{
    if(source.prepare("SELECT value FROM academy_settings WHERE key='environment'").get()?.value!=='test')throw new Error('Este exportador separa somente um piloto de sua primeira publicação. Use backup para um banco já de produção.');
    await backup(source,resolve(outputDir,'piloto-preservado.sqlite'));
    chmodSync(resolve(outputDir,'piloto-preservado.sqlite'),0o600);
  }finally{source.close();}
  copyFileSync(resolve(sourceDir,'.auth-secret'),resolve(outputDir,'piloto-auth-secret'),constants.COPYFILE_EXCL);
  chmodSync(resolve(outputDir,'piloto-auth-secret'),0o600);
  const bundle=resolve(outputDir,'transferencia');mkdirSync(bundle,{mode:0o700});
  copyFileSync(resolve(outputDir,'piloto-preservado.sqlite'),resolve(bundle,'academy.sqlite'),constants.COPYFILE_EXCL);
  copyFileSync(resolve(outputDir,'piloto-auth-secret'),resolve(bundle,'.auth-secret'),constants.COPYFILE_EXCL);
  for(const name of files)chmodSync(resolve(bundle,name),0o600);
  const db=new DatabaseSync(resolve(bundle,'academy.sqlite'));
  let removed,preserved;
  try{
    db.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=DELETE;');checkDatabase(db);
    const before=Object.fromEntries(preservedTables.map(name=>[name,tableDigest(db,name)])),passwords=passwordDigest(db);
    removed=Object.fromEntries(['academy_attempt','academy_quiz_attempt','academy_certificate','academy_recognition','academy_xp','session','verification'].map(name=>[name,count(db,name)]));
    db.exec('BEGIN IMMEDIATE');
    try{
      db.exec("DELETE FROM academy_message_asset WHERE message_id IN (SELECT id FROM academy_message WHERE certificate_id IS NOT NULL OR kind IN ('certificate','recognition')); DELETE FROM academy_message WHERE certificate_id IS NOT NULL OR kind IN ('certificate','recognition');");
      for(const table of ['academy_notification','academy_outbox','academy_certificate','academy_recognition','academy_xp','academy_quiz_attempt','academy_attempt','academy_study_session','session','verification','rateLimit','academy_calendar_mirror','academy_calendar_connection'])if(hasTable(db,table))db.exec('DELETE FROM "'+table+'"');
      db.exec("UPDATE account SET accessToken=NULL,refreshToken=NULL,idToken=NULL,accessTokenExpiresAt=NULL,refreshTokenExpiresAt=NULL,scope=NULL WHERE providerId<>'credential';");
      db.prepare("UPDATE academy_invitation SET revoked_at=? WHERE used_by IS NULL AND revoked_at IS NULL").run(new Date().toISOString());
      db.prepare("UPDATE academy_settings SET value='production' WHERE key='environment'").run();
      for(const table of preservedTables)if(tableDigest(db,table)!==before[table])throw new Error('A transferência alterou uma configuração ou material que deveria ser preservado.');
      if(passwordDigest(db)!==passwords)throw new Error('A transferência alterou uma credencial de acesso.');
      checkDatabase(db);db.exec('COMMIT');
    }catch(error){db.exec('ROLLBACK');throw error;}
    db.exec('VACUUM');checkDatabase(db);
    preserved=Object.fromEntries(preservedTables.map(name=>[name,count(db,name)]));
  }finally{db.close();}
  const manifest={format,createdAt:new Date().toISOString(),environment:'production',preserved,excludedPilotRecords:removed,googleRequiresNewConsent:true,files:Object.fromEntries(files.map(name=>[name,{bytes:statSync(resolve(bundle,name)).size,sha256:fingerprint(readFileSync(resolve(bundle,name)))}]))};
  writeFileSync(resolve(bundle,'manifest.json'),JSON.stringify(manifest,null,2)+'\n',{mode:0o600,flag:'wx'});
  return {bundle,manifest};
}

export function validateProductionBundle(bundle){
  bundle=resolve(bundle);
  const manifestPath=resolve(bundle,'manifest.json');
  if(statSync(manifestPath).size>32768)throw new Error('Manifesto de transferência inválido.');
  const manifest=JSON.parse(readFileSync(manifestPath,'utf8'));
  if(manifest.format!==format||manifest.environment!=='production'||Object.keys(manifest.files||{}).sort().join()!==files.slice().sort().join())throw new Error('Pacote de transferência inválido.');
  for(const name of files){
    const meta=manifest.files[name],path=resolve(bundle,name);
    if(!Number.isInteger(meta.bytes)||meta.bytes<=0||!/^[a-f0-9]{64}$/.test(meta.sha256)||statSync(path).size!==meta.bytes||fingerprint(readFileSync(path))!==meta.sha256)throw new Error('Um arquivo da transferência foi alterado.');
  }
  if(readFileSync(resolve(bundle,'.auth-secret'),'utf8').length<32)throw new Error('A chave de autenticação da transferência é inválida.');
  const db=new DatabaseSync(resolve(bundle,'academy.sqlite'),{readOnly:true});
  try{
    checkDatabase(db);
    if(db.prepare("SELECT value FROM academy_settings WHERE key='environment'").get()?.value!=='production')throw new Error('O banco da transferência não é de produção.');
    for(const table of ['academy_attempt','academy_quiz_attempt','academy_certificate','academy_recognition','academy_xp','session','verification','academy_calendar_connection','academy_calendar_mirror'])if(count(db,table))throw new Error('O pacote ainda contém evidências ou sessões do piloto.');
  }finally{db.close();}
  return manifest;
}

function assertEmptyDestination(dataDir){
  const path=resolve(dataDir,'academy.sqlite');if(!existsSync(path))return;
  const db=new DatabaseSync(path,{readOnly:true});
  try{
    if(hasTable(db,'academy_settings')&&db.prepare("SELECT value FROM academy_settings WHERE key='environment'").get()?.value==='test')throw new Error('O banco local de teste deve permanecer intacto.');
    for(const table of ['user','academy_member','academy_content','academy_attempt','academy_certificate'])if(count(db,table))throw new Error('O destino já tem dados; a importação inicial não pode sobrescrevê-los.');
  }finally{db.close();}
}

export function stageProductionBundle(bundle,dataDir){
  bundle=resolve(bundle);dataDir=resolve(dataDir);
  const manifest=validateProductionBundle(bundle);assertEmptyDestination(dataDir);
  mkdirSync(dataDir,{recursive:true,mode:0o700});
  const pending=resolve(dataDir,'.restore-pending');mkdirSync(pending,{mode:0o700});
  for(const name of [...files,'manifest.json']){copyFileSync(resolve(bundle,name),resolve(pending,name),constants.COPYFILE_EXCL);chmodSync(resolve(pending,name),0o600);}
  return {preserved:manifest.preserved,restartRequired:true};
}

// Executado antes de abrir qualquer conexão: nunca substitui um banco em uso.
export function applyStagedProduction(dataDir){
  dataDir=resolve(dataDir);const pending=resolve(dataDir,'.restore-pending');
  if(!existsSync(pending))return false;
  validateProductionBundle(pending);assertEmptyDestination(dataDir);
  for(const suffix of ['-wal','-shm']){const path=resolve(dataDir,'academy.sqlite'+suffix);if(existsSync(path))unlinkSync(path);}
  for(const name of files){
    const target=resolve(dataDir,name),replacement=resolve(dataDir,name+'.importing');
    copyFileSync(resolve(pending,name),replacement,constants.COPYFILE_EXCL);chmodSync(replacement,0o600);renameSync(replacement,target);
  }
  for(const name of [...files,'manifest.json'])unlinkSync(resolve(pending,name));rmdirSync(pending);
  return true;
}
