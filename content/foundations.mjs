// Original ST1 lessons adapted from the references supplied by the project owner.
// Source documents remain references; their examples are not ST1 targets or policies.
const channels=['pap','digital','elite','indoor','pme'];
export const foundationSources={
  script:{title:'Script Comercial ST1 Internet',file:'SCRIPT COMERCIAL _ ST1 INTERNET (5) (1).docx',locator:'Abertura, Qualificação, Apresentação da solução, Objeção e Fechamento'},
  hunter:{title:'Playbook de Vendas — Hunter Franqueado',file:'Playbook de Vendas - Hunter Franqueado (1).pdf',locator:'Páginas 11–14 e 19–20: estudo, script, simulação, processo e acompanhamento'},
  coaching:{title:'Coaching de SDR — Modelo',file:'Coaching de SDR _ Modelo.xlsx',locator:'Instruções; Avaliação do SDR; Roleplay; Training Hard Skill'},
  objectives:{title:'Biblioteca de objetivos estratégicos ClearPoint',file:'ClearPoint Strategic Objective Library.xlsx',locator:'Strategic Objectives: objetivos de clientes, processos e aprendizado'},
  gaps:{title:'Modelo de análise de lacunas ClearPoint',file:'6a6920cb9b24b3734186a449_6a6920446fea16310df47b61_gap-analysis-template-clearpoint.xlsx',locator:'Start Here; Gap Analysis; Gap Types'},
  strategy:{title:'McKinsey — Business Strategy',file:'McKinsey-Special-Collections_BusinessStrategy.pdf',locator:'Páginas 14, 18, 33 e 34: formular perguntas, testar hipóteses e revisar decisões'},
  management:{title:'Manual de Administração V4 Company',file:'Manual de Administrao - V4_Company.pdf',locator:'Páginas 119–120, 125–127 e 134–137: competências, metas e desenvolvimento'},
  pife:{title:'Manual de Administração V4 Company — Cultura PIFE',file:'Manual de Administracao - V4_Company (CULTURA PIFE!).pdf',locator:'Página 16: estudo, prática e reflexão sobre desenvolvimento'},
  csv:{title:'Exemplo de estrutura de planejamento',file:'strategic-plan-st1-internet.csv',locator:'Cabeçalhos Goal, Objective, Measure, Owner, Target e Due; linhas são um exemplo municipal'}
};
export const foundationModules=[
  {id:'formacao-comercial-st1',title:'Comercial | Conversas que avançam',description:'Entenda o cliente, indique a solução e conduza o próximo passo com clareza.',tracks:channels,audience:['seller','supervisor']},
  {id:'gestao-desenvolvimento-st1',title:'Gestão | Desenvolvimento do squad',description:'Diagnóstico, feedback e reforço para ajudar cada pessoa a aplicar o que estudou.',tracks:channels,audience:['supervisor']},
  {id:'pesquisa-mercado-st1',title:'Estratégia (BI) | Pesquisa de Mercado',description:'Investigue o mercado e teste hipóteses para apoiar as decisões estratégicas da ST1.',tracks:channels,audience:['seller','supervisor'],scope:'strategy'}
];
const commercial=(id,title,summary,body,sources)=>({id:'st1-formacao-'+id,title,summary,body,sources,category:'treinamentos',tracks:channels,audience:['seller','supervisor'],modules:['formacao-comercial-st1']});
const supervisor=(id,title,summary,body,sources)=>({id:'st1-formacao-supervisor-'+id,title,summary,body,sources,category:'treinamentos',tracks:channels,audience:['supervisor'],modules:['gestao-desenvolvimento-st1']});
export const foundationLessons=[
  commercial('diagnostico','Entenda para indicar','Uma boa recomendação começa pela necessidade do cliente, pelo local e pelo uso.',`## O que você vai aprender
Identificar a necessidade do cliente antes de escolher uma oferta.

## Faça nesta ordem
- Apresente-se e descubra se a internet é para casa ou empresa.
- Confirme o endereço e consulte a viabilidade no procedimento do seu canal.
- Pergunte o que a pessoa faz na internet e o que mais incomoda na conexão atual.
- Entenda quantas pessoas e aparelhos usam ao mesmo tempo e como é o espaço.
- Resuma o que entendeu e peça a confirmação do cliente.

## Veja na prática
Exemplo de conversa: “Você comentou que a conexão fica ruim quando todos usam ao mesmo tempo. Isso acontece em toda a casa ou em um cômodo específico?”
A resposta ajuda a separar necessidade de velocidade e necessidade de distribuição do Wi-Fi. Confira o equipamento e as condições do plano no catálogo do canal.

## Antes de concluir
Você consegue explicar qual problema o cliente quer resolver? Se a resposta for só “quer internet”, faça mais uma pergunta antes de apresentar o plano.
`,['script','coaching']),
  commercial('recomendacao','Apresente uma solução que faz sentido','Ligue o problema do cliente aos benefícios e às condições reais da oferta.',`## O que você vai aprender
Explicar por que uma oferta atende ao uso relatado pelo cliente.

## Use três partes
- Necessidade: diga o que o cliente contou sobre o uso e o espaço.
- Solução: apresente o plano e o equipamento que constam no catálogo do seu canal.
- Condições: explique preço, aplicativos à escolha, inclusões, exclusões e restrições.

## Veja na prática
Exemplo de conversa: “Pelo uso que você descreveu, vou te mostrar esta opção. Aqui estão a velocidade, o equipamento e os aplicativos que você pode escolher. Vamos conferir se atende ao que você precisa?”
Quando houver SVA, explique a quantidade de aplicativos que pode ser escolhida e a versão disponível. Uma lista de opções não significa acesso a todos os aplicativos.

## Confira antes de prometer
- Consulte o catálogo atual do canal.
- Os planos de 2.000 Mega são exclusivos do condomínio DAHMAS.
- Confirme a disponibilidade e as condições no procedimento comercial.
- Se uma informação estiver divergente, confira com a gestão antes de informar ao cliente.

## Antes de concluir
Você explicou a oferta completa e pediu a confirmação do entendimento? O cliente precisa saber o que recebe e o que depende de escolha ou condição.
`,['script','coaching']),
  commercial('objecoes','Transforme a objeção em uma boa conversa','Escute, entenda o motivo e combine um próximo passo sem pressionar o cliente.',`## O que você vai aprender
Entender a dúvida que está por trás de uma objeção.

## Faça nesta ordem
- Escute até a pessoa terminar.
- Pergunte o que ela está comparando ou o que ainda falta para decidir.
- Responda com o benefício e a condição que realmente se aplicam à oferta.
- Confirme se a resposta resolveu a dúvida.
- Combine um próximo passo que a pessoa aceite.

## Veja na prática
Exemplo de conversa: “Entendi. Quando você diz que está caro, está comparando com outro plano ou com o valor que gostaria de pagar?”
Se houver outra oferta, compare preço e inclusões com os dados disponíveis. Se houver uma dúvida técnica, consulte a informação correta antes de responder.

## Treine com alguém
Uma pessoa faz o cliente e outra faz o atendimento. Teste uma objeção de preço, uma de confiança e uma de prazo. Ao final, diga uma atitude que funcionou e uma pergunta que pode melhorar.

## Antes de concluir
Você consegue responder sem inventar desconto, velocidade garantida em qualquer ambiente ou prazo que ainda não foi confirmado? Use o procedimento aprovado para conduzir o retorno.
`,['script','hunter','coaching']),
  commercial('continuidade','Deixe o próximo passo claro','Um bom registro ajuda o cliente e permite que o atendimento continue sem recomeçar.',`## O que você vai aprender
Registrar o contexto e encaminhar o atendimento com clareza.

## Deixe registrado
- Necessidade e uso relatados pelo cliente.
- Endereço e resultado da consulta de viabilidade.
- Oferta apresentada e condições explicadas.
- Dúvida ou objeção que ainda precisa de resposta.
- Próxima ação, responsável e combinação feita com o cliente.

## Veja na prática
Exemplo de registro: “Cliente quer conexão para trabalho e uso da família. Viabilidade consultada. Oferta e aplicativos apresentados. Pediu esclarecimento sobre equipamento. Próximo passo: conferir a condição e retornar no horário combinado.”
Use o sistema e o procedimento do seu canal para registrar dados e documentos. Em exercícios de treinamento, use uma situação fictícia, sem dados de clientes.

## Cada etapa tem um significado
Interesse do cliente, cadastro, assinatura do contrato e ativação são acontecimentos diferentes. Registre o estágio que realmente aconteceu.
Um horário solicitado ainda precisa da confirmação prevista no procedimento de instalação.

## Antes de concluir
Outra pessoa conseguiria continuar o atendimento lendo seu registro? Se faltar contexto, complete antes de encaminhar.
`,['script','hunter','coaching']),
  commercial('rotina','Estude, pratique e volte','Crie uma rotina simples de estudo e leve uma melhoria por vez para o atendimento.',`## Seu próximo avanço
Escolha uma habilidade que quer melhorar. Pode ser fazer uma pergunta melhor, explicar um aplicativo ou registrar o próximo passo.

## Um ciclo simples
- Estude o conteúdo relacionado à habilidade.
- Treine uma situação com alguém do squad.
- Peça um comentário sobre o que funcionou e o que pode mudar.
- Volte ao material quando surgir uma dúvida.
- Aplique a melhoria e converse com seu Supervisor sobre o resultado.

## Veja na prática
Exemplo de objetivo: “Quero conseguir explicar a quantidade de aplicativos à escolha sem deixar o cliente pensar que recebe todos.”
O exercício pode ser mostrar uma oferta do catálogo e explicar a escolha para um colega.

## Conecte com seu objetivo
Pense em uma conquista profissional que faria diferença para você e em um pequeno passo possível nesta semana. A reflexão é pessoal: você escolhe o que quer compartilhar.

## Antes de concluir
Concluir a leitura registra o estudo. A aprovação em uma avaliação e a aplicação na rotina são acompanhadas em seus próprios registros.
`,['pife','management','hunter']),
  supervisor('metas','O que o squad precisa aprender','Conecte o objetivo do time à habilidade e ao comportamento que precisam ser desenvolvidos.',`## O que você vai aprender
Transformar um objetivo de gestão em uma necessidade de desenvolvimento clara.

## Monte a conexão
- Objetivo do squad: qual resultado precisa melhorar?
- Habilidade: o que a pessoa precisa saber fazer para contribuir?
- Comportamento observado: o que será visto no atendimento?
- Evidência: em qual registro você vai conferir a aplicação?
- Revisão: quando vocês vão conversar sobre o avanço?

## Veja na prática
Exemplo de treinamento: o time precisa apresentar as ofertas com mais clareza. A habilidade é explicar inclusões e limites. A evidência é uma simulação em que o vendedor diferencia opções de aplicativos e aplicativos incluídos.
Defina o que será observado antes de avaliar. Use a mesma referência para situações comparáveis.

## Conhecimento, habilidade e atitude
Conhecimento é entender a regra. Habilidade é conseguir usá-la na conversa. Atitude é aplicar o procedimento com consistência. Cada dimensão pede uma forma de acompanhamento.

## Antes de concluir
Você definiu uma habilidade concreta, uma evidência e um momento de revisão? Use metas oficiais da ST1 quando trabalhar com resultados reais do squad.
`,['objectives','management','csv']),
  supervisor('diagnostico','Descubra o motivo da dificuldade','Separe falta de conhecimento, prática, recurso e clareza antes de escolher o reforço.',`## O que você vai aprender
Diagnosticar uma dificuldade usando fatos do atendimento.

## Faça cinco perguntas
- Onde a pessoa está hoje? Traga um atendimento, uma simulação ou um resultado de avaliação.
- O que ela precisa conseguir fazer? Descreva o comportamento esperado.
- Qual é a diferença entre os dois?
- Qual hipótese explica essa diferença?
- Qual ação pode ser testada e quando será revisada?

## Escolha o reforço certo
- Falta de conhecimento: estudar a regra ou a oferta correspondente.
- Falta de prática: simular o atendimento e receber feedback.
- Falta de recurso: verificar acesso, ferramenta ou condição com a gestão.
- Expectativa pouco clara: alinhar o que é esperado e como será observado.

## Veja na prática
Exemplo de diagnóstico: o vendedor conhece as opções de aplicativos, mas explica como se todas estivessem incluídas. Primeiro confira o entendimento da quantidade. Depois treine a explicação da escolha e reavalie uma nova simulação.

## Antes de concluir
Uma nota baixa mostra um ponto para investigar. Confira a causa antes de recomendar que a pessoa refaça tudo. Registre a hipótese e a evidência que pode confirmá-la ou contrariá-la.
`,['gaps','coaching','management']),
  supervisor('coaching','Feedback que vira prática','Use um exemplo específico, escolha uma melhoria e treine com o vendedor.',`## O que você vai aprender
Dar uma devolutiva que indique uma ação possível.

## Prepare a conversa
- Escolha um atendimento ou uma simulação e identifique o contexto.
- Observe a abertura, as perguntas, a explicação de valor, a comunicação, as objeções e o encaminhamento.
- Mostre uma ação que funcionou e uma situação que precisa melhorar.
- Peça a leitura do próprio vendedor sobre o que aconteceu.
- Escolham uma habilidade para treinar naquele momento.

## Veja na prática
Exemplo de devolutiva: “Você explicou o plano com clareza. Quando o cliente falou de lentidão no quarto, faltou perguntar se acontece no restante da casa. Vamos refazer esse trecho com uma pergunta de diagnóstico?”
Na simulação, o Supervisor faz o cliente. Depois, o vendedor refaz a conversa e vocês comparam o comportamento observado.

## Registre para acompanhar
Anote o critério, a evidência, a melhoria combinada e o ponto da próxima revisão. Compare situações semelhantes. Use os critérios e pesos definidos pela gestão quando houver uma avaliação formal.

## Antes de concluir
O vendedor sabe exatamente o que deve tentar de novo? “Melhore sua comunicação” é amplo. “Faça uma pergunta antes de recomendar” orienta a prática.
`,['coaching','hunter','management']),
  supervisor('reforco','Reforce e acompanhe a evolução','Ligue o diagnóstico ao conteúdo, à simulação e à revisão do comportamento.',`## O que você vai aprender
Construir um plano de reforço curto e verificável.

## Monte o plano
- Dificuldade: descreva o que foi observado.
- Conteúdo: indique o trecho que ajuda a resolver a dificuldade.
- Prática: combine uma simulação ou exercício relacionado.
- Responsável e prazo: deixem claros o próximo passo e a revisão.
- Evidência: compare uma nova situação com a anterior.

## Veja na prática
Exemplo de plano: estudar a quantidade de aplicativos da oferta, explicar a escolha para um colega e refazer uma simulação com o Supervisor. Na revisão, conferir se a explicação ficou completa e correta.
Se a dificuldade persistir, investigue a causa e ajuste o exercício. Se o comportamento melhorou, reconheça a ação concreta que a pessoa conseguiu aplicar.

## Leia os registros com cuidado
Leitura concluída indica estudo registrado. Quiz aprovado indica o resultado daquela avaliação. Aplicação na rotina precisa ser observada e registrada separadamente.
O resultado de uma formação ajuda a orientar o desenvolvimento. Decisões sobre carreira e responsabilidades seguem os critérios da gestão.

## Antes de concluir
O conteúdo escolhido resolve a dificuldade identificada? O plano precisa fazer sentido para a função e o canal da pessoa.
`,['gaps','coaching','management'])
];
foundationLessons.push(supervisor('evidencia','Observe e registre a aplicação','Separe estudo, avaliação e aplicação para orientar a evolução do vendedor.',`## O que você vai aprender
Acompanhar a aplicação de uma habilidade usando um exemplo concreto.

## Observe a situação
- Identifique a habilidade e o critério que vocês combinaram.
- Confira uma simulação ou um atendimento autorizado, dentro do contexto do canal.
- Anote a ação que funcionou e o ponto que ainda precisa ser praticado.
- Registre a devolutiva e o próximo momento de revisão.

## Veja na prática
Exemplo de acompanhamento: o vendedor concluiu o catálogo e foi aprovado na prática de aplicativos. Agora, em uma simulação, explica a quantidade à escolha e confirma que o cliente entendeu. O registro da simulação mostra essa aplicação.

## Compare com cuidado
Leitura, aprovação e aplicação são evidências diferentes. Compare a pessoa com o critério combinado e com o próprio avanço. Ao usar uma situação real, mantenha os dados do cliente no sistema autorizado.

## Antes de concluir
Você consegue dizer qual ação observou e qual será o próximo reforço? Escolha um exemplo que ajude a pessoa a melhorar.
`,['coaching','management']));
foundationLessons.push({id:'st1-formacao-mercado',title:'Pesquise antes de decidir',summary:'Separe fato, hipótese e exemplo para escolher uma ação com mais clareza.',category:'treinamentos',tracks:channels,audience:['seller','supervisor'],scope:'strategy',modules:['pesquisa-mercado-st1'],sources:['strategy','gaps'],body:`## O que você vai aprender
Investigar uma situação sem transformar uma impressão em certeza.

## Faça nesta ordem
- Defina a pergunta que precisa responder.
- Observe o contexto, a data e a fonte da informação.
- Levante mais de uma explicação possível.
- Procure um fato que possa contrariar sua hipótese.
- Escolha uma ação pequena, defina o que observar e marque a revisão.

## Veja na prática
Exemplo de investigação: algumas propostas não avançaram. As hipóteses podem ser preço, dúvida sobre equipamento, viabilidade ou momento de compra. Confira registros e conversas antes de mudar a abordagem do squad.
Quando comparar ofertas, use informações disponíveis e atuais. Separe informação confirmada, estimativa e condição que ainda precisa ser verificada.

## Uma decisão precisa de contexto
Um modelo preenchido de outra empresa ou setor serve como exemplo de organização. As metas e números precisam vir da realidade da ST1.
Ao acompanhar uma taxa, confira o período e o grupo de atendimentos usados no cálculo. Ausência de registro exige investigação.

## Antes de concluir
Você consegue apontar a fonte da informação e explicar o que mudaria sua decisão? Essa pergunta ajuda a revisar o plano quando o contexto muda.
`});
const cases={
  pap:['Prática PAP | Abra uma boa conversa','Você está em uma abordagem porta a porta. O morador diz que a conexão fica ruim quando a família usa ao mesmo tempo.','Apresente-se, confirme o interesse e faça perguntas sobre uso e espaço. Consulte a viabilidade e o catálogo PAP antes de indicar.','Como você abre a conversa e confirma a necessidade antes de mostrar a oferta?'],
  digital:['Prática Digital | Conduza o atendimento','O cliente envia uma mensagem pedindo preço e ainda não informou endereço nem uso.','Faça a abertura, confirme casa ou empresa e siga a consulta de viabilidade. Pergunte o uso, apresente a oferta adequada e combine o próximo passo conforme o processo Digital.','Qual pergunta vem antes da proposta e o que precisa ficar registrado para o retorno?'],
  elite:['Prática PAP Elite | Explique com precisão','O cliente pergunta se pode escolher o plano de 2.000 Mega em qualquer endereço.','Confira o endereço. A oferta de 2.000 Mega é exclusiva do condomínio DAHMAS. Fora desse local, consulte as alternativas disponíveis no catálogo PAP Elite.','Como você explica a restrição e apresenta uma alternativa sem prometer uma condição indisponível?'],
  indoor:['Prática Indoor | Oriente a escolha','O morador compara dois pacotes e entende que receberá todos os aplicativos mostrados na lista.','Consulte o catálogo Indoor, explique a quantidade à escolha e as versões. Para a oferta de 2.000 Mega, confirme que o endereço é no condomínio DAHMAS.','Como você explica a diferença entre opções disponíveis e aplicativos escolhidos?'],
  pme:['Prática PME | Entenda a operação','O responsável de um pequeno negócio quer internet para a equipe e pergunta pelos aplicativos do pacote.','Pergunte sobre o uso do negócio e consulte a viabilidade. No PME, 1.000 Mega inclui 1 SVA Basic e 1.300 Mega inclui 1 SVA Premium, conforme as listas do catálogo.','Como você conecta o uso do negócio à oferta e explica a única escolha de aplicativo?']
};
for(const [track,[title,situation,action,question]] of Object.entries(cases))foundationLessons.push({id:'st1-formacao-caso-'+track,title,summary:'Treine uma situação do seu canal e confira a oferta antes de responder.',category:'treinamentos',tracks:[track],audience:['seller','supervisor'],modules:['vendas-'+track],sources:['script','hunter','coaching'],body:`## Seu cenário de treino
Exemplo de treinamento: ${situation}

## Conduza a conversa
${action}

## Faça a simulação
- Uma pessoa representa o cliente e a outra representa o atendimento.
- Explique sua decisão usando o catálogo do canal.
- Peça um comentário sobre a clareza da explicação.
- Refaça a parte que deixou dúvida.

## Confira seu entendimento
${question}

## Antes de concluir
Compare sua resposta com o catálogo e o processo do canal. O botão de conclusão registra que você estudou este exercício. As avaliações do percurso registram a aprovação; o Supervisor acompanha a aplicação na rotina.
`});
