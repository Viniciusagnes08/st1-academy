import {createApp} from '../../server.mjs';
import {createFetchHandler} from '../../lib/fetch-handler.mjs';

export default createFetchHandler({createApp,options:{serverless:true,limitedFileResponses:true,includeLibrary:false,includeLearningFlows:false}});
export const config={path:['/','/index.html','/login','/login.html','/google/connected','/api/*','/healthz'],preferStatic:false};
