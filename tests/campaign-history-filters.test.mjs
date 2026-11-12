import assert from 'node:assert/strict';
import test from 'node:test';
import {filterCampaigns,hasCampaignFilters,paginateCampaigns} from '../public/assets/campaign-history-filters.js';

const now=Date.parse('2026-11-11T12:00:00Z');
const campaigns=[
  {id:'1',title:'Evolução dos Líderes',subject:'Próxima trilha',body:'Continue aprendendo',status:'sent',createdAt:'2026-11-10T12:00:00Z',metrics:{failed:0},deliveries:[{name:'João Silva',email:'joao@st1.net.br'}]},
  {id:'2',title:'Retomada comercial',templateName:'retomada_pap',preview:'Volte para sua trilha',status:'draft',createdAt:'2026-09-01T12:00:00Z',metrics:{failed:2},deliveries:[{name:'Ana Souza',phone:'5598999999999'}]}
];

test('pesquisa sem diferenciar acentos, conteúdo ou destinatário',()=>{
  assert.deepEqual(filterCampaigns(campaigns,{query:'evolucao'},now).map(x=>x.id),['1']);
  assert.deepEqual(filterCampaigns(campaigns,{query:'joao@st1'},now).map(x=>x.id),['1']);
  assert.deepEqual(filterCampaigns(campaigns,{query:'retomada_pap'},now).map(x=>x.id),['2']);
});

test('filtra situação e campanhas com falhas',()=>{
  assert.deepEqual(filterCampaigns(campaigns,{status:'draft'},now).map(x=>x.id),['2']);
  assert.deepEqual(filterCampaigns(campaigns,{status:'failed'},now).map(x=>x.id),['2']);
});

test('filtra pelo período operacional mais recente',()=>{
  assert.deepEqual(filterCampaigns(campaigns,{period:'7'},now).map(x=>x.id),['1']);
  assert.equal(hasCampaignFilters({query:'',status:'all',period:'all'}),false);
  assert.equal(hasCampaignFilters({query:'ana',status:'all',period:'all'}),true);
});

test('pagina doze campanhas e limita a página solicitada',()=>{
  const items=Array.from({length:23},(_,index)=>({id:String(index+1)}));
  assert.deepEqual(paginateCampaigns(items,1).items.map(x=>x.id),['1','2','3','4','5','6','7','8','9','10','11','12']);
  assert.deepEqual(paginateCampaigns(items,2).items.map(x=>x.id),['13','14','15','16','17','18','19','20','21','22','23']);
  const last=paginateCampaigns(items,9);
  assert.equal(last.currentPage,2);
  assert.deepEqual(last.items.map(x=>x.id),['13','14','15','16','17','18','19','20','21','22','23']);
});

