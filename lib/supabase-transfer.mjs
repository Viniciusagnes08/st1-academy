import {DatabaseSync} from 'node:sqlite';
import {resolve} from 'node:path';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createContext} from './context.mjs';
import {validateProductionBundle} from './production-transfer.mjs';

const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
function rowDigest(row){
  return digest(Object.fromEntries(Object.entries(row).map(([key,value])=>[key,value instanceof Uint8Array?{sha256:createHash('sha256').update(value).digest('hex'),bytes:value.length}:value])));
}
export async function importSupabase(bundle,{url,schema='academy',baseURL,ssl=true}={}){
  validateProductionBundle(bundle);
  const source=new DatabaseSync(resolve(bundle,'academy.sqlite'),{readOnly:true});
  const tables=source.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY rowid").all().map(item=>item.name);
  let ctx;
  try{
    ctx=await createContext({storage:'postgres',deployment:'production',postgres:{url,schema,ssl},baseURL,authSecret:readFileSync(resolve(bundle,'.auth-secret'),'utf8'),testMode:false,includeLibrary:false,includeLearningFlows:false});
    if(ctx.db.prepare('SELECT count(*) n FROM user').get().n||ctx.db.prepare('SELECT count(*) n FROM academy_content').get().n)throw new Error('O Supabase já tem contas ou materiais. A importação inicial não pode sobrescrevê-los.');
    ctx.db.exec('BEGIN IMMEDIATE');
    try{
      for(const name of tables.slice().reverse())ctx.db.exec('DELETE FROM "'+name+'"');
      for(const name of tables){
        for(const row of source.prepare('SELECT * FROM "'+name+'" ORDER BY rowid').iterate()){
          const columns=Object.keys(row),values=Object.values(row).map(value=>value instanceof Uint8Array?Buffer.from(value):value);
          ctx.db.prepare('INSERT INTO "'+name+'"('+columns.map(column=>'"'+column+'"').join(',')+') VALUES('+columns.map(()=>'?').join(',')+')').run(...values);
        }
        const original=source.prepare('SELECT * FROM "'+name+'" ORDER BY rowid').all().map(rowDigest);
        const imported=ctx.db.prepare('SELECT * FROM "'+name+'" ORDER BY rowid').all().map(rowDigest);
        if(digest(original)!==digest(imported))throw new Error('A conferência encontrou uma diferença na tabela '+name+'. A importação foi cancelada.');
      }
      ctx.db.exec('COMMIT');
    }catch(error){ctx.db.exec('ROLLBACK');throw error;}
    return {schema,preserved:Object.fromEntries(tables.map(name=>[name,ctx.db.prepare('SELECT count(*) n FROM "'+name+'"').get().n])),verified:true,credentialHashesPreserved:true,originalFilesVerified:true};
  }finally{ctx?.db.close();source.close();}
}
