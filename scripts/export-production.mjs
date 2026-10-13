import {resolve} from 'node:path';
import {exportProduction} from '../lib/production-transfer.mjs';
const args=process.argv.slice(2),get=name=>args.includes(name)?args[args.indexOf(name)+1]:null;
const source=get('--source'),output=get('--output');
if(!source||!output)throw new Error('Uso: node scripts/export-production.mjs --source CAMINHO_DO_PILOTO --output PASTA_PRIVADA_NOVA');
const result=await exportProduction(resolve(source),resolve(output));
console.log(JSON.stringify({bundle:result.bundle,preserved:result.manifest.preserved,excludedPilotRecords:result.manifest.excludedPilotRecords,googleRequiresNewConsent:true},null,2));
