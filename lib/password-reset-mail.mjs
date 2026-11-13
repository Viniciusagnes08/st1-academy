import nodemailer from 'nodemailer';
import {smtpPasswordForAuth} from './smtp-auth.mjs';

const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const firstName=value=>String(value||'').trim().split(/\s+/)[0].slice(0,50)||'participante';

export function resetMailContent({name,url}){
  const parsed=new URL(url);
  if(parsed.protocol!=='https:'&&!['localhost','127.0.0.1','[::1]'].includes(parsed.hostname))throw new Error('Link de redefinição não confiável.');
  const first=firstName(name),link=parsed.href;
  const subject='Redefinição de senha | ST1 Academy';
  const text=`Olá, ${first}!\n\nRecebemos uma solicitação para redefinir sua senha da ST1 Academy. Use o link abaixo em até 30 minutos:\n\n${link}\n\nO link funciona uma única vez. Se não foi você, ignore esta mensagem; sua senha permanece igual.\n\nST1 Academy · ST1 Internet`;
  const html=`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"></head><body style="margin:0;background:#f5f2ed;font-family:Arial,Helvetica,sans-serif;color:#242022"><main style="max-width:560px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden"><header style="background:#121217;color:white;padding:28px 32px"><strong style="color:#ff7a16;letter-spacing:2px">ST1 ACADEMY</strong><h1 style="font-size:28px;line-height:1.2">Redefinir sua senha</h1></header><section style="padding:32px"><p>Olá, <strong>${esc(first)}</strong>!</p><p>Recebemos uma solicitação para redefinir a senha de sua conta.</p><p style="margin:28px 0"><a href="${esc(link)}" style="background:#f77716;color:#fff;padding:16px 22px;border-radius:8px;text-decoration:none;font-weight:bold">Criar nova senha</a></p><p>Este link funciona uma única vez e expira em <strong>30 minutos</strong>.</p><p style="overflow-wrap:anywhere;font-size:12px"><a href="${esc(link)}">${esc(link)}</a></p><p style="font-size:13px;color:#5b5551">Se você não pediu a redefinição, ignore esta mensagem. Nunca compartilhe esse link com outras pessoas.</p></section><footer style="background:#f8f5f0;padding:20px 32px;font-size:12px">ST1 Academy · ST1 Internet</footer></main></body></html>`;
  return {subject,text,html};
}

export function passwordChangedMailContent({name}){
  const first=firstName(name);
  return {
    subject:'Senha alterada | ST1 Academy',
    text:`Olá, ${first}!\n\nA senha de sua conta ST1 Academy foi redefinida. As sessões anteriores foram encerradas.\n\nSe você não reconhece esta alteração, fale imediatamente com o Admin responsável pela Academy. Não responda com sua senha e não compartilhe códigos ou links.\n\nST1 Academy · ST1 Internet`,
    html:`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"></head><body style="font-family:Arial,Helvetica,sans-serif;color:#202026;background:#f5f2ed;padding:32px"><main style="max-width:540px;margin:auto;background:white;padding:32px;border-radius:12px"><strong style="color:#f77716">ST1 ACADEMY</strong><h1>Senha alterada</h1><p>Olá, ${esc(first)}! Sua senha foi redefinida e as sessões anteriores foram encerradas.</p><p>Se não foi você, entre em contato imediatamente com o Admin responsável. Nunca compartilhe sua senha.</p><footer style="font-size:12px;color:#676267">ST1 Academy · ST1 Internet</footer></main></body></html>`
  };
}

export function createPasswordResetMailer(env=process.env){
  const host=env.ACADEMY_SMTP_HOST,port=Number(env.ACADEMY_SMTP_PORT||465),user=env.ACADEMY_SMTP_USER,pass=env.ACADEMY_SMTP_PASSWORD,from=env.ACADEMY_MAIL_FROM||user;
  if(!host||!user||!pass||!from)return null;
  if(!Number.isInteger(port)||port<1||port>65535)throw new Error('ACADEMY_SMTP_PORT inválida.');
  const transport=nodemailer.createTransport({host,port,secure:port===465,requireTLS:port!==465,auth:{user,pass:smtpPasswordForAuth(host,pass)},connectionTimeout:10000,greetingTimeout:10000,socketTimeout:15000});
  return async({kind,email,name,url})=>{
    const content=kind==='changed'?passwordChangedMailContent({name}):resetMailContent({name,url});
    const response=await transport.sendMail({from:{name:'ST1 Academy',address:from},to:email,...content});
    if(response.rejected?.length)throw new Error('SMTP recusou o e-mail.');
    return response.messageId;
  };
}
