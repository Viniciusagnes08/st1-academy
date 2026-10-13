export function publicQuestion(question) {
  return { id: question.id, stem: question.stem, topic: question.topic, critical: question.critical, options: question.options.map(({id,text})=>({id,text})) };
}

export function grade(questions, answers, minimumPercent = 80) {
  if (!answers || typeof answers !== 'object' || Array.isArray(answers)) throw new Error('Respostas inválidas.');
  const expected = new Set(questions.map(q=>q.id));
  if (Object.keys(answers).some(key=>!expected.has(key))) throw new Error('A tentativa contém perguntas desconhecidas.');
  const details = questions.map(q=>{
    const chosen = answers[q.id];
    if (!q.options.some(option=>option.id===chosen)) throw new Error('Responda todas as perguntas antes de concluir.');
    return { id:q.id, stem:q.stem, topic:q.topic, critical:q.critical, correct:chosen===q.answer, chosen:q.options.find(o=>o.id===chosen).text, expected:q.options.find(o=>o.id===q.answer).text, explanation:q.explanation, source:q.source };
  });
  const correct = details.filter(q=>q.correct).length;
  const failedCritical = details.filter(q=>q.critical&&!q.correct);
  const score = Number((100 * correct / questions.length).toFixed(2));
  const categories = [...new Set(details.map(q=>q.topic))].map(topic=>{
    const group=details.filter(q=>q.topic===topic);
    return {topic,correct:group.filter(q=>q.correct).length,total:group.length};
  });
  return {score,correct,total:questions.length,approved:score>=minimumPercent&&failedCritical.length===0,failedCritical:failedCritical.length,categories,details};
}

export function shuffle(items) {
  const result=[...items];
  for(let i=result.length-1;i>0;i--){
    const bytes=crypto.getRandomValues(new Uint32Array(1));
    const j=bytes[0]%(i+1);
    [result[i],result[j]]=[result[j],result[i]];
  }
  return result;
}
