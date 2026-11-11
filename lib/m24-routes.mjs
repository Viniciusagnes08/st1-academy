import {resolve} from 'node:path';
import {createM24Governance} from './m24-governance.mjs';
import {projectRoot} from './context.mjs';

export function mountM24(app,{ctx,member,config={}}){
  const enabled=config.enabled!==false;
  const canAccess=profile=>enabled&&profile?.role==='admin'&&profile.enabled===1;
  // Keep an emergency kill switch without requiring a second application instance.
  if(!enabled)return {canAccess:()=>false};
  const service=createM24Governance(ctx.db);
  const guard=(req,res,next)=>{
    res.set('Cache-Control','no-store').set('X-Robots-Tag','noindex, nofollow, noarchive');
    return canAccess(req.member)?next():res.status(404).json({message:'Página não encontrada.'});
  };
  const action=handler=>(req,res,next)=>{try{handler(req,res);}catch(error){if(error.status)return res.status(error.status).json({message:error.message});next(error);}};
  app.use(['/api/homologacao/m24','/homologacao/m24'],member,guard);
  app.use('/api/homologacao/m24',(req,res,next)=>{
    if(['POST','PUT','PATCH'].includes(req.method)&&(!req.body||typeof req.body!=='object'||Array.isArray(req.body)))return res.status(400).json({message:'Envie um objeto JSON válido.'});
    next();
  });
  for(const [route,file] of [['','index.html'],['/app.js','app.js'],['/style.css','style.css']])app.get('/homologacao/m24'+route,(req,res)=>res.sendFile(resolve(projectRoot,'private/m24',file)));
  const base='/api/homologacao/m24';
  app.get(base,action((req,res)=>res.json(service.inventory(req.query))));
  app.get(base+'/sources',action((req,res)=>res.json({items:service.sources()})));
  app.post(base+'/sources',action((req,res)=>res.status(201).json(service.createSource(req.member.user_id,req.body))));
  app.patch(base+'/sources/:id',action((req,res)=>res.json(service.updateSource(req.member.user_id,req.params.id,req.body))));
  app.get(base+'/export',action((req,res)=>{
    const items=[];let page;
    do{page=service.inventory({limit:100,offset:items.length});items.push(...page.items);}while(items.length<page.total);
    res.attachment('ST1_M24_Governanca.json').json({environment:'production-admin',exportedAt:new Date().toISOString(),items,sources:service.sources()});
  }));
  app.get(base+'/contents/:id',action((req,res)=>res.json(service.detail(req.params.id))));
  app.put(base+'/contents/:id',action((req,res)=>res.json(service.save(req.member.user_id,req.params.id,req.body))));
  app.post(base+'/contents/:id/reviews',action((req,res)=>res.json(service.review(req.member.user_id,req.params.id,req.body))));
  return {canAccess};
}
