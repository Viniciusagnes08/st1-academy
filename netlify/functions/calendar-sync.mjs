import {createContext} from '../../lib/context.mjs';

// Platform scheduling does not expose an unauthenticated public sync endpoint.
// A 15-minute poll conserves the Free allowance; manual sync remains available.
export default async()=>{
  const ctx=await createContext({serverless:true,includeLibrary:false,includeLearningFlows:false});
  try{const result=await ctx.googleCalendar.tick();return Response.json({ok:!result.failed});}
  finally{ctx.db.close();}
};
export const config={schedule:'*/15 * * * *'};
