import {test} from 'node:test';
import {execFileSync} from 'node:child_process';
import {resolve} from 'node:path';

test('assessment limit and authorization modules parse with Node',()=>{
  for(const path of ['lib/attempt-limits.mjs','lib/quizzes.mjs','lib/game.mjs','lib/context.mjs','server.mjs','public/assets/academy.js','public/assets/quiz-panel.js']){
    execFileSync(process.execPath,['--check',resolve(path)],{stdio:'pipe'});
  }
});
