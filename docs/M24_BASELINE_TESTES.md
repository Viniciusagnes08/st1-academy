# M24 — Inventário das falhas preexistentes

Base: `8647463`, Node 24.22.1, `npm test`, 11/11/2026.

237 testes: 100 aprovados, 133 falhas, 4 ignorados. Este resultado não autoriza promoção. A primeira comparação com a branch apresentou o mesmo conjunto nominal de falhas.

O relatório do Node detalhou 121 casos abaixo; os outros 12 registros são testes pai que agregam subtestes falhos.

## Grupos e testes pai com falha

- A avaliação registra identidade, exige 80% e regras críticas, e emite uma única conquista por trilha
- Agenda acompanha entregas e presenças e sincroniza apenas eventos ST1
- Chat multimídia e perfis de colegas seguem o squad e as permissões reais
- Conteúdos exigem Admin para gestão e respeitam material, trilha, público e publicação em toda leitura
- Etapas, XP, squads e quizzes usam evidências reais e preservam a governança
- Mapa expansível projeta conteúdo e evidência, com paginação e escopo privado
- A Central de Conhecimento mantém PDFs originais, categorias e acesso privado dentro da Academy
- Percursos conectados liberam somente os ramos concluídos, por canal e função
- Biblioteca usa leituras em lote e confere acesso e versão novamente a cada solicitação
- CRUDs da Academy preservam histórico e emitem reconhecimentos com evidência
- Estudo declarado acompanha a conta, a versão e a visibilidade sem aprovar provas
- Perfil pessoal usa progresso real, mantém privacidade e exige aprovação de squad
- Início aparece antes da biblioteca e preenche módulos sem esperar a gamificação
- Solicitações antigas não sobrescrevem a página após a pessoa sair do Início
- Falha da evolução mantém módulos carregados e oferece retomada
- O mapa admite estudo ou avaliações, e as provas relâmpago exigem avaliações liberadas
- Queda e retomada do servidor conservam a conta e retomam a rota selecionada
- Somente o 401 real encaminha para o login; o 403 real mostra o bloqueio

## Casos detalhados

| Local | Teste com falha |
|---|---|
| `tests/academy.test.mjs:47:13` | convite é pessoal, de uso único, e vendedor não acessa gestão nem troca o nome |
| `tests/academy.test.mjs:66:15` | trilha PAP: respostas salvas, aprovação e certificado PDF autenticado |
| `tests/academy.test.mjs:66:15` | trilha Digital: respostas salvas, aprovação e certificado PDF autenticado |
| `tests/academy.test.mjs:66:15` | trilha PAP Elite: respostas salvas, aprovação e certificado PDF autenticado |
| `tests/academy.test.mjs:66:15` | trilha Indoor: respostas salvas, aprovação e certificado PDF autenticado |
| `tests/academy.test.mjs:66:15` | trilha PME: respostas salvas, aprovação e certificado PDF autenticado |
| `tests/academy.test.mjs:84:13` | resultado adulterado no navegador não aprova e não gera certificado |
| `tests/academy.test.mjs:89:13` | conquistas e integração não duplicam e nada é enviado ao ST1 Sales |
| `tests/academy.test.mjs:97:13` | dados, sessões, certificado e respostas persistem depois de reiniciar |
| `tests/agenda.test.mjs:42:13` | sessão e público são obrigatórios; vendedor não programa nem acompanha outros |
| `tests/agenda.test.mjs:50:13` | programação valida horário, link e público sem criar registros incompletos |
| `tests/agenda.test.mjs:55:13` | tarefa e encontro avisam somente os participantes selecionados |
| `tests/agenda.test.mjs:62:13` | supervisor valida sua equipe, mas não edita encontro criado pelo Admin |
| `tests/agenda.test.mjs:66:13` | aceitar convite não confirma presença, não dá XP e usa revisão |
| `tests/agenda.test.mjs:73:13` | entrega é preenchida pelo titular, aguarda gestão e guarda o prazo original |
| `tests/agenda.test.mjs:81:13` | presença declarada exige conferência e nenhuma pessoa valida a própria presença |
| `tests/agenda.test.mjs:89:13` | validação não inventa certificado e entrega aguardando gestão não vira falta de preenchimento |
| `tests/agenda.test.mjs:97:13` | envio após prazo é rastreado; histórico e lembretes não se duplicam |
| `tests/agenda.test.mjs:104:13` | novos acessos entram no público por perfil enquanto o compromisso está aberto |
| `tests/agenda.test.mjs:110:13` | exportação .ics é privada e não contém respostas nem participantes |
| `tests/agenda.test.mjs:114:13` | Google OAuth usa convite verificado, PKCE e escopo restrito; metadados não expõem chave |
| `tests/agenda.test.mjs:125:13` | conexão cria calendário ST1 e eventos idempotentes sem copiar respostas pessoais |
| `tests/agenda.test.mjs:133:13` | edição local é enviada ao Google e uma cópia inalterada não desfaz a programação |
| `tests/agenda.test.mjs:140:13` | mudança de horário e RSVP chegam do Google sem falsificar presença |
| `tests/agenda.test.mjs:149:13` | cancelamento no Google é importado e remoção de tarefa não a conclui |
| `tests/agenda.test.mjs:155:13` | reativar um treinamento restaura o evento sem duplicar o convite |
| `tests/agenda.test.mjs:162:13` | pausa e bloqueio impedem sincronização; dados e histórico continuam no banco |
| `tests/chat-media.test.mjs:29:13` | Supervisor recebe apenas seu squad e a URL de outro time não amplia acesso |
| `tests/chat-media.test.mjs:32:13` | a lista de perfis permite descobrir colegas sem expor telefone, e-mail ou histórias privadas |
| `tests/chat-media.test.mjs:35:13` | envia foto real por multipart e entrega o anexo somente a quem participa do squad |
| `tests/chat-media.test.mjs:40:13` | o áudio usa armazenamento privado, reprodução por faixa e CSP compatível |
| `tests/chat-media.test.mjs:47:13` | bloqueia arquivos disfarçados, duração inválida, partes duplicadas e origem externa |
| `tests/chat-media.test.mjs:54:13` | a moderação oculta também o arquivo e a restauração recupera a mesma mensagem |
| `tests/chat-media.test.mjs:59:13` | fotos e áudios compartilham o limite de envio das mensagens de texto |
| `tests/chat-media.test.mjs:63:13` | sair do squad revoga simultaneamente arquivos e perfis do time anterior |
| `tests/content.test.mjs:39:13` | Admin cria rascunho, envia arquivo privado e só publica depois do envio |
| `tests/content.test.mjs:48:13` | lista, detalhe e arquivo respeitam trilhas, públicos e permissão de materiais |
| `tests/content.test.mjs:58:13` | formatos falsos, nomes com caminho, arquivo grande e edição desatualizada são recusados |
| `tests/content.test.mjs:65:13` | trocar o arquivo preserva versões e permite restaurar a versão original |
| `tests/content.test.mjs:73:13` | arquivar remove a leitura imediatamente e voltar a publicar preserva o arquivo |
| `tests/content.test.mjs:78:13` | textos, links e conteúdos só para Admin usam o mesmo controle de publicação |
| `tests/content.test.mjs:84:13` | revogar a trilha ou bloquear a conta também bloqueia URLs diretas do arquivo |
| `tests/content.test.mjs:89:13` | arquivos, versões e auditoria persistem no reinício sem criar aprovações ou certificados |
| `tests/engagement.test.mjs:20:13` | importa dez squads e prepara etapas e sprints sem fabricar participantes ou XP |
| `tests/engagement.test.mjs:21:13` | endereços de progresso preservam dados e controles de acesso |
| `tests/engagement.test.mjs:33:13` | etapas respeitam ordem, permissões e concedem XP uma vez |
| `tests/engagement.test.mjs:35:13` | quiz guarda prazo fixo e não expõe respostas corretas durante a prova |
| `tests/engagement.test.mjs:36:13` | prazo expirado ignora respostas tardias e mantém o resultado depois de reabrir |
| `tests/engagement.test.mjs:37:13` | republicar ou editar o texto do desafio não renova a versão nem o prêmio de XP |
| `tests/engagement.test.mjs:46:13` | perguntas próprias mantêm IDs e versão ao editar a explicação, e mudam versão ao alterar o conhecimento avaliado |
| `tests/engagement.test.mjs:62:13` | desafio com vários canais entrega somente perguntas das trilhas liberadas e registra XP no canal acessível |
| `tests/engagement.test.mjs:72:13` | revogar um canal bloqueia a retomada de um sprint multicanal já aberto |
| `tests/engagement.test.mjs:85:13` | Admin vincula pessoas ao squad e o Supervisor tem acesso somente à equipe vinculada |
| `tests/engagement.test.mjs:86:13` | certificação aprovada gera um prêmio, uma publicação e notificações reais no próprio squad |
| `tests/engagement.test.mjs:87:13` | certificado compartilhado é lido por colegas autorizados e continua restrito a outras pessoas |
| `tests/engagement.test.mjs:88:13` | chat tem escopo, limites e moderação reversível pelo líder |
| `tests/engagement.test.mjs:89:13` | ranking usa XP registrados, limita pessoas ao próprio squad e separa Supervisores |
| `tests/engagement.test.mjs:90:13` | mapa começa sem afirmação de domínio e mostra evidência depois de avaliar |
| `tests/engagement.test.mjs:91:13` | somente Admin altera pontuação e a mudança não reescreve XP anteriores |
| `tests/engagement.test.mjs:92:13` | retirar alguém do squad revoga chat, PDFs compartilhados e o acompanhamento novo |
| `tests/knowledge-map.test.mjs:33:13` | a API exige sessão e separa o mapa pessoal do acompanhamento autorizado |
| `tests/knowledge-map.test.mjs:41:13` | módulos e publicações entram automaticamente sem copiar o grafo nem revelar curadoria |
| `tests/knowledge-map.test.mjs:51:13` | conclusão se aplica à versão atual e não fabrica nota, XP ou certificado |
| `tests/knowledge-map.test.mjs:62:13` | busca ignora acentos e os filtros não alteram as permissões de um ramo |
| `tests/knowledge-map.test.mjs:77:13` | um subconjunto correto permanece parcial e as evidências se acumulam por pergunta |
| `tests/knowledge-map.test.mjs:86:13` | erro crítico recente pede reforço e uma avaliação de versão anterior não valida a nova |
| `tests/knowledge-map.test.mjs:94:13` | arquivar ou excluir um material o retira do mapa sem refazer o cadastro |
| `tests/knowledge-map.test.mjs:100:13` | 500 módulos, 2.000 materiais e 1.000 temas avaliados mantêm o mapa paginado |
| `tests/knowledge.test.mjs:23:13` | os sete originais são publicados com índice, capa e categorias reais |
| `tests/knowledge.test.mjs:28:13` | arquivos e capas exigem sessão, material e trilha liberados |
| `tests/knowledge.test.mjs:32:13` | livros, cursos e treinamentos aceitam cadastro interno com controle de categoria |
| `tests/knowledge.test.mjs:37:13` | módulos têm nome e descrição configuráveis por Admin e seguem a visibilidade da conta |
| `tests/knowledge.test.mjs:42:13` | a retomada salva a página da própria conta e não concede aprovação por leitura |
| `tests/knowledge.test.mjs:46:13` | trocar um PDF por imagem invalida a retomada antiga e preserva a entrada da Academy |
| `tests/knowledge.test.mjs:58:13` | reiniciar não duplica materiais, não desfaz edição nem republica conteúdo arquivado |
| `tests/learning-flows.test.mjs:25:13` | autenticação, canal e supervisão delimitam o percurso |
| `tests/learning-flows.test.mjs:30:13` | o mapa inteiro aparece; URL, download, conclusão e prova não pulam pré-requisitos |
| `tests/learning-flows.test.mjs:39:13` | concluir o pai libera os ramos; a junção exige os dois ramos |
| `tests/learning-flows.test.mjs:49:13` | alternativa explícita pode aceitar um ramo; ciclo e canal incompatível são rejeitados |
| `tests/learning-flows.test.mjs:55:13` | versão atual e publicação preservam evidência sem fabricar avanços |
| `tests/learning-flows.test.mjs:62:13` | Supervisor possui seu percurso próprio; recursos privados não vazam |
| `tests/library-performance.test.mjs:24:13` | crescer de 20 para 80 materiais não cria uma consulta por material |
| `tests/library-performance.test.mjs:31:13` | o lote conserva conclusão por pessoa e exige novo estudo ao mudar o corpo |
| `tests/library-performance.test.mjs:39:13` | rascunhos, BI, público e trilhas permanecem privados na API combinada |
| `tests/library-performance.test.mjs:47:13` | bloqueio e conclusão dos pré-requisitos são recalculados entre acessos |
| `tests/management.test.mjs:30:13` | cria os seis tipos e consulta os campos salvos |
| `tests/management.test.mjs:41:13` | edita cada cadastro e impede gravação com versão antiga |
| `tests/management.test.mjs:45:13` | etiquetas são únicas, escapadas e não aceitam SVG arbitrário |
| `tests/management.test.mjs:53:13` | não emite por confirmação própria, submissão pendente ou pessoa bloqueada |
| `tests/management.test.mjs:65:13` | emite PDF autêntico e uma única conquista por pessoa, modelo e versão |
| `tests/management.test.mjs:77:13` | edição dos modelos não modifica arquivos e revogação preserva o histórico |
| `tests/management.test.mjs:85:13` | lixeira e recuperação funcionam nos seis tipos sem apagar entregas, arquivos ou mensagens |
| `tests/management.test.mjs:99:13` | insígnias podem ser emitidas com motivo, e campos secretos não saem nas consultas |
| `tests/management.test.mjs:105:13` | a leitura respeita a trilha do snapshot e as permissões atuais do titular, supervisor e colegas |
| `tests/management.test.mjs:127:13` | emissões sem permissão de comunidade ou conquistas não divulgam a pessoa no squad |
| `tests/management.test.mjs:137:13` | a emissão assíncrona revalida o Admin, a pessoa, o cadastro e a insígnia antes de persistir |
| `tests/management.test.mjs:156:13` | emissões simultâneas são idempotentes e não contornam uma revogação concorrente |
| `tests/material-study.test.mjs:27:13` | conclusão é explícita e privada; chegar à última página não conclui o estudo |
| `tests/material-study.test.mjs:36:13` | sessão, publicação, trilha e origem protegem a gravação |
| `tests/material-study.test.mjs:46:13` | reabrir mantém conclusão e retomar desfaz apenas a declaração |
| `tests/material-study.test.mjs:56:13` | texto e links podem concluir; nova versão exige novo estudo, alteração de título preserva |
| `tests/material-study.test.mjs:71:13` | conclusão persiste ao reiniciar e deixa de aparecer ao arquivar o material |
| `tests/profiles.test.mjs:25:13` | perfil básico começa sem dados inventados, é privado e não dá XP por visita |
| `tests/profiles.test.mjs:30:13` | cadastro pessoal não altera nome, e-mail, papel, XP ou certificados |
| `tests/profiles.test.mjs:39:13` | imagem é validada, pertence à conta e não tem link público |
| `tests/profiles.test.mjs:46:13` | personalizações bloqueadas não podem ser liberadas pelo navegador |
| `tests/profiles.test.mjs:52:13` | pedido de squad não concede acesso até a aprovação e só o líder correto pode decidir |
| `tests/profiles.test.mjs:64:13` | colegas autorizados veem a história e o telefone fica com a gestão autorizada |
| `tests/profiles.test.mjs:69:13` | XP conquistado libera cor e destaque, com pelo menos três vendedores no squad |
| `tests/profiles.test.mjs:76:13` | abrir conteúdo ou preencher perfil não conta como estudo, e o relógio do servidor limita a atividade |
| `tests/profiles.test.mjs:87:13` | dias consecutivos têm recorde e reiniciam após uma pausa |
| `tests/profiles.test.mjs:92:13` | Admin configura desbloqueios sem mudar XP e os itens iniciais permanecem livres |
| `tests/profiles.test.mjs:100:13` | uma transferência depende de Admin e ainda não dá acesso ao squad solicitado |
| `tests/profiles.test.mjs:110:13` | remover foto oculta o arquivo anterior e preserva o histórico de imagem |
| `tests/profiles.test.mjs:115:13` | informações e regras permanecem após reiniciar o contexto |
| `tests/progressive-home.test.mjs:20:1` | Início aparece antes da biblioteca e preenche módulos sem esperar a gamificação |
| `tests/progressive-home.test.mjs:28:1` | Solicitações antigas não sobrescrevem a página após a pessoa sair do Início |
| `tests/progressive-home.test.mjs:33:1` | Falha da evolução mantém módulos carregados e oferece retomada |
| `tests/runtime-availability.test.mjs:76:1` | O mapa admite estudo ou avaliações, e as provas relâmpago exigem avaliações liberadas |
| `tests/runtime-availability.test.mjs:88:1` | Queda e retomada do servidor conservam a conta e retomam a rota selecionada |
| `tests/runtime-availability.test.mjs:105:1` | Somente o 401 real encaminha para o login; o 403 real mostra o bloqueio |

## Observações

Respostas 403 nas fixtures e mensagens de import dinâmico aparecem no relatório. É necessário investigar cada grupo antes de corrigir. O M24 não desativa onboarding, controles de acesso ou permissões existentes para fazer estes testes passarem. Não reproduzimos dados de sessão ou payloads pessoais do log.
