import {createContext} from '../lib/context.mjs';
const args=process.argv.slice(2);
const get=name=>args[args.indexOf(name)+1];
const name=args.includes('--nome')?get('--nome'):null;
const email=args.includes('--email')?get('--email'):null;
if(!name||!email){console.error('Uso: npm run setup -- --nome "Seu nome" --email "seu@email.com"');process.exit(1);}
const ctx=await createContext();
if(ctx.db.prepare("SELECT 1 FROM academy_member WHERE role='admin'").get()||ctx.db.prepare("SELECT 1 FROM academy_invitation WHERE role='admin' AND used_by IS NULL AND expires_at>?").get(new Date().toISOString())){
  console.error('Já existe um gestor ou um convite válido para gestor. Use o convite existente.');process.exitCode=1;
}else{
  const invite=ctx.createInvitation({name,email,role:'admin'});
  console.log('Convite pessoal para configurar a Academia (válido por 7 dias):\n'+invite.url+'\nAbra o endereço e defina sua senha. Não compartilhe esse convite.');
}
ctx.db.close();
