import {isAbsolute,relative,resolve,sep} from 'node:path';

export function hostingConfig(options={},env=process.env,projectRoot=process.cwd()){
  const serverless=env.VERCEL==='1'||env.VERCEL==='true';
  const production=(options.deployment||env.ACADEMY_DEPLOYMENT)==='production'||env.RENDER==='true'||serverless;
  const storage=options.storage||env.ACADEMY_STORAGE||'sqlite';
  if(!['sqlite','postgres'].includes(storage))throw new Error('Armazenamento da Academy inválido.');
  if(serverless&&storage!=='postgres')throw new Error('A publicação na Vercel exige PostgreSQL permanente. SQLite local não pode guardar os dados da Academy.');
  const configuredDir=options.dataDir||env.ACADEMY_DATA_DIR;
  const dataDir=resolve(configuredDir||resolve(projectRoot,'data'));
  const baseURL=options.baseURL||env.ACADEMY_BASE_URL||(production?env.RENDER_EXTERNAL_URL:null)||'http://localhost:4175';
  let origin;try{origin=new URL(baseURL);}catch{throw new Error('Informe uma URL válida para a Academy.');}
  if(!['http:','https:'].includes(origin.protocol)||origin.username||origin.password||origin.search||origin.hash||origin.pathname!=='/')throw new Error('ACADEMY_BASE_URL deve conter somente a origem do site.');
  const testMode=options.testMode??env.ACADEMY_TEST_MODE==='1';
  const insidePublic=relative(resolve(projectRoot,'public'),dataDir);
  if(insidePublic===''||!insidePublic.startsWith('..'+sep)&&insidePublic!=='..'&&!isAbsolute(insidePublic))throw new Error('O banco da Academy não pode ficar na pasta pública.');
  if(production){
    if(origin.protocol!=='https:')throw new Error('A publicação da Academy exige uma URL HTTPS.');
    if(storage==='sqlite'&&(!configuredDir||!isAbsolute(configuredDir)))throw new Error('Configure ACADEMY_DATA_DIR com o caminho absoluto do disco persistente.');
    if(storage==='postgres'&&(!(options.postgres?.url||env.DATABASE_URL)||!(options.authSecret||env.ACADEMY_AUTH_SECRET)||String(options.authSecret||env.ACADEMY_AUTH_SECRET).length<32))throw new Error('Configure DATABASE_URL e ACADEMY_AUTH_SECRET nas variáveis privadas do servidor.');
    if(testMode)throw new Error('Use um banco de produção separado, com ACADEMY_TEST_MODE=0.');
  }
  const proxyHops=Number(options.proxyHops??env.ACADEMY_TRUST_PROXY??0);
  if(!Number.isInteger(proxyHops)||proxyHops<0||proxyHops>1)throw new Error('ACADEMY_TRUST_PROXY aceita 0 ou 1 proxy reverso.');
  const port=Number(env.PORT||(production?10000:4175));
  if(!Number.isInteger(port)||port<1||port>65535)throw new Error('Informe uma porta válida para o servidor.');
  return {production,serverless,storage,dataDir,baseURL:origin.origin,testMode,proxyHops,host:env.ACADEMY_LISTEN_HOST||(production?'0.0.0.0':'127.0.0.1'),port,environment:storage==='postgres'?(production?'production-postgres':'local-postgres'):(production?'production-persistent':'local-persistent')};
}
