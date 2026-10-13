export function encodeValue(value){
  if(value instanceof Uint8Array)return {$academyType:'bytes',value:Buffer.from(value).toString('base64')};
  if(typeof value==='bigint')return {$academyType:'bigint',value:String(value)};
  if(value instanceof Date)return {$academyType:'date',value:value.toISOString()};
  if(Array.isArray(value))return value.map(encodeValue);
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,encodeValue(item)]));
  return value;
}
export function decodeValue(value){
  if(value?.$academyType==='bytes')return Buffer.from(value.value,'base64');
  if(value?.$academyType==='bigint')return BigInt(value.value);
  if(value?.$academyType==='date')return new Date(value.value);
  if(Array.isArray(value))return value.map(decodeValue);
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([key])=>key!=='_academy_rowid').map(([key,item])=>[key,decodeValue(item)]));
  return value;
}
