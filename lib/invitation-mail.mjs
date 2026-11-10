import nodemailer from 'nodemailer';

export function createInvitationMailer(env=process.env){
  const host=env.ACADEMY_SMTP_HOST,port=Number(env.ACADEMY_SMTP_PORT||465);
  const user=env.ACADEMY_SMTP_USER,pass=env.ACADEMY_SMTP_PASSWORD;
  const from=env.ACADEMY_MAIL_FROM||user;
  if(!host||!user||!pass||!from)return null;
  if(!Number.isInteger(port)||port<1||port>65535)throw new Error('ACADEMY_SMTP_PORT inválida.');
  const transport=nodemailer.createTransport({host,port,secure:port===465,requireTLS:port!==465,auth:{user,pass},connectionTimeout:10000,greetingTimeout:10000,socketTimeout:15000});
  return async({name,email,url,expiresAt})=>{
    const firstName=String(name).trim().split(/\s+/)[0];
    const expiration=new Intl.DateTimeFormat('pt-BR',{dateStyle:'long',timeZone:'America/Sao_Paulo'}).format(new Date(expiresAt));
    const info=await transport.sendMail({from:{name:'ST1 Academy',address:from},to:email,subject:'Bem-vindo à ST1 Academy: seu acesso está pronto',text:`Olá, ${firstName}!\n\nVocê recebeu um convite pessoal para entrar na ST1 Academy.\n\nCrie sua senha pelo link abaixo:\n${url}\n\nO convite é válido até ${expiration}. Se você não esperava esta mensagem, pode ignorá-la.\n\nEquipe ST1 Academy`});
    if(info.rejected?.length)throw new Error('O servidor SMTP recusou o destinatário.');
    return info.messageId;
  };
}
