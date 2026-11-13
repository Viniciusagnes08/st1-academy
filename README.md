<!-- Versão 2.6.3: biblioteca e evolução em lotes, entrada progressiva e hospedagem gratuita. -->
# ST1 Academy

Academia de capacitação comercial, com identidade ST1, conteúdos privados, gamificação e cinco trilhas: PAP, Digital, PAP Elite, Indoor e PME. Versão 2.6.3.

A entrada busca conta e catálogo em uma única resposta autenticada. A biblioteca reúne materiais, módulos e retomada sem repetir a autenticação em três pedidos. Conteúdos, versões, estudos, arquivos, etiquetas e evidências das etapas são projetados por leituras em lote, com estado privado apenas durante uma solicitação síncrona. Cada novo acesso confere novamente o perfil e o progresso; gravações continuam sem esse lote de leitura. O Início mostra a saudação e o Starzinho enquanto os módulos chegam, e preenche a evolução de forma independente. Uma resposta antiga não substitui outra página depois de navegar. A hospedagem permanece Supabase Free + Render Free; o despertar após inatividade continua sendo uma limitação do Render.

As páginas reutilizam consultas determinísticas ao PostgreSQL durante uma única resposta. O estado é descartado entre acessos e invalidado após gravações, evitando recalcular repetidamente a evolução sem manter permissões ou progresso antigos.

O mapa de conhecimento apresenta o percurso completo de cada canal ou função, com etapas conectadas, pré-requisitos, zoom, arraste, minimapa e detalhes em gaveta. O Admin configura quais estudos e práticas abrem cada próximo passo. Estudo e evidências de avaliação aparecem com estados distintos. A organização, as versões e as permissões estão descritas em [MAPA_CONHECIMENTO.md](MAPA_CONHECIMENTO.md).

As referências fornecidas pela gestão foram adaptadas em 16 aulas originais, incluindo cinco situações práticas por canal. Comercial e Gestão têm seus próprios conteúdos. Pesquisa de Mercado fica na área **Estratégia (BI)** e exige liberação específica em Acessos; vendedores e Supervisores comerciais não recebem essa permissão por padrão. [BASES_FORMACAO.md](BASES_FORMACAO.md) registra fontes, adaptações e limites.

A formação **Tech · Banco de Dados** foi adicionada como trilha de estudo própria, independente de BI, aos cinco volumes visuais existentes. Os PDFs são importados para o armazenamento privado da Academy e o acesso depende da liberação explícita da trilha Tech pelo Admin. O percurso encadeia os cinco volumes; o banco de avaliações foi importado como rascunho privado do instrutor. Avaliações e certificação permanecem bloqueadas até a revisão e publicação acadêmica. Os papéis de gestão existentes (Vendedor, Supervisor e Admin) não foram alterados.

## O que funciona

- 100 questões práticas nas cinco trilhas comerciais; a formação Tech está em modo de estudo, e suas avaliações seguem em rascunho privado para revisão.
- Conta pessoal por convite ou cadastro com uma conta Google de e-mail verificado. No cadastro aberto por Google, a pessoa começa como Vendedor sem trilhas ou áreas liberadas; o Admin configura seu acesso.
- Perguntas e alternativas embaralhadas, com uma resposta por pergunta.
- Respostas salvas no servidor, com retomada da tentativa.
- Correção no servidor: aprovação exige pelo menos 16 acertos em 20 e acerto em todas as regras críticas.
- Devolutiva com explicação e link para a página correspondente do material.
- Uma insígnia e um certificado por trilha e versão, sem duplicar conquistas ao refazer.
- Certificado PDF com nome, trilha, nota, emissão, referência única e QR code para verificar o registro e o arquivo original.
- Área de Acessos com perfis de Vendedor, Supervisor e Admin, edição das permissões e bloqueio de contas sem apagar o histórico.
- Acompanhamento por equipe, gestão de convites, tentativas, notas e exportação CSV.
- Percurso de etapas com o Starzinho oficial, práticas curtas, XP, níveis e incentivo conforme o próximo passo.
- Resultados com ranking de pessoas e squads, filtros de período e perfil, e mapa de conhecimento por tema.
- Squads configuráveis, chat interno, certificados compartilhados e notificações de conquistas.
- Provas relâmpago com prazo fixo no servidor e criação de perguntas pelo Admin.
- Perfil pessoal com foto, capa, história, constância, conquistas e 22 personalizações liberadas pelo progresso.
- Solicitação de entrada no squad com confirmação da gestão e configuração das recompensas pelo Admin.
- Agenda pessoal e programação do time, com tarefas, treinamentos, prazos e conteúdo de apoio.
- Entregas e presenças conferidas pela gestão, com devolutivas e acompanhamento de participação.
- Avisos internos persistentes e exportação de compromissos em .ics.
- Entrada aberta com Google e integração com uma agenda secundária do Google Calendar, após a configuração do cliente e o consentimento da pessoa.
- Cadastros de eventos, conteúdos, certificados, insígnias, squads e etiquetas, com busca, edição, revisão, lixeira e recuperação.
- Modelos de reconhecimento, emissão individual com evidência, PDF ou SVG preservado e revogação ou restauração com motivo.

O gabarito fica em `content/questions.json`, fora da pasta pública. O navegador recebe somente enunciados e opções durante a avaliação. O servidor ignora notas e aprovações enviadas pelo navegador e calcula o resultado pelas respostas.

## Entrada na ST1 Academy

`/login` é a tela de entrada, com **Entrar** e **Criar conta**. O painel da Academy exige uma sessão válida; quem abre a página sem estar conectado vai para o login. Quem já está conectado pode continuar com a própria conta ou escolher entrar com outra.

O primeiro acesso com e-mail e senha usa o convite pessoal gerado pelo Admin. É possível abrir o convite ou colar o link na aba Criar conta. Nome, e-mail, perfil e permissões continuam definidos pelo convite. A pessoa cria e confirma uma senha de pelo menos 12 caracteres. Links de convites anteriores, no formato `/?convite=...`, continuam funcionando.

Quando `ACADEMY_SMTP_HOST`, `ACADEMY_SMTP_PORT`, `ACADEMY_SMTP_USER`, `ACADEMY_SMTP_PASSWORD` e `ACADEMY_MAIL_FROM` estão configurados no servidor, criar um convite envia um e-mail de boas-vindas com o link pessoal. A tela informa se o SMTP aceitou ou falhou e mantém o link para cópia. Convites pendentes podem ser reenviados em **Acessos**; o reenvio gera um novo link válido por 7 dias e invalida o anterior. A senha SMTP deve ficar apenas na configuração privada do servidor. O mesmo SMTP, configurado por variáveis de ambiente ou no painel **Admin → Integrações**, também é utilizado para links de redefinição de senha e alertas de segurança. Sem SMTP funcional, a recuperação não enviará e-mails: valide o remetente com uma caixa de teste antes de liberar o recurso para o time.

Quando o Google está configurado, **Entrar com Google** e **Criar conta com Google** aceitam qualquer conta Google com e-mail verificado. Não é necessário convite para esse cadastro. Uma nova pessoa recebe o perfil Vendedor, sem trilhas e sem permissões de áreas; o Admin recebe um aviso interno e libera o que ela poderá acessar. Conectar uma conta Google a uma conta ativa existente preserva seu nome, papel, equipe e permissões. O cadastro com senha continua exigindo convite.

**Salvar meu login neste dispositivo** é uma escolha explícita. Quando marcada, lembra somente o e-mail neste navegador e solicita ao Better Auth uma sessão persistente. Sem a opção, o cookie da sessão é temporário. A senha nunca é gravada no armazenamento da página. Desmarcar a opção no próximo login bem-sucedido remove a preferência de e-mail anteriormente salva. Sair encerra a sessão e mantém o e-mail lembrado, se essa preferência foi escolhida.

A tela inclui mostrar/ocultar senha, mensagens de erro em português, confirmação da senha no cadastro, navegação das abas pelo teclado e adaptação ao celular. O link **Esqueci minha senha** abre a recuperação por e-mail. Para contas ativas com senha local, o sistema envia um link de uso único válido por 30 minutos, com máximo de três solicitações por e-mail e dez por IP a cada hora. A resposta não informa se o e-mail está cadastrado. Após definir uma nova senha (mínimo de 12 caracteres), as sessões antigas são encerradas e o usuário recebe um aviso de segurança. Contas exclusivas do Google continuam com autenticação Google. O login comum leva a Meu percurso. Depois de ativar uma conta nova, a pessoa chega à apresentação do perfil e pode preenchê-lo ou continuar estudando para completar depois.

O login tem uma composição animada em preto, branco e laranja: partículas e feixes na tela inteira, órbitas e insígnias flutuantes, profundidade pelo mouse, entrada progressiva dos títulos, abas deslizantes e feedback ao toque. Os campos ficam estáveis. A contagem de trilhas, as cores do canto e os textos redundantes foram removidos. A marca traz a frase Conhecimento que vira resultado, e o título de entrada traz Seu próximo nível começa aqui. Não foi acrescentada biblioteca ao projeto.

O botão de controle de animações foi retirado. Os efeitos continuam funcionando sem depender desse elemento. A escolha anterior de movimento completo permanece válida; uma pausa antiga não paralisa mais a tela. Sem uma escolha anterior de efeitos completos, a página acompanha a preferência de movimento reduzido do dispositivo. Os estilos gerais e específicos do login usam a mesma decisão. Os arquivos do login usam referência de versão para evitar o carregamento de estilos anteriores.

## Perfis e permissões

- **Vendedor:** vê as trilhas liberadas pelo Admin. Materiais, provas e conquistas podem ser liberados ou retirados separadamente.
- **Supervisor:** também faz as próprias provas e recebe suas próprias insígnias e certificados, com a mesma regra de 80% e acerto em todas as regras críticas. Em Minha equipe, acompanha somente os vendedores vinculados a ele, nas trilhas liberadas para o Supervisor. Os resultados pessoais ficam separados dos resultados da equipe.
- **Admin:** gerencia todos os perfis, convites, equipes, permissões e resultados. Tem acesso completo à Academia.

Em **Acessos**, o Admin escolhe o perfil, as áreas visíveis, as trilhas e os vínculos com a equipe. Pode editar tanto uma conta ativa quanto um convite pendente. O acesso é conferido no servidor a cada operação: abrir diretamente uma URL não libera uma prova, relatório ou PDF restrito. Revogar uma trilha ou a permissão de provas também bloqueia a continuação de uma tentativa já aberta.

A tela separa **Contas** e **Convites**, apresenta os totais por perfil e oferece busca por nome ou e-mail, filtro de perfil e filtro de situação. **Convidar pessoa** e **Editar acesso** abrem uma gaveta com rolagem própria, mantendo a lista organizada. A edição do único Admin ativo protege seu perfil e seu acesso também na interface. Depois de salvar, a lista é atualizada antes de fechar a gaveta.

Bloquear uma conta impede o acesso pela sessão existente e preserva tentativas e certificados. Reativar a conta recupera esse histórico. Convites revogados deixam de permitir o cadastro. O último Admin ativo não pode ser bloqueado ou rebaixado. As mudanças ficam registradas em uma auditoria de acessos, sem armazenar os links pessoais dos convites nela.

A atualização migra os dados do piloto anterior, preservando contas, convites, tentativas e certificados. O controle de permissões abrange a ST1 Academy. A Central Comercial já publicada continua aberta para quem tiver seu link.

## Perfil e passaporte de evolução

**Meu perfil**, na gaveta da conta, apresenta foto, nível, título conquistado, squad e uma capa animada. A seção Minha história permite adicionar telefone com DDD, cidade, interesses, objetivo de vida, biografia e maior sonho. O nome e o e-mail vêm do cadastro; o perfil de acesso e suas liberações continuam controlados pela gestão. Foto e capa próprias, em JPG, PNG ou WebP de até 5 MB, estão disponíveis desde o primeiro nível.

O passaporte usa registros do servidor: Score em XP, nível, etapas validadas, certificações, posição no squad, dias seguidos e calendário dos últimos 28 dias. Score é o XP registrado na Academy, sem uma segunda fórmula de desempenho. A posição compara participantes do mesmo papel no squad; Admin não participa da competição. Empates compartilham posição.

Os marcos de constância são primeiro dia, 3, 7 e 30 dias consecutivos. O perfil também reconhece a entrada em um squad e o preenchimento das informações. Esses marcos não concedem XP nem aprovação. Conquistas e certificados das avaliações mantêm a exigência de 80% e acerto de todos os pontos críticos.

Um dia de estudo exige uma prática concluída com resposta ou pelo menos 45 segundos de atividade registrada no leitor de um conteúdo liberado. O navegador envia sinais de presença a cada 15 segundos enquanto está visível; o servidor limita o crédito por intervalo, ignora sinais rápidos e pausas longas e considera apenas uma sessão de leitura por conta. O login e a edição do perfil não contam. A data usa o fuso de Fortaleza. Essa atividade registra constância, sem substituir as avaliações de conhecimento. Avaliações concluídas anteriormente permanecem reconhecidas; dias antigos de leitura sem registro não são inventados.

**Personalizar** oferece 6 cores, 6 efeitos de capa, 5 molduras e 5 títulos. A pessoa pode visualizar as opções liberadas antes de salvar. Cada opção bloqueada informa seus requisitos. Em **Cadastros → Liberações do perfil**, somente o Admin define nível mínimo, quantidade de certificações e posição no squad, combinando as condições. Laranja ST1, Sinal ST1, moldura Essencial e título Aprendiz ST1 permanecem livres. Recompensas de ranking exigem também XP positivo e pelo menos 3 participantes do mesmo papel. Se uma regra ou permissão mudar, a aparência efetiva volta à opção inicial quando necessário, preservando a escolha anterior para uma possível liberação futura. Recompensas visuais não concedem novas permissões.

A história é privada por padrão. A pessoa pode compartilhar cidade, interesses, objetivo, biografia e sonho com quem está autorizado a ver seu perfil. O telefone fica restrito ao titular e à gestão autorizada; colegas do squad não o recebem. Perfis e imagens exigem sessão válida e vínculo autorizado: a foto não ganha um endereço público. As imagens ficam no banco privado e não no pacote de código. Alterações são auditadas sem copiar os textos pessoais ou o telefone para o registro de auditoria.

O vendedor ou supervisor escolhe um squad ativo e solicita entrada. O pedido pendente não concede acesso ao canal. Em **Resultados → Pedidos de squad**, o Admin ou o supervisor vinculado com permissão de equipe pode responder à primeira entrada; transferências exigem Admin. A aprovação preserva uma única associação e não muda o papel nem as permissões da pessoa.

Rotas da interface: `#perfil`, `#perfil/editar`, `#perfil/estilo`, `#pedidos-squad` e `#perfil-regras`. As APIs de perfil, mídia privada, constância e pedidos conferem sessão, acesso e origem no servidor; as edições usam revisão para evitar sobrescrever outra tela.

## Agenda e participação

**Aprender e evoluir → Minha agenda** reúne os compromissos atribuídos à própria pessoa. O calendário mensal oferece seleção do dia, filtro de tarefas ou treinamentos e acesso ao próximo compromisso. Cada treinamento tem início, fim, local ou link de reunião, confirmação do convite e declaração de presença. Cada tarefa tem abertura, prazo, orientação de preenchimento, conteúdo de apoio opcional e uma resposta de até 5.000 caracteres.

A agenda usa espaçamento ampliado entre calendário, foco do mês e lista de compromissos. As ações de programação ficam no cabeçalho; no celular, os blocos e botões se reorganizam para a largura disponível. Nas demais telas, os atalhos de gestão também ficam junto ao título da página. Em Resultados, **Participação do time** e **Pedidos de squad** compartilham essa área.

**Minha agenda → Programação** permite selecionar pessoas específicas, squads, perfis de acesso ou todas as pessoas sob a gestão. Admin programa para os acessos ativos; Supervisor com permissão de acompanhamento programa para sua equipe autorizada e para si. O Supervisor pode conferir a participação da própria equipe em um encontro organizado pelo Admin, sem alterar o encontro de toda a empresa. Novas pessoas que correspondam a um público de squad ou perfil entram nos compromissos ainda abertos. Essa atribuição não concede acesso a materiais ou áreas restritas.

A pessoa envia sua resposta e recebe a devolutiva da gestão. A gestão pode validar a entrega ou solicitar ajuste. Entregas posteriores ao prazo continuam possíveis e ficam identificadas; o prazo vigente no momento da entrega fica preservado no histórico, mesmo se a programação for alterada depois. Aceitar um convite não comprova presença. A declaração de presença abre dez minutos antes do encontro e permanece disponível até 24 horas depois do fim; a gestão confirma a presença ou registra a ausência. Ninguém valida a própria participação.

**Minha agenda → Participação do time** mostra entregas validadas, entregas no prazo, tarefas sem preenchimento após o prazo, presenças conferidas e convites aceitos. O percentual de compromissos cumpridos considera somente compromissos com prazo encerrado. Compromissos futuros não reduzem o percentual; uma resposta aguardando validação não conta como falta de preenchimento. A agenda não concede XP ou reconhecimento automaticamente. O Admin pode vincular um modelo de certificado a uma participação validada e emitir o reconhecimento com evidência. As avaliações continuam aplicando suas regras próprias.

Os avisos ficam em **Notificações**. A atribuição, alteração da programação, devolutiva e lembretes usam registros persistentes. O servidor verifica lembretes a cada minuto enquanto está em execução, sem repetir o mesmo lembrete da mesma revisão. A agenda interna funciona mesmo sem Google. Os arquivos .ics são cópias para importação e não constituem sincronização automática.

## Google e sincronização da agenda

O botão **Entrar com Google** permanece desabilitado até o servidor receber `GOOGLE_CLIENT_ID` e `GOOGLE_CLIENT_SECRET`. Depois da configuração, o Google permite cadastro aberto com e-mail verificado. O servidor atribui o perfil Vendedor sem trilhas e permissões ao novo cadastro; uma conta já existente conserva seus acessos. Contas bloqueadas continuam bloqueadas. O cadastro por convite e o acesso com e-mail e senha permanecem disponíveis. Uma falha temporária na consulta do painel após o login não encerra automaticamente uma sessão válida.

Depois da ativação e do consentimento da pessoa, a integração cria uma agenda secundária **ST1 Academy · Minha evolução**. O escopo `calendar.app.created` permite administrar as agendas criadas pelo aplicativo; eventos pessoais de outras agendas não são importados. Os treinamentos são organizados no calendário do criador, com convites para os participantes autorizados. As tarefas aparecem na agenda ST1 de cada participante que conectou o Google, como um bloco de 15 minutos antes do prazo. As respostas preenchidas na Academy não são copiadas para os eventos.

Mudanças de horário, descrição, público e cancelamento na Academy são enviadas ao Google. Alterações de encontros conhecidos na agenda ST1 do organizador e respostas dos convidados voltam para a Academy, sem transformar a confirmação do convite em presença. A atualização usa referências estáveis, controle de revisão e sincronização incremental. Falhas de autorização pedem reconexão; outras falhas são tentadas novamente. A pessoa pode pausar o vínculo sem apagar o histórico da Academy ou o calendário do Google.

O projeto exclusivo da Academy e o cliente OAuth Web foram criados com autorização do responsável pela ST1. A API Calendar está ativa, e a [política de privacidade](https://st1-central-comercial.vercel.app/academy-privacidade) foi publicada e conferida na Central Comercial. O público OAuth foi conferido no Google como **Em produção**, do tipo **Externo**, com os quatro escopos configurados classificados como não confidenciais.

**A conexão real da conta Admin do piloto foi concluída e conferida.** O retorno do Google preservou a mesma conta, sessão e papel. A agenda secundária foi criada, o servidor registrou o vínculo como conectado e a leitura de sincronização terminou sem erro. Uma segunda conferência foi acionada manualmente pela agenda. As credenciais e os tokens continuam somente no servidor privado.

Nenhum evento fictício foi criado no calendário real. Criação, edição, convites, cancelamento e recuperação de eventos foram verificados em bancos isolados com respostas simuladas da API. A conexão e a leitura reais confirmadas não substituem a conferência de cada um desses cenários externos com compromissos autorizados do time. **Minha agenda → Programação → Preparar conexão**, exclusivo do Admin, mostra a origem e o retorno corretos. O passo a passo e a conferência estão em [GOOGLE_CALENDAR_SETUP.md](GOOGLE_CALENDAR_SETUP.md).

## Rodar o módulo

Requer Node.js 24.15.0 ou posterior.

No piloto Windows já configurado, abra **Abrir ST1 Academy.cmd** na pasta original do projeto. O servidor inicia em segundo plano, com verificação da porta e da resposta da Academy; contas, sessão e configuração existentes são preservadas. O iniciador não instala serviço ou início automático. Depois de reiniciar o computador, abra o arquivo novamente. Veja [INICIAR_NO_WINDOWS.md](INICIAR_NO_WINDOWS.md) para conferir os requisitos sem iniciar e localizar os logs privados.

```powershell
npm ci --ignore-scripts
npm start
```

Abra `http://localhost:4175`. O banco SQLite e a chave de autenticação são criados em `data/`. Guarde essa pasta de forma privada e preserve-a em backups; ela contém contas e registros. Ela não faz parte do pacote de código.

Para gerar o primeiro convite de gestor:

```powershell
npm run setup -- --nome "Nome do gestor" --email "gestor@empresa.com"
```

Abra o convite no navegador e defina a senha na tela. O comando não cria outra conta de gestão se já houver um gestor ou convite válido. As próximas pessoas são convidadas pela área de Acessos, com o perfil de Vendedor, Supervisor ou Admin. O módulo gera o link e o Admin o envia ao destinatário; nenhum e-mail ou mensagem é enviado automaticamente.

O servidor padrão atende apenas no computador local. `PORT`, `ACADEMY_BASE_URL`, `ACADEMY_DATA_DIR` e `ACADEMY_LISTEN_HOST` configuram porta, origem autorizada, armazenamento e endereço de escuta. A origem deve corresponder ao endereço usado pelo navegador.

## Piloto local e publicação

O piloto aberto neste trabalho usa `http://localhost:4177` e o banco principal em `data/`, com `ACADEMY_TEST_MODE=1`. Esse modo identifica a experiência e os certificados como teste interno. As contas fictícias usadas no QA da gamificação e do perfil ficam em outros bancos, em `work/academy-engagement-preview-data`, `work/academy-profile-preview-data` e `work/academy-agenda-preview-data`, fora deste projeto. Nenhuma conta, resultado, informação pessoal, compromisso ou mensagem de demonstração é adicionada ao banco principal. Os 7 dias de estudo, o perfil de nível 6 e os compromissos das imagens de QA são dados fictícios de teste.

Esta versão tem armazenamento PostgreSQL real e foi validada com a migração de uma cópia dos conteúdos e da conta de gestão. A publicação usa **Render Free + Supabase Free**, sem disco pago: `render.yaml` seleciona `plan: free`, e contas, materiais, arquivos, mapas e resultados ficam no banco privado do Supabase. [PUBLICACAO.md](PUBLICACAO.md) descreve a transferência, as variáveis privadas e os limites dos planos gratuitos. A publicação só está concluída após verificar o serviço no seu endereço real; a integração com o ST1 Sales continua pendente do acesso ao código desse sistema.

O banco também fica vinculado ao ambiente de teste ou produção em que foi iniciado. Trocar apenas a variável de teste não transforma aprovações do piloto em certificados de produção. Use um banco separado para a publicação e novas avaliações; preserve os dados do piloto para consulta.

O piloto local conserva SQLite. O servidor publicado usa PostgreSQL por uma conexão TLS privada, com tabelas relacionais no esquema `academy`, sem acesso anônimo pela Data API. O repositório compatível preserva hashes de senha, arquivos e regras dos serviços existentes. O armazenamento e a autenticação não dependem do disco temporário do Render. A recuperação de senha por e-mail depende de configurar o serviço de envio; ela não está ativa neste piloto.

## Interligação futura ao ST1 Sales

Cada primeira aprovação cria, no mesmo registro transacional do certificado, um evento `academia.trilha.aprovada` na tabela `academy_outbox`. O evento tem referência única e os seguintes dados:

```json
{
  "eventId": "referencia-unica",
  "eventType": "academia.trilha.aprovada",
  "academyUserId": "conta-da-academia",
  "st1SalesUserId": null,
  "trackId": "digital",
  "version": "1.0",
  "score": 80,
  "criticalRulesPassed": true,
  "certificateId": "referencia-do-certificado",
  "approvedAt": "data-da-aprovacao"
}
```

O evento fica pendente. **Não há envio automático, concessão de pontos ou concessão de conquistas no ST1 Sales nesta versão.** A fila é a base preparada para a ligação futura, não a confirmação da integração.

Para conectar, é necessário definir o vínculo entre as contas, confirmar a API oficial de gamificação, autenticar a operação no servidor e consumir cada referência apenas uma vez. As conquistas existentes do ST1 Sales e suas regras de pontos não foram alteradas. Há um rascunho inicial de formulário chamado `ST1 Academy | Certificação Digital`, ID 8, criado durante a inspeção do construtor; ele não foi publicado ou ativado e não substitui esta avaliação.

## Verificação

```powershell
npm test
```

Os testes usam bancos isolados e cobrem convites, bloqueio de acesso, proteção do nome do certificado, ausência do gabarito na resposta pública, critério de 80%, erros críticos, retomada, alteração indevida de resultado, emissão das cinco trilhas, repetição sem duplicação, acesso ao PDF, conferência do arquivo e persistência após reinício. Também verificam migração, perfis, permissões, tentativa de elevação de privilégios, provas próprias de Supervisores, separação das equipes, CSV restrito, revogação de uma prova já aberta, edição de convites e proteção do último Admin. A entrada verifica cookies persistentes e temporários no cadastro e login, proteção do painel, compatibilidade dos convites anteriores, encerramento da sessão e bloqueio de redirecionamento para destinos externos.

A suíte completa da versão 2.3.3 passou com **158 testes aprovados e nenhuma falha**. Os cenários de disponibilidade verificam retomada sem perda de sessão, mensagens de conexão, configuração privada do setup e permissões dos atalhos internos. A execução usa dois processos de teste simultâneos para limitar o consumo de recursos no Windows. Ela verifica seleção e revogação de público, Supervisor restrito à equipe, prazos e histórico de entrega, conferência de presença, ausência de autovalidação, lembretes sem duplicação, exportação privada e proteção do OAuth. Também cobre cadastro Google sem convite com privilégios mínimos, preservação de perfis existentes, e-mail não verificado, conta bloqueada, retomada da sessão após reinício e falhas temporárias após o login. Os testes de Cadastros conferem os seis tipos, restrição ao Admin, conflitos de revisão, lixeira, restauração, etiquetas e histórico. As emissões são verificadas por evidência, regras, repetição idempotente, PDF/SVG preservado, revogação e referência pública. O adaptador Google usa respostas simuladas para eventos estáveis, mudanças locais, respostas de convite, cancelamento, retomada, falhas de API, pausa e sincronização incremental. Os testes novos verificam o índice real do catálogo com a biblioteca PDF instalada, limites das anotações, preservação da página durante redimensionamento, conclusão de estudo por conta, versão atual de PDF/texto/link, isolamento, publicação, retomada, persistência ao reiniciar e ausência de aprovação automática. Também verificam upload multipart, sigilos de anexos e perfis, moderação, transferência de squad, faixas de áudio, permissão do microfone, descarte ao sair e limite de gravação. Envios de foto e áudio, seleção de emoji, perfis de colegas e telas responsivas foram conferidos no navegador com contas isoladas. Essa suíte não substitui a conferência externa dos compromissos reais.

`scripts/build-artifacts.mjs` gera as cinco insígnias SVG e um modelo visual do certificado. O modelo não comprova aprovação. Certificados do piloto de teste também têm identificação explícita de teste interno.

## Referências técnicas

Autenticação baseada no Better Auth, conforme a [integração oficial com Express](https://better-auth.com/docs/integrations/express), o [adaptador SQLite](https://better-auth.com/docs/adapters/sqlite) e os [hooks oficiais](https://better-auth.com/docs/concepts/hooks). Os catálogos e processos ficam na Central de Conhecimento dentro da Academy, com leitor PDF.js hospedado junto ao projeto.

## Navegação e novos conteúdos

O menu lateral reúne Início, Dashboard, Conteúdos, Minha agenda, Minhas trilhas, Meu mapa de conhecimento e Minhas conquistas. Início fica acima das gavetas, sempre visível, e abre o percurso geral apresentado depois do login; a marca também conserva esse atalho. Conectar e competir reúne Meu squad e, conforme o perfil, Resultados. Gestão reúne Resultados, Cadastros e Acessos para o Admin; o Supervisor com acompanhamento liberado encontra Resultados. Publicar conteúdo fica em Conteúdos; provas relâmpago ficam em Minhas trilhas. O mapa lateral aparece quando as avaliações estão liberadas. Configurações de gamificação e liberações do perfil ficam em Cadastros. Pedidos de squad ficam nas ações de Resultados e Meu squad; programação e participação continuam nas abas de Minha agenda. Os atalhos seguem as permissões das rotas. No celular, o menu abre por botão e fecha pela seleção, pelo fundo ou pela tecla Esc.


Somente Admin pode cadastrar e editar conteúdos em **Publicar conteúdo → Novo conteúdo**. São aceitos arquivos PDF, PNG, JPG e WebP até 25 MB, textos e links HTTPS de materiais ou vídeos. O Admin escolhe as trilhas, o público (Vendedores e/ou Supervisores) e o status: Rascunho, Publicado ou Arquivado. Arquivar preserva o material e permite republicar. Substituir um arquivo mantém as versões anteriores para restauração.

Vendedores e Supervisores veem somente conteúdos publicados para seu perfil e suas trilhas liberadas, com a permissão de Materiais ativa. Os arquivos ficam no banco privado e todas as consultas e downloads exigem sessão e autorização no servidor. Não existem links públicos para os arquivos enviados. Mudanças são registradas em auditoria.

Publicar um material não modifica automaticamente o banco de questões, as regras de aprovação ou os certificados. Novos conteúdos aparecem na biblioteca e nas páginas das trilhas correspondentes.


## Cadastros e reconhecimentos personalizados

**Gestão → Cadastros** reúne Eventos, Conteúdos, Certificados, Insígnias, Squads e Etiquetas. Somente o Admin acessa essa área. Cada tipo permite criar, consultar, buscar, editar, mover para a lixeira e recuperar. Eventos, conteúdos e squads mantêm seus editores completos já existentes; certificados, insígnias e etiquetas têm formulários e prévias próprios. Os materiais autorizados apresentam suas etiquetas sem ampliar o acesso ao recurso.

A lixeira retira o cadastro de circulação e preserva arquivos, versões, entregas, mensagens, associações e emissões. Um evento removido fica cancelado e seu espelho no Google recebe esse cancelamento na próxima sincronização válida. Recuperar devolve a situação anterior. As edições conferem a revisão do servidor: uma tela desatualizada precisa ser reaberta antes de salvar.

Um modelo de certificado define nome, descrição, cor, carga horária, assinatura, insígnia opcional e regra: registro do Admin, participação validada em um evento ou certificação já conquistada em uma trilha. Ativar o modelo não o emite. O Admin escolhe a pessoa ativa e registra o motivo ou evidência. Confirmar um convite ou declarar presença não atende à regra de participação validada. Uma insígnia personalizada também é emitida individualmente, com evidência.

A emissão guarda o modelo, o nome e o arquivo daquela versão. Editar ou remover o modelo não modifica PDFs e SVGs já emitidos. Repetir a emissão para a mesma pessoa e versão retorna o mesmo registro. **Acompanhar emissões** permite revogar ou restaurar com motivo, preservando o arquivo e a referência; a verificação pública informa a situação vigente sem expor o nome ou a evidência. Uma emissão revogada sai do mural do participante e deixa de permitir seu download para ele.

Os reconhecimentos aparecem em Minhas conquistas e no perfil. Se a pessoa estiver em um squad, a novidade aparece no canal interno e nas notificações. Esses reconhecimentos não concedem XP nem produzem o evento de aprovação de trilha. As cinco provas comerciais continuam exigindo 80% e todos os pontos críticos corretos. O guia operacional está em [GESTAO_CADASTROS.md](GESTAO_CADASTROS.md).

## Publicação e conclusão de estudo

**Salvar e publicar** é a ação principal do editor. **Salvar rascunho** permanece como ação separada. A publicação de um arquivo cria o rascunho privado, envia o arquivo e publica somente depois do envio bem-sucedido; os retornos de revisão ficam no formulário para permitir nova tentativa. A gestão mostra a situação real de cada material. Rascunhos ficam restritos ao Admin; materiais publicados aparecem em Conteúdos e na faixa de materiais recentes do Início, mesmo sem vínculo com módulo.

O leitor de PDF, imagem, texto ou link oferece **Marcar estudo como concluído**, barra de progresso e **Retomar estudo**. O índice interno do PDF usa a API de pontos do PDF.js incluído no projeto. O redimensionamento conserva a última página solicitada, e a leitura salva a página mesmo se um link interno não puder ser desenhado. A conclusão é uma declaração individual salva no servidor, vinculada ao conteúdo e à versão de seus dados. Percorrer um PDF mostra o avanço de navegação até 99%; 100% depende da marcação explícita. Alterar arquivo, corpo de texto ou URL exige novo estudo; editar título ou descrição preserva a conclusão. A declaração não aprova avaliações, não concede XP nem emite certificado. As provas conservam suas regras de aprovação.

O Início mostra materiais concluídos e progresso geral. Cada módulo informa quantos de seus materiais foram concluídos. O próximo conteúdo prioriza materiais ainda pendentes e a retomada deixa de insistir em PDFs já concluídos. Os indicadores usam somente os conteúdos liberados para a própria conta.

**Cadastros → Módulos de conhecimento** e **Conteúdos → Módulos de conhecimento** permitem criar e editar áreas como Gestão, Comercial e Pesquisa de Mercado, com nome e descrição. O Início também oferece **Criar módulo** ao Admin. Novos módulos aparecem na faixa horizontal conforme o público e as trilhas selecionadas; a publicação de materiais permite escolher os módulos relacionados. Nenhuma área adicional é liberada por associação ao módulo.

O Starzinho aparece maior e livre no Início, ao lado do balão, com sua animação e interação. Início fica fora das gavetas da lateral. Os avisos visuais de ambiente de teste foram retirados do login, da navegação interna e da página de verificação. Os metadados e regras do ambiente persistem no servidor.

## Central de Conhecimento integrada

Catálogos, processos, livros e demais conteúdos usam a mesma estrutura de card, com cabeçalho e ações de altura padronizada. As capas mantêm sua animação e cada canal conserva seu tema. O resumo fica compacto; Explorar conteúdo apresenta o material completo. Os heróis de Cadastros e os títulos gerais foram compactados. A agenda usa calendário mais curto, métricas organizadas em colunas e Starzinho maior em um bloco com texto legível.

Em **Conteúdos**, a busca fica visível e **Filtros** abre uma gaveta para combinar módulo, tipo de conteúdo e trilha. A quantidade encontrada acompanha as escolhas. Os filtros ativos aparecem fora da gaveta e podem ser retirados individualmente ou limpos em conjunto. O título e a descrição do módulo selecionado continuam visíveis na biblioteca.

A seção Conteúdos reúne Processos, Produtos, Livros, Cursos e Treinamentos. Os PDFs aprovados são incorporados automaticamente ao banco privado quando existe um Admin ativo, ou quando o primeiro Admin ativa a conta. A importação confere SHA-256, não duplica materiais e preserva edições e arquivamentos. Os arquivos originais de distribuição ficam fora da pasta pública, em content/library; o acesso exige sessão e permissões de materiais, perfil e trilha. As capas seguem a mesma autorização.

O leitor interno oferece índice por assunto, escolha de página, zoom, texto selecionável, links do documento e retomada da página no navegador da própria conta. As referências das avaliações levam à página correspondente do material dentro da Academy. Os PDFs preservam as ofertas e a restrição de 2.000 Mega ao condomínio DAHMAS. Livros, cursos e treinamentos ficam disponíveis como categorias de cadastro; o curso de Banco de Dados foi incluído a partir do material fornecido e da trilha preparada para a ST1 Academy.

O Dashboard apresenta dados pessoais reais de trilhas liberadas, avaliações concluídas, melhor nota e conquistas. As novas categorias de material não geram perguntas ou certificados automaticamente; as avaliações já aprovadas mantêm suas regras.


## Módulos e retomada de leitura

Publicar conteúdo oferece Configurar módulos. O Admin cria e edita nome, descrição, trilhas, público e status do módulo. Os cinco módulos iniciais Vendas | PAP, Vendas | Digital, Vendas | PAP Elite, Vendas | Indoor e Vendas | PME já organizam os sete materiais aprovados. A descrição aparece na biblioteca quando o participante seleciona o módulo. No cadastro de materiais, o Admin escolhe um ou mais módulos, além da categoria. A classificação não altera as permissões próprias do material.

O leitor registra a página da própria conta no servidor. A biblioteca e o Dashboard mostram Continue de onde parou, com título, página atual, total e botão Continuar. A pessoa pode ocultar o bloco; uma nova leitura o reativa. Uma versão diferente do arquivo invalida a retomada da versão anterior. A revogação de acesso impede leitura e retomada. O registro de páginas não concede nota, insígnia ou certificado.


## Meu percurso

A tela de entrada reúne indicadores reais da própria conta, frase de incentivo conforme o perfil, retomada de leitura, próximo conteúdo relacionado ao último material e módulos com nome, descrição e capa. As sugestões usam somente materiais e módulos liberados. Os módulos relacionados ao último estudo aparecem primeiro. Vendedores recebem uma conexão com a próxima conversa comercial; Supervisores recebem uma conexão com a orientação da equipe. A faixa de módulos tem navegação por botões, teclado e rolagem. A tela não concede aprovação ou conquista por visita ou leitura.

## Etapas, Starzinho e XP

Meu percurso apresenta XP, nível, dias consecutivos com avanços e a próxima missão. Minhas trilhas oferece Avançar com o Starzinho: Planos, Aplicativos, Processo ou Condições, Regras críticas e Certificação, conforme o canal. A prática de uma etapa usa perguntas aprovadas, sem cronômetro, e exige 80% com todos os pontos críticos corretos. A etapa seguinte libera após a validação; evidências de uma avaliação final também validam os temas correspondentes. A avaliação final já existente continua disponível pela trilha.

O Starzinho oficial acompanha a missão, muda de posição conforme a etapa, anima a conversa e oferece mensagens de incentivo ao clique. Ouvir Starzinho usa a síntese de voz em português disponível no navegador, acionada pela pessoa. O projeto usa quatro poses oficiais; não gera um personagem substituto. Os efeitos seguem a preferência de movimento do dispositivo e mantêm os controles legíveis.

Cadastros → Configurar gamificação permite editar pontos e nomes/limiares dos níveis. Os valores iniciais são 25 XP por primeira validação de etapa, 50 XP por primeira aprovação de uma versão de prova relâmpago e 200 XP por certificação. Os níveis começam em 0, 100, 300, 600, 1.000 e 1.500 XP. O histórico de XP fica no servidor, com uma referência única por conquista. Refazer a mesma etapa ou versão não duplica pontos; leitura, chat e dados enviados pelo navegador não concedem XP. Mudanças nos valores valem para novas conquistas e não reescrevem os registros anteriores. Os dias consecutivos consideram avanços com XP e o fuso de Fortaleza.

## Provas relâmpago

Cinco sprints de 3 perguntas e 120 segundos ficam preparados como rascunhos, um por canal. O Admin pode editar ou criar desafios, escolher perguntas do banco ou escrever perguntas próprias com quatro alternativas, indicar a correta, tema, explicação e regra crítica, e selecionar canais, público, duração e status. Há de 1 a 20 perguntas e de 20 a 3.600 segundos.

A prova publicada aparece somente para perfis e trilhas liberados. Perguntas do banco de outros canais não são entregues à conta sem esse acesso. Uma tentativa guarda o questionário, respostas, revisão e prazo no servidor. Atualizar a página ou sair não reinicia o prazo. Ao expirar, o servidor corrige as respostas já salvas e ignora respostas enviadas depois do limite. Revogar uma trilha presente na tentativa bloqueia sua retomada.

Cada desafio tem revisão administrativa e versão de avaliação. Editar descrição, duração, público ou status não renova o prêmio de XP. Alterar perguntas, alternativas, resposta correta, tema ou regra crítica cria nova versão. A explicação pode ser corrigida mantendo a versão; tentativas abertas preservam seu questionário original. Uma prova relâmpago registra conhecimento e XP, sem emitir o certificado da avaliação final da trilha.

## Squads, comunidade e notificações

Cadastros → Squads permite cadastrar, editar, arquivar, escolher Supervisor e vincular contas ativas. Uma pessoa participa de um squad por vez; a tela avisa sobre transferência. A supervisão exige uma conta de perfil Supervisor. O nome de referência encontrado no Drive não concede permissão.

Os dez squads iniciais vêm dos nomes das pastas fornecidas: TIME FENIX, POWER TEAM, TROPA DE ELITE, NEXO LENÇOIS, TIME ÁGUIA, FIBRA DE OURO, TROPA DA PANTERA, EQUIPE NÁRNIA, TROPA R2 e LIGA DIGITAL. Cinco pastas indicam um nome de supervisão, mantido apenas como referência. Nenhuma pessoa é cadastrada, convidada ou vinculada automaticamente com base nesses arquivos.

A permissão Squads, chat e ranking pode ser escolhida em Acessos. Novos convites incluem essa área por padrão; permissões de contas e convites anteriores permanecem preservadas. O Admin pode habilitá-la em cada conta. O chat exige sessão, permissão e vínculo ao squad. Admin e Supervisor líder podem ocultar/restaurar mensagens com auditoria. Mensagens de texto aceitam até 1.200 caracteres. Fotos, áudios e textos compartilham o limite de dez envios por minuto.

Vendedores e Supervisores abrem automaticamente o único squad vinculado à conta, com o canal fixo. O Admin pode alternar entre os canais autorizados. O chat oferece emoji, foto JPG/PNG/WebP de até 5 MB, gravação de áudio de até dois minutos, anexo de áudio de até 8 MB e prévia antes do envio. A gravação começa somente depois de um clique e da permissão do microfone; parar, cancelar, ocultar a aba ou sair do chat libera o dispositivo. O envio exige outra ação explícita. As mídias ficam no banco privado, com acesso por sessão e vínculo ao squad; ocultar a mensagem também bloqueia o arquivo. A reprodução aceita requisições por faixa. Um anexo não concede XP.

**Conheça seu time**, nas abas do perfil e na lista do squad, permite buscar e abrir perfis autorizados. O Vendedor vê colegas do próprio squad; a gestão conserva seu escopo de acompanhamento. A lista mostra nome, foto, papel, squad, nível e XP, sem telefone, e-mail ou história privada. O perfil do colega mostra conquistas e os campos que a própria pessoa escolheu compartilhar. O telefone continua restrito ao titular e à gestão autorizada. Consultar outro perfil não abre seus controles de edição.

A primeira certificação gera notificação pessoal e, quando a pessoa pertence a um squad e tem as permissões de comunidade e conquistas, uma publicação do certificado e notificações aos colegas elegíveis. Compartilhar novamente o mesmo certificado no mesmo squad é idempotente. Downloads continuam autorizados pelo servidor; retirar a pessoa do squad revoga o acesso por esse compartilhamento. Certificados anteriores não geram publicações retroativas em massa.

O canal consulta mensagens a cada 5 segundos enquanto está visível, e o sino verifica novidades a cada 15 segundos. As notificações podem ser marcadas como lidas. Não há envio para WhatsApp, e-mail ou notificações externas ao navegador.

## Resultados e mapa de conhecimento

Resultados reúne ranking pessoal e de squads, pódio, XP, certificados, filtros de Vendedores/Supervisores e de todo o período/últimos 7 dias/últimos 30 dias. Empates em XP e certificados compartilham a posição. A comparação de squads usa XP médio dos participantes atuais, exibindo também XP total. O Dashboard continua dedicado à evolução pessoal.

Vendedores veem o agregado das pessoas do próprio squad, sem e-mails, respostas ou mapa individual de colegas. Supervisores com acompanhamento veem os vendedores vinculados em Acessos ou no squad em que são líderes, dentro das trilhas liberadas. Continuam realizando suas próprias provas. Admin acompanha todas as contas ativas. O relatório de certificação e CSV permanecem disponíveis à gestão autorizada.

Meu mapa de conhecimento usa nós e conexões interativas, seleção por clique ou teclado, zoom e navegação pelo mapa. Cada tema mostra acertos/total e fica Validado, Reforçar ou Ainda não avaliado. A evidência mais recente vem das práticas, provas relâmpago ou avaliação final, com identificação da origem. Temas de perguntas próprias aparecem após a avaliação. Um erro crítico mantém o ponto em Reforçar mesmo com nota suficiente. O trecho do material aparece como revisão quando existe referência disponível e autorizada. Visitar uma página não é evidência de domínio.

Os padrões de referência e a adaptação ao HTML/JavaScript do projeto estão documentados em [REFERENCES.md](REFERENCES.md).

## Integrações de produção: GlitchTip, n8n e OpenPanel

A **Central de Integrações** permite ativar serviços externos sem colocá-los no caminho crítico do ST1 Academy. As configurações sensíveis podem ser armazenadas pelo Admin usando a mesma cifragem AES-256-GCM já aplicada aos canais de comunicação.

- **GlitchTip:** recebe erros do backend por protocolo compatível com Sentry. A primeira implantação usa um emissor nativo, sem dependência adicional no pacote, e não envia body de requisição, cookies, query strings ou PII desnecessária. Se o GlitchTip estiver indisponível, o erro continua sendo tratado pelo Academy.
- **n8n:** recebe eventos por webhook HTTPS autenticado. O Academy persiste o evento antes do envio; indisponibilidade do n8n gera retry com backoff, sem bloquear a ação do usuário.
- **OpenPanel:** recebe eventos de Product/Learning Analytics pelo backend. O identificador da pessoa é pseudonimizado com HMAC antes do envio; nome e e-mail não são enviados por padrão. O CSP continua com `connect-src 'self'` porque não há SDK externo no navegador nesta fase.

A Outbox usa entregas independentes por provider. As tentativas são refeitas após 1 minuto, 5 minutos, 30 minutos, 2 horas e 12 horas; uma nova falha entra em **dead-letter**. Em **Admin → Integrações → Saúde e fila**, o Admin acompanha pendências e pode reenfileirar uma dead-letter. O circuit breaker abre após cinco falhas consecutivas de um provider e tenta novamente depois de cinco minutos.

Eventos iniciais: onboarding concluído, material iniciado/concluído, avaliação iniciada/concluída/bloqueada, autorização extra de tentativa, trilha concluída, certificado emitido, clique de campanha e NPS enviado. Respostas de prova, senhas, tokens, cookies, documentos e endereços não entram no payload de integração.

As integrações ficam inativas por padrão. Configurar credenciais não exige colocá-las neste repositório; use variáveis privadas da hospedagem ou o painel Admin. Desativar um provider interrompe novas entregas para ele sem alterar login, estudos, provas, certificados, campanhas ou o banco principal.
