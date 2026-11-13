import bank from './database-assessments.json' with {type:'json'};

const toQuestion=(question,form)=>{
  const id='tech-'+question.id.toLowerCase();
  const options=question.options.map((text,index)=>({id:`${id}-${index+1}`,text}));
  return {id,stem:question.stem,options,answer:options[question.correctIndex].id,explanation:question.explanation,critical:!!question.critical,topic:question.topic};
};

export const databaseAssessmentDrafts=bank.forms.map(form=>({
  id:'rascunho-'+form.id.toLowerCase(),title:form.title,
  description:'Rascunho privado do instrutor. Revisar escopo, gabarito, criticidade e aprovação antes de publicar.',
  type:'flash',status:'draft',tracks:['tech'],audience:['seller','supervisor'],
  durationSeconds:form.durationSeconds,questions:form.questions.map(q=>toQuestion(q,form)),
}));
