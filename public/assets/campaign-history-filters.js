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

export function paginateCampaigns(campaigns,page=1,pageSize=12){
  const size=Math.max(1,Number(pageSize)||12);
  const totalPages=Math.max(1,Math.ceil(campaigns.length/size));
  const currentPage=Math.min(totalPages,Math.max(1,Number(page)||1));
  const start=(currentPage-1)*size;
  return {items:campaigns.slice(start,start+size),currentPage,totalPages,start,total:campaigns.length};
}

const metricCount=value=>Number.isFinite(Number(value))?Math.max(0,Math.trunc(Number(value))):0;
const list=value=>Array.isArray(value)?value:[];

function automationTotals(items){
  return list(items).reduce((total,item)=>{
    const accepted=metricCount(item.accepted),failed=metricCount(item.failed),unknown=metricCount(item.unknown),inProgress=metricCount(item.inProgress);
    total.attempted+=metricCount(item.attempted)||accepted+failed+unknown+inProgress;
    total.accepted+=accepted;
    total.failed+=failed+unknown+inProgress;
    total.delivered+=metricCount(item.delivered);
    total.read+=metricCount(item.read);
    return total;
  },{attempted:0,accepted:0,failed:0,delivered:0,read:0});
}

export function summarizeEmailCampaignMetrics(campaigns=[],automationItems=[]){
  const rows=list(campaigns),deliveries=rows.flatMap(campaign=>list(campaign.deliveries));
  const attempted=deliveries.filter(item=>['accepted','failed','sending','unknown'].includes(item.status)).length;
  const accepted=deliveries.filter(item=>item.status==='accepted').length;
  const failed=deliveries.filter(item=>['failed','sending','unknown'].includes(item.status)).length;
  const automation=automationTotals(automationItems);
  return {
    campaignsCreated:rows.length,
    campaignsCompleted:rows.filter(campaign=>campaign.status==='sent').length,
    draftCampaigns:rows.filter(campaign=>campaign.status==='draft').length,
    scheduledCampaigns:rows.filter(campaign=>campaign.status==='scheduled').length,
    messagesAttempted:attempted+automation.attempted,
    messagesAccepted:accepted+automation.accepted,
    messagesUnconfirmed:failed+automation.failed
  };
}

export function summarizeWhatsAppCampaignMetrics(campaigns=[],automationItems=[]){
  const rows=list(campaigns),deliveries=rows.flatMap(campaign=>list(campaign.deliveries));
  const attempted=deliveries.filter(item=>['accepted','failed','sending','unknown'].includes(item.status)||['delivered','read','failed'].includes(item.deliveryStatus)).length;
  const accepted=deliveries.filter(item=>item.status==='accepted'||item.deliveredAt||item.readAt).length;
  const delivered=deliveries.filter(item=>item.deliveredAt||['delivered','read'].includes(item.deliveryStatus)).length;
  const read=deliveries.filter(item=>item.readAt||item.deliveryStatus==='read').length;
  const failed=deliveries.filter(item=>item.status==='failed'||item.deliveryStatus==='failed'||['sending','unknown'].includes(item.status)).length;
  const automation=automationTotals(automationItems);
  return {
    campaignsCreated:rows.length,
    campaignsCompleted:rows.filter(campaign=>campaign.status==='sent').length,
    draftCampaigns:rows.filter(campaign=>campaign.status==='draft').length,
    scheduledCampaigns:rows.filter(campaign=>campaign.status==='scheduled').length,
    messagesAttempted:attempted+automation.attempted,
    messagesAccepted:accepted+automation.accepted,
    messagesDelivered:delivered+automation.delivered,
    messagesRead:read+automation.read,
    messagesUnconfirmed:failed+automation.failed
  };
}
