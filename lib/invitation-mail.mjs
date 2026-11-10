import nodemailer from 'nodemailer';

const escapeHtml=value=>String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

export function invitationContent({name,url,expiresAt}){
  const firstName=String(name).trim().split(/\s+/)[0]||'você';
  const link=new URL(url);
  if(link.protocol!=='https:'&&link.hostname!=='localhost')throw new Error('Link de convite inválido.');
  const expiration=new Intl.DateTimeFormat('pt-BR',{dateStyle:'long',timeZone:'America/Sao_Paulo'}).format(new Date(expiresAt));
  const origin=link.origin;
  const safeName=escapeHtml(firstName),safeUrl=escapeHtml(link.href),safeDate=escapeHtml(expiration);
  const subject=`${firstName}, seu lugar na ST1 Academy está pronto ⭐`;
  const text=`Olá, ${firstName}!\n\nSeu próximo passo começa aqui. A ST1 Academy reúne conhecimento, trilhas e experiências para você evoluir com o time ST1 Internet.\n\nAtive seu acesso e crie sua senha: ${link.href}\n\nSeu convite pessoal é válido até ${expiration}. Se você não esperava este e-mail, basta ignorá-lo.\n\nST1 Academy · ST1 Internet`;
  const html=`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;padding:0;background:#f2f1ee;font-family:Arial,Helvetica,sans-serif;color:#17171c"><div style="display:none;max-height:0;overflow:hidden;opacity:0">Seu acesso está pronto. Venha começar sua jornada na ST1 Academy.</div><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f2f1ee"><tr><td align="center" style="padding:28px 12px"><table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:#fff;border-radius:18px;overflow:hidden"><tr><td style="background:#111217;padding:28px 36px"><img src="${origin}/assets/st1-logo-white.png" width="110" alt="ST1 Internet" style="display:block;max-width:110px;border:0"><div style="margin-top:18px;color:#ff7a16;font-size:12px;font-weight:bold;letter-spacing:2px">ST1 ACADEMY</div></td></tr><tr><td style="background:#111217;padding:8px 36px 34px;color:#fff"><table role="presentation" width="100%"><tr><td style="vertical-align:middle"><div style="font-size:13px;color:#ff9b4e;font-weight:bold;letter-spacing:1px">BOAS-VINDAS À SUA PRÓXIMA FASE</div><h1 style="font-size:36px;line-height:1.12;margin:14px 0 16px;color:#fff">Seu lugar na Academy está pronto, ${safeName}.</h1><p style="font-size:16px;line-height:1.55;margin:0;color:#e4e2e0">Conhecimento que vira resultado. E uma jornada que começa com você.</p></td><td width="132" style="vertical-align:bottom;text-align:right"><img src="${origin}/assets/starzinho/pose01-open.webp" width="124" alt="Starzinho dando boas-vindas" style="width:124px;max-width:100%;border:0"></td></tr></table></td></tr><tr><td style="padding:36px"><p style="font-size:17px;line-height:1.6;margin:0 0 18px">Olá, <strong>${safeName}</strong>! Agora você faz parte de um espaço criado para aprender, trocar experiências e crescer junto com o time da <strong>ST1 Internet</strong>.</p><p style="font-size:16px;line-height:1.6;margin:0 0 28px">Ative sua conta, crie sua senha e descubra o que já espera por você.</p><table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="border-radius:8px;background:#f97316"><a href="${safeUrl}" style="display:inline-block;padding:17px 28px;color:#fff;font-size:16px;font-weight:bold;text-decoration:none">Ativar meu acesso →</a></td></tr></table><p style="font-size:13px;line-height:1.5;color:#68656a;margin:26px 0 8px">Este convite é pessoal e vale até <strong>${safeDate}</strong>.</p><p style="font-size:12px;line-height:1.5;color:#68656a;word-break:break-all;margin:0">Se o botão não abrir, copie este endereço:<br><a href="${safeUrl}" style="color:#c75308">${safeUrl}</a></p></td></tr><tr><td style="background:#f7f4f0;padding:26px 36px;border-top:1px solid #e9e4de"><div style="font-weight:bold;font-size:14px">ST1 Academy <span style="color:#f97316">✦</span> ST1 Internet</div><p style="font-size:12px;line-height:1.5;color:#68656a;margin:9px 0 0">Você recebeu esta mensagem porque foi convidado para a Academy. Se não esperava o convite, pode ignorar este e-mail.</p></td></tr></table></td></tr></table></body></html>`;
  return {subject,text,html};
}

export function createInvitationMailer(env=process.env){
  const host=env.ACADEMY_SMTP_HOST,port=Number(env.ACADEMY_SMTP_PORT||465);
  const user=env.ACADEMY_SMTP_USER,pass=env.ACADEMY_SMTP_PASSWORD;
  const from=env.ACADEMY_MAIL_FROM||user;
  if(!host||!user||!pass||!from)return null;
  if(!Number.isInteger(port)||port<1||port>65535)throw new Error('ACADEMY_SMTP_PORT inválida.');
  const transport=nodemailer.createTransport({host,port,secure:port===465,requireTLS:port!==465,auth:{user,pass},connectionTimeout:10000,greetingTimeout:10000,socketTimeout:15000});
  return async({name,email,url,expiresAt})=>{
    const content=invitationContent({name,url,expiresAt});
    const info=await transport.sendMail({from:{name:'ST1 Academy',address:from},to:email,...content});
    if(info.rejected?.length)throw new Error('O servidor SMTP recusou o destinatário.');
    return info.messageId;
  };
}



