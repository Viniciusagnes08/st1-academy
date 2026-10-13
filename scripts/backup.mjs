import {createContext} from '../lib/context.mjs';
import {createBackupService} from '../lib/storage-backup.mjs';
const ctx=await createContext();
try{console.log(JSON.stringify(await createBackupService(ctx).create()));}finally{ctx.db.close();}
