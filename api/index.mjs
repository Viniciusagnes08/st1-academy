import {createApp} from '../server.mjs';
import {createServerlessHandler} from '../lib/serverless-handler.mjs';

export default createServerlessHandler({createApp,options:{includeLibrary:false,includeLearningFlows:false}});
