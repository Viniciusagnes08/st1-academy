// Runtime construction checks the schema prepared by a reviewed migration.
// It never creates or changes tables during a serverless request.
export function runtimeSchemaGuard(db,snapshot){
  let constructing=true;
  const tables=new Map(snapshot.tables.map(table=>[table.name,table.columns]));
  const indexes=new Set(snapshot.indexes),functions=new Set(snapshot.functions);
  const missing=label=>{throw new Error('Atualize o esquema da Academy antes de publicar: '+label);};
  const proxy=new Proxy(db,{
    get(target,key){
      if(!constructing){const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;}
      if(key==='exec')return sql=>{
        for(const statement of sql.split(/;\s*(?=(?:CREATE|ALTER|UPDATE|PRAGMA|$))/i).map(v=>v.trim()).filter(Boolean)){
          if(/^PRAGMA\s+(journal_mode|foreign_keys|busy_timeout)\s*=/i.test(statement))continue;
          const table=statement.match(/^CREATE TABLE IF NOT EXISTS\s+["']?([a-zA-Z0-9_]+)/i);
          const index=statement.match(/^CREATE(?: UNIQUE)? INDEX IF NOT EXISTS\s+["']?([a-zA-Z0-9_]+)/i);
          if(table&&tables.has(table[1]))continue;
          if(index&&indexes.has(index[1]))continue;
          missing(table?.[1]||index?.[1]||'migração pendente');
        }
        return db;
      };
      if(key==='function')return name=>functions.has(name)?undefined:missing(name);
      if(key==='prepare')return sql=>{
        const pragma=sql.match(/^\s*PRAGMA\s+table_info\s*\(\s*([a-zA-Z0-9_]+)\s*\)\s*$/i);
        if(pragma)return {all:()=>{if(!tables.has(pragma[1]))missing(pragma[1]);return tables.get(pragma[1]).map(name=>({name}));}};
        const defaults=sql.match(/^INSERT OR IGNORE INTO (academy_game_rules|academy_profile_rules)\b/i);
        if(defaults)return {run:()=>{if(!db.prepare('SELECT 1 FROM '+defaults[1]+' WHERE id=1').get())missing(defaults[1]+' sem configuração inicial');return {changes:0,lastInsertRowid:0};}};
        return target.prepare(sql);
      };
      const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;
    }
  });
  return {db:proxy,finish:()=>{constructing=false;}};
}
