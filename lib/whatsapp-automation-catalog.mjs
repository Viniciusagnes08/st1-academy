import {emailAutomationCatalog} from './email-automation-catalog.mjs';

// These are drafts for Meta review. A name/language pair is usable only after
// the corresponding template has been approved in the connected WABA.
const copy={
  welcome:'Olá, {{1}}! Sua jornada na ST1 Academy começou. Entre na plataforma e descubra sua primeira missão.',
  first_lesson_nudge:'Olá, {{1}}! Sua primeira aula está esperando por você na ST1 Academy. Que tal começar hoje?',
  lesson_resume:'Olá, {{1}}! Seu progresso continua salvo. Volte à ST1 Academy para seguir de onde parou.',
  half_track:'Olá, {{1}}! Você chegou à metade da sua trilha. Continue na ST1 Academy para avançar.',
  last_mile_track:'Olá, {{1}}! Falta pouco para concluir sua trilha. Sua próxima etapa está na ST1 Academy.',
  module_complete:'Parabéns, {{1}}! Você concluiu um módulo na ST1 Academy. Sua próxima missão já pode começar.',
  track_complete:'Parabéns, {{1}}! Você concluiu uma trilha na ST1 Academy. Veja sua conquista na plataforma.',
  certificate_available:'Olá, {{1}}! Seu certificado está disponível na ST1 Academy. Acesse a plataforma para conferir.',
  module_unlocked:'Olá, {{1}}! Um novo módulo foi liberado para você na ST1 Academy. Confira o conteúdo.',
  content_update:'Olá, {{1}}! Um conteúdo da sua trilha foi atualizado na ST1 Academy. Veja o que mudou.',
  weekly_mission:'Olá, {{1}}! A missão da semana já está na ST1 Academy. Reserve um momento para avançar.',
  practical_challenge:'Olá, {{1}}! Há um desafio prático esperando por você na ST1 Academy. Bora colocar em ação?',
  inactive_7d:'Olá, {{1}}! Sua jornada continua aberta na ST1 Academy. Volte para a próxima etapa.',
  inactive_14d:'Olá, {{1}}! Precisa de ajuda para retomar? Sua trilha está salva na ST1 Academy.',
  inactive_30d:'Olá, {{1}}! Faz tempo que não nos vemos na ST1 Academy. Sua evolução pode recomeçar hoje.',
  deadline_3d:'Olá, {{1}}! Uma tarefa da ST1 Academy está perto do prazo. Confira sua agenda.',
  assessment_pending:'Olá, {{1}}! Sua avaliação está liberada na ST1 Academy. Entre para concluir essa etapa.',
  three_consecutive_weeks:'Olá, {{1}}! Três semanas de evolução merecem reconhecimento. Continue na ST1 Academy.',
  monthly_wrapped:'Olá, {{1}}! Seu resumo do mês está na ST1 Academy. Veja o que você conquistou.',
  post_track_feedback:'Olá, {{1}}! Conte como foi sua trilha na ST1 Academy. Seu feedback ajuda a melhorar a experiência.'
};

export const whatsappAutomationCatalog=Object.freeze(emailAutomationCatalog.map(item=>Object.freeze({
  key:item.key,number:item.number,title:item.internalTitle,
  suggestedName:`st1_academy_${item.key}`,
  suggestedBody:copy[item.key]
})));

if(whatsappAutomationCatalog.length!==20||whatsappAutomationCatalog.some(item=>!item.suggestedBody))throw new Error('Catálogo WhatsApp incompleto.');
