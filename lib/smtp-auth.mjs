export function smtpPasswordForAuth(host,value){
  const password=String(value??'');
  return /^smtp\.(?:gmail|googlemail)\.com$/i.test(String(host??'').trim())?password.replace(/\s+/g,''):password;
}

