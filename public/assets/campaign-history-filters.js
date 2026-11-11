const normalize=value=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();

const searchableText=campaign=>normalize([
  campaign.title,
  campaign.subject,
  campaign.body,
  campaign.templateName,
  campaign.preview,
  campaign.audienceRole,
  campaign.scheduleError,
  ...(campaign.deliveries||[]).flatMap(delivery=>[
    delivery.name,
    delivery.email,
    delivery.phone,
    delivery.error,
    delivery.receiptError
  ])
].join(' '));

export function filterCampaigns(campaigns,filters={},now=Date.now()){
  const query=normalize(filters.query).trim();
  const status=filters.status||'all';
  const period=Number(filters.period)||0;
  const cutoff=period?now-period*24*60*60*1000:0;

  return campaigns.filter(campaign=>{
    if(query&&!searchableText(campaign).includes(query))return false;
    if(status==='failed'&&!(Number(campaign.metrics?.failed)>0))return false;
    if(status!=='all'&&status!=='failed'&&campaign.status!==status)return false;
    if(cutoff){
      const timestamp=new Date(campaign.sentAt||campaign.scheduledAt||campaign.createdAt||0).getTime();
      if(!Number.isFinite(timestamp)||timestamp<cutoff)return false;
    }
    return true;
  });
}

export function hasCampaignFilters(filters={}){
  return !!String(filters.query||'').trim()||(filters.status&&filters.status!=='all')||Number(filters.period)>0;
}

export function paginateCampaigns(campaigns,page=1,pageSize=10){
  const size=Math.max(1,Number(pageSize)||10);
  const totalPages=Math.max(1,Math.ceil(campaigns.length/size));
  const currentPage=Math.min(totalPages,Math.max(1,Number(page)||1));
  const start=(currentPage-1)*size;
  return {items:campaigns.slice(start,start+size),currentPage,totalPages,start,total:campaigns.length};
}
