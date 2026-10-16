import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

// Lambda bundles inline ESM modules, so import.meta.url may point at the
// generated function. Included resources stay at the task root instead.
export const projectRoot=process.env.LAMBDA_TASK_ROOT?resolve(process.env.LAMBDA_TASK_ROOT):resolve(dirname(fileURLToPath(import.meta.url)),'..');
