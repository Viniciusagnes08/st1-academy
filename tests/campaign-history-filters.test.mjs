import assert from 'node:assert/strict';
import test from 'node:test';
import {filterCampaigns,hasCampaignFilters} from '../public/assets/campaign-history-filters.js';

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
