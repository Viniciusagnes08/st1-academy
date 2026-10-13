export function safeNextPath(value,origin){
  try{const url=new URL(value||'/#inicio',origin);if(url.origin!==origin||!['/','/index.html'].includes(url.pathname))return '/#inicio';return url.pathname+(url.hash||'#inicio');}catch{return '/#inicio';}
}
export function invitationTokenFromInput(value,origin){
  const text=String(value||'').trim();
  if(/^[A-Za-z0-9_-]{30,150}$/.test(text))return text;
  try{const url=new URL(text,origin);const token=url.searchParams.get('convite');if(url.origin!==origin||!['/','/login','/login.html'].includes(url.pathname)||!token||!/^[A-Za-z0-9_-]{30,150}$/.test(token))return null;return token;}catch{return null;}
}
export function rememberedLogin(value){
  try{const data=JSON.parse(value);return data?.remember===true&&typeof data.email==='string'&&data.email.length<=254&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)?{email:data.email,remember:true}:null;}catch{return null;}
}

export async function verifySignedInMember(api){
  try{return await api('/api/me');}
  catch(error){
    if(error.status===403)await api('/api/auth/sign-out',{body:{}});
    throw error;
  }
}
