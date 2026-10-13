import {hostingConfig} from '../lib/hosting.mjs';
import {projectRoot} from '../lib/context.mjs';
import {stageProductionBundle} from '../lib/production-transfer.mjs';
const args=process.argv.slice(2),bundle=args.includes('--bundle')?args[args.indexOf('--bundle')+1]:null;
const runtime=hostingConfig({},process.env,projectRoot);
if(!runtime.production||!bundle)throw new Error('Use o servidor de produção: node scripts/import-production.mjs --bundle PASTA_PRIVADA_TRANSFERIDA');
console.log(JSON.stringify(stageProductionBundle(bundle,runtime.dataDir),null,2));
