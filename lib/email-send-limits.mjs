const day=24*60*60*1000;

export function createEmailSendLimits(db,{clock=()=>new Date().toISOString()}={}){
  const sentBy=userId=>{
    const rows=[];
    try{rows.push(...db.prepare("SELECT accepted_at AS sent_at FROM academy_email_job WHERE user_id=? AND status='accepted'").all(userId));}catch{}
    try{rows.push(...db.prepare("SELECT sent_at FROM academy_campaign_delivery WHERE user_id=? AND status='accepted'").all(userId));}catch{}
    return rows.filter(row=>row.sent_at&&Number.isFinite(Date.parse(row.sent_at))).sort((a,b)=>Date.parse(a.sent_at)-Date.parse(b.sent_at));
  };
  const nextSendAt=(userId,days=7)=>{
    const stamp=Date.parse(clock()),sent=sentBy(userId),windowDays=Math.max(7,days),within=sent.filter(row=>stamp-Date.parse(row.sent_at)<windowDays*day);
    if(days>7&&within.length)return new Date(Date.parse(within.at(-1).sent_at)+days*day).toISOString();
    let next=stamp;const week=sent.filter(row=>stamp-Date.parse(row.sent_at)<7*day);
    if(week.length>=2)next=Math.max(next,Date.parse(week[0].sent_at)+7*day);
    if(sent.length)next=Math.max(next,Date.parse(sent.at(-1).sent_at)+48*60*60*1000);
    return next>stamp?new Date(next).toISOString():null;
  };
  return {nextSendAt,canSend:(userId,days=7)=>!nextSendAt(userId,days)};
}

