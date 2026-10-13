# Mapa de conhecimento e percursos — ST1 Academy

O mapa principal é um percurso conectado de estudo, prática e certificação. O participante enxerga o fluxo completo do seu canal ou função, incluindo etapas bloqueadas, e recebe os próximos passos conforme cumpre os pré-requisitos.

## Percursos iniciais

Estão cadastrados PAP, Digital, Indoor, PME, PAP Elite e Supervisor. A conta só recebe os percursos compatíveis com seus canais, função e permissões. O Admin pode organizar os percursos e acompanhar as pessoas autorizadas. Supervisores estudam no próprio percurso e acompanham os vendedores vinculados à sua supervisão ou squad, conforme os acessos existentes.

Nos canais comerciais, os materiais originais são o ponto de partida. As práticas são conectadas às fontes das suas perguntas: planos e aplicativos dependem do catálogo; questões sobre o processo dependem do material de processo; práticas com fontes diferentes podem exigir ambos. A certificação depende das práticas conectadas, além da regra vigente de 80% de acertos e todas as regras críticas.

Os canais comerciais também conectam diagnóstico do cliente e catálogo à recomendação da oferta. Recomendação abre objeções e continuidade; o caso específico do canal exige ambos. A certificação exige esse estudo e as práticas avaliadas. Rotina de evolução é um ramo opcional.

O percurso Supervisor relaciona objetivos, diagnóstico, coaching e observação da aplicação ao plano de reforço. Coaching e observação são ramos que precisam ser estudados antes do reforço. O marco final registra estudos concluídos e preparo para aplicação; não inventa um certificado nem comprova aplicação prática. Os POPs privados permanecem na curadoria; seu percurso anterior é preservado como rascunho. Uma etapa sem recurso publicado ou sem liberação para a pessoa aparece bloqueada, aguardando a gestão.

Pesquisa de Mercado é exclusiva da área Estratégia (BI). A permissão `strategy` é liberada explicitamente pelo Admin em Acessos, além da permissão de materiais. Essa área independe dos canais comerciais liberados. Ela não é concedida por padrão a vendedores ou Supervisores. Módulos e conteúdos têm `scope` geral ou estratégia, e um conteúdo também herda a restrição de qualquer módulo de estratégia ao qual esteja vinculado. Os endpoints de conteúdo, estudo, arquivo e capa usam a mesma verificação.

A importação das aulas e a expansão dos seis percursos iniciais ocorrem uma vez, preservando registros anteriores. Apenas percursos canônicos ainda na revisão zero são expandidos. Curadorias que o Admin já editou não são sobrescritas; os novos conteúdos ficam disponíveis nas escolhas do editor.

## Conexões e conclusão

- Cada percurso tem um ponto de partida e etapas conectadas sem ciclos.
- Uma etapa pode exigir **todos** os pré-requisitos ou **uma** das alternativas explicitamente configuradas.
- A conclusão libera apenas os próximos nós cujos requisitos foram satisfeitos; não libera etapas de outros canais.
- Materiais usam a conclusão individual da versão atual do conteúdo. Título e descrição não invalidam o estudo; corpo, link e bytes do arquivo invalidam.
- Práticas usam a aprovação registrada na versão atual da avaliação. A abertura do material não produz aprovação, XP ou certificado.
- Conexões opcionais e a indicação de quais etapas contam para concluir o percurso são configuráveis pelo Admin.
- Conteúdos compartilhados podem participar de percursos diferentes. Para abrir um mesmo recurso, basta uma rota aplicável que já o tenha liberado; cada percurso mantém suas próprias dependências.

O bloqueio de Vendedores e Supervisores também é verificado no servidor. URLs de leitura e download, conclusão de estudo, registro de tempo, início ou retomada de práticas abertas e certificação não permitem pular a sequência. Resultados e certificados históricos são preservados. O Admin mantém acesso de curadoria aos recursos e controles administrativos; o desenho do seu mapa continua projetando suas conclusões reais.

## Gestão e expansão

Dentro do mapa, **Organizar percurso** abre a edição de nome, descrição, canal/função, público, publicação, etapas, recursos e pré-requisitos. **Novo percurso** cria um rascunho. O Admin pode incluir, editar e excluir etapas, publicar, arquivar e republicar percursos. Exclusão de uma etapa reconecta suas dependências para revisão; o servidor rejeita ciclos, conexões inválidas, recursos de outro canal e alterações concorrentes por revisão.

A Biblioteca continua recebendo módulos e materiais publicados automaticamente. Entrar na Biblioteca não insere um novo ramo no percurso: o Admin vincula o material à etapa correta. Essa escolha evita liberar um conteúdo sem relação com o caminho de estudo. Os percursos iniciais são cadastrados uma vez; reiniciar não sobrescreve a curadoria.

Cada percurso admite até 200 etapas e 800 conexões. Acervos maiores devem ser organizados em percursos coerentes por área/canal/função, mantendo um mapa legível para o participante. A interface carrega somente o percurso escolhido, com disposição determinística por dependência, setas, zoom, arraste, minimapa, visão do fluxo inteiro e uma lista de etapas acessível em gaveta. No celular, o mapa começa focado no próximo passo em tamanho legível.

## API e dados

- `GET /api/learning-flows`: percursos liberados para a pessoa.
- `GET /api/learning-flows/:id`: nós, conexões, bloqueios, motivos, avanço e próximo passo (`schemaVersion: 3`).
- `userId` só permite acompanhamento autorizado; não registra progresso em nome de outra pessoa.
- `/api/admin/learning-flows`: criação, leitura, edição e arquivamento, exclusivos do Admin, com auditoria e revisão.
- Os dados ficam na tabela `academy_learning_flow`. Estudos, tentativas, pontuação e certificados continuam nas tabelas anteriores, sem duplicação.
- As rotas anteriores de projeção `/api/knowledge-map` e `/api/game/knowledge` continuam disponíveis para compatibilidade e análise das evidências. A interface principal usa o percurso conectado.

Os testes verificam bloqueio por API, ramificações, junção de pré-requisitos, alternativas, canal/função, supervisão, revisão, recursos privados, ciclos, arquivo/restauração, cadastro inicial idempotente e disposição de 200 nós. Os demais testes continuam cobrindo autenticação, leitura, avaliação, certificado e preservação de dados. Critérios de aplicação no trabalho e promoção por Tier dependem de evidências próprias e não são concedidos por uma leitura declarada.
