import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {randomBytes} from 'node:crypto';
import {createApp} from '../server.mjs';
import {completeOnboardingForTest} from './helpers/academy-fixtures.mjs';

test('Banco de Dados Tech tem acesso próprio e mantém avaliações privadas até aprovação',async()=>{
  const dataDir=await mkdtemp(resolve(tmpdir(),'st1-database-course-')),baseURL='http://localhost:4271';
  const {app,ctx}=await createApp({dataDir,baseURL,testMode:true,googleConfig:{clientId:'',clientSecret:''}});
  const server=await new Promise(done=>{const instance=app.listen(4271,'127.0.0.1',()=>done(instance));});
  const request=async(client,path,{method='GET',body}={})=>{const response=await fetch(baseURL+path,{method,headers:{Origin:baseURL,Connection:'close',...(client?{Cookie:client.cookie}:{}),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});const data=await response.json();return {status:response.status,data};};
  const signup=async({key,role='seller',tracks})=>{
    const invite=ctx.createInvitation({name:'Tech '+key,email:key+'@tech.example',role,tracks});
    const response=await fetch(baseURL+'/api/auth/sign-up/email',{method:'POST',headers:{Origin:baseURL,'Content-Type':'application/json','x-academy-invite':new URL(invite.url).searchParams.get('convite'),Connection:'close'},body:JSON.stringify({name:'Pessoa de teste',email:key+'@tech.example',password:randomBytes(24).toString('base64url')})});
    assert.equal(response.status,200);const payload=await response.json(),person={id:payload.user.id,cookie:response.headers.getSetCookie().map(value=>value.split(';')[0]).join('; ')};completeOnboardingForTest(ctx.db,person.id);return person;
  };
  try{
    const admin=await signup({key:'admin',role:'admin'}),tech=await signup({key:'tech',tracks:['tech']}),standard=await signup({key:'standard'});
    const techCatalog=await request(tech,'/api/catalog'),techContents=await request(tech,'/api/contents'),standardContents=await request(standard,'/api/contents');
    assert.equal(techCatalog.status,200);assert.equal(techCatalog.data.tracks.find(track=>track.id==='tech').trainingOnly,true);assert.equal(techCatalog.data.tracks.find(track=>track.id==='tech').assessmentStatus,'draft');
    assert.deepEqual(techContents.data.items.filter(item=>item.id.startsWith('st1-db-volume-')).map(item=>item.id).sort(),Array.from({length:5},(_,index)=>'st1-db-volume-'+String(index+1).padStart(2,'0')));
    assert.equal(techContents.data.items.some(item=>item.id.startsWith('st1-bi-')),false);assert.equal(standardContents.data.items.some(item=>item.id.startsWith('st1-db-volume-')),false);
    assert.equal((await request(tech,'/api/attempts',{method:'POST',body:{trackId:'tech'}})).status,423);
    assert.equal((await request(tech,'/api/quizzes?type=flash')).data.items.some(item=>item.tracks.includes('tech')),false);
    const adminDrafts=await request(admin,'/api/admin/quizzes');const drafts=adminDrafts.data.items.filter(item=>item.tracks.includes('tech'));
    assert.equal(drafts.length,18);assert(drafts.every(item=>item.status==='draft'));assert.equal(drafts.reduce((sum,item)=>sum+item.questionCount,0),85);
    const flow=await request(tech,'/api/learning-flows/percurso-tech');assert.equal(flow.status,200);assert.equal(flow.data.nodes.filter(node=>node.kind==='material').length,5);assert.equal(flow.data.nodes.some(node=>node.kind==='certificate'),false);
    const volumes=ctx.contents.list().filter(item=>item.id.startsWith('st1-db-volume-'));assert(volumes.every(item=>item.tracks.length===1&&item.tracks[0]==='tech'&&item.scope==='general'));
  }finally{await new Promise(done=>server.close(done));ctx.db.close();await rm(dataDir,{recursive:true,force:true});}
});
