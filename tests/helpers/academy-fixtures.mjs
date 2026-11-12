export function completeOnboardingForTest(db,userId){
  db.prepare('INSERT INTO academy_onboarding(user_id,answers_json,completed_at) VALUES(?,?,?)').run(userId,JSON.stringify({sector:'Outro',role:'Vendedor(a)',goal:'Especialista',dream:'Aprender outro canal',challenges:['Organização'],squad:''}),new Date().toISOString());
}
