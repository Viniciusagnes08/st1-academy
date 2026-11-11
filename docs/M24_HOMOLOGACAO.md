# ST1 Academy 3.0 — M24 restrito a administradores

Data: 11/11/2026. Base examinada: `8647463`, versão 2.6.3.
Integração autorizada na `main` em 11/11/2026.

## Situação desta entrega

Primeira fatia funcional do M24 — Governança do Conhecimento, implementada no projeto existente. Não é o M24 completo. Por decisão do responsável, o piloto usa a aplicação e o banco atuais, sem criar uma segunda instância.

**Endereço:** `https://st1academy.tech/homologacao/m24`.
**Entrada na interface:** Gestão → Governança do Conhecimento. O servidor informa a disponibilidade somente a contas Admin ativas.

## O que já funciona

- Página administrativa com resumo, inventário paginado, busca e filtro de revisão.
- Cadastro e atualização de fontes com título, tipo, referência HTTPS e versão declarada; histórico técnico das alterações das fontes armazenado em tabela própria.
- Ficha de curadoria por material: responsável, criticidade, fontes consultadas, próxima revisão e versão do conteúdo.
- Solicitação/reabertura de revisão, aprovação, devolução e bloqueio **experimentais**.
- Histórico das decisões com ator, justificativa, estado anterior e novo estado, em ordem de revisão da ficha.
- Exceção explícita de autorrevisão: como o piloto é de uma única pessoa, aprovar exige uma justificativa adicional. Não representa o desenho definitivo de dupla revisão.
- Aprovação atrelada à revisão exata do conteúdo e revisões/versões das fontes. Alteração material ou da fonte torna a aprovação não vigente na leitura.
- Vencimento calculado na leitura, sem cron obrigatório. Datas de revisão consideram `America/Sao_Paulo`; instantes de auditoria são armazenados em UTC.
- Exportação JSON autorizada do inventário e fontes. O export não contém o histórico completo de decisões.
- Controle otimista por revisão; decisões transacionais com chave de repetição e detecção de reutilização com outro corpo.

## Isolamento e autorização

O recurso vem ativo na aplicação principal. `ACADEMY_M24_ENABLED=0` funciona como chave emergencial de desligamento: as rotas e o menu desaparecem, sem apagar as tabelas.

Cada leitura de página, JavaScript, CSS e API exige sessão válida, cadastro ativo e papel Admin, sempre conferidos no servidor. Vendedores e Supervisores recebem 404, conta sem sessão recebe 401 e conta desativada recebe 403 pelo controle existente.

A propriedade `m24Homologation` retorna apenas um booleano. Respostas privadas usam `Cache-Control: no-store` e `X-Robots-Tag`.

Os arquivos ficam em `private/m24`, fora de `express.static(public)`. Ocultar o menu é conveniência; a proteção efetiva está no servidor. Mutações preservam a validação de origem/CSRF já existente.

### Tabelas exclusivas do piloto

| Tabela | Uso |
|---|---|
| `academy_m24_source` | Fonte atual e revisão técnica |
| `academy_m24_source_event` | Histórico imutável pela API das alterações de fonte |
| `academy_m24_governance` | Ficha experimental por conteúdo |
| `academy_m24_event` | Decisões e snapshots da ficha |
| `academy_m24_request` | Repetição segura de decisões |

O serviço M24 somente lê `academy_content` e a autorização consulta a identidade existente. Não escreve nos conteúdos reais, anexos, notas, XP, certificados, percursos ou campanhas. O estado experimental `blocked` não arquiva material e não altera recomendações atuais. A aprovação experimental não libera publicação.

As tabelas estão no banco/schema da aplicação principal. O isolamento é lógico: o módulo escreve somente em `academy_m24_*` e lê `academy_content`. Ele não grava em campanhas, progresso, certificados ou publicações.

## Publicação na aplicação principal

1. Integrar a mudança na `main` somente após os testes focados e a comparação da suíte completa.
2. Publicar o mesmo serviço de produção, sem duplicar aplicação ou banco.
3. Conferir `/healthz` e a versão publicada.
4. Validar que uma conta Admin ativa vê o item Gestão → Governança do Conhecimento.
5. Validar que Vendedor, Supervisor, anônimo e conta desativada não recebem a página, os arquivos ou as APIs privadas.
6. Não ativar campanhas, disparos ou integrações como consequência desta entrega; o módulo M24 não depende delas.

## Roteiro de teste pelo responsável

1. Abrir a Academy principal com uma conta Admin ativa. O link deve aparecer em Gestão. Abrir a página e observar que os totais vêm da biblioteca atual.
2. Cadastrar uma fonte de teste com referência HTTPS sem senha, token, parâmetros ou fragmentos. O servidor não consulta o endereço nem verifica seu teor automaticamente.
3. Abrir um conteúdo e preencher curador, criticidade, fonte e revisão futura; salvar a ficha.
4. Solicitar revisão. Depois aprovar com justificativa e exceção de autorrevisão. Verificar o histórico e o estado aprovado.
5. Editar a fonte e incrementar sua versão declarada. O material deve voltar a precisar de revisão. Salvar a ficha para vincular a versão atual antes de solicitar outra revisão.
6. Abrir a mesma ficha em duas abas: salvar em uma e tentar salvar a revisão antiga na outra. Deve haver conflito, sem sobrescrever a decisão.
7. Bloquear experimentalmente e salvar metadados: o bloqueio deve permanecer. Para reabrir, realizar solicitação explícita e nova decisão.
8. Exportar o inventário. Conferir que os dados são somente do piloto.
9. Sair da conta e tentar página, CSS, JavaScript e API privadas. Nenhum dado privado deve ser entregue. Repetir com outra conta Admin, Vendedor, Supervisor e conta desativada; a outra conta Admin deve ter acesso e os demais perfis não.
10. Conferir desktop, celular, teclado, foco do dialog, mensagens de erro e navegação de volta. Esta verificação visual ainda não foi realizada no navegador.

## Validação executada

`node --test tests/m24-governance.test.mjs tests/m24-routes.test.mjs`: **8 testes aprovados**, sem falhas.

Cobertura: acesso exclusivo em página/arquivos/API, e-mail confirmado, outro Admin, vendedor, anônimo, conta bloqueada, CSRF, JSON inválido, ciclo HTTP de ficha/revisão/aprovação, preservação do conteúdo, versões, vencimento, referências inválidas, concorrência, repetição, falha transacional na auditoria, bloqueio persistente e reabertura do serviço.

`node --check private/m24/app.js`: aprovado. Diff verificado respeitando o CRLF já usado nos arquivos existentes.

A suíte geral **não está aprovada**. A execução inicial apresentou as mesmas 133 falhas presentes na base limpa `8647463`: 237 testes na base, 100 aprovados, 133 falhas, 4 ignorados; a branch, antes dos dois casos adicionais, apresentou 243 testes, 106 aprovados, 133 falhas, 4 ignorados. Não houve nome de falha exclusivo da branch nessa comparação. O inventário nominal está em `M24_BASELINE_TESTES.md`. A execução final da branch registrou 245 testes: 108 aprovados, 133 falhas e 4 ignorados, novamente com o mesmo conjunto nominal de falhas da base.

Falhas incluem fixtures que recebem 403 após o gate de onboarding e harnesses de JavaScript com import dinâmico sem callback. Essas são observações, não um diagnóstico completo de todos os casos. Não corrigimos regras de onboarding ou acesso para contornar a suíte. A versão Node local é 24.22.1; CI usa 24.15.0, então a comparação com CI é necessária.

**Não validado antes da publicação:** PostgreSQL real com essas tabelas, UI autenticada no navegador, desempenho em biblioteca grande e recuperação por backup. Os testes automatizados usam SQLite local; o adaptador PostgreSQL existente é reaproveitado.

## Limites intencionais desta fatia

- Não impede publicação de novos conteúdos no editor atual. Esse gate só deve ser introduzido depois da promoção aprovada do módulo.
- Não modifica o editor de conteúdo nem substitui versões publicadas.
- Não cria recomendadores, Radar, jornadas de onboarding novas, PDI, IA ou integração Sales.
- Não calcula XP, domínio, prontidão ou performance.
- Sem alerta persistente deduplicado nem notificação automática; o resumo é calculado a partir dos estados efetivos.
- Sem rubricas, política configurável de dupla revisão, atribuição por cadastro de curadores, evidência de consulta por seção/página ou fonte inacessível.
- Uma fonte possui histórico técnico, mas a interface ainda não oferece uma tela para examinar esse histórico ou restaurar uma versão.
- A lista de fontes não é paginada. O inventário pagina a resposta, mas monta a projeção completa para filtrar e calcular contadores; otimizar consultas em lote antes de grandes volumes.
- Fonte alterada invalida aprovação conservadoramente, inclusive ao mudar metadados. Não buscar ou baixar fontes privadas automaticamente.
- Sem migração automática do namespace experimental para a governança definitiva. Essa transição exige decisão e revisão dos dados do piloto.

## Arquivos e contratos para o Codex

| Arquivo | Responsabilidade |
|---|---|
| `lib/m24-governance.mjs` | Dados isolados, estados efetivos, concorrência, auditoria e decisões |
| `lib/m24-routes.mjs` | Flag, autorização exclusiva e rotas de homologação |
| `private/m24/index.html` | Interface privada de fontes e revisão |
| `private/m24/app.js` | Interações sem interpolar texto do banco em HTML |
| `private/m24/style.css` | Estilo responsivo do piloto |
| `server.mjs` | Montagem das rotas e booleano de disponibilidade |
| `public/index.html`, `public/assets/academy.js` | Entrada condicional em Gestão |
| `tests/m24-governance.test.mjs` | Regras de governança e atomicidade |
| `tests/m24-routes.test.mjs` | Segurança e fluxo HTTP autenticado |

APIs privadas: `GET /api/homologacao/m24`, `GET/POST /sources`, `PATCH /sources/:id`, `GET/PUT /contents/:id`, `POST /contents/:id/reviews`, `GET /export`, todas sob o mesmo prefixo.

`PUT` exige revisão da ficha e `contentRevision` atuais. `POST .../reviews` exige `action`, `revision`, `contentRevision`, `requestKey` e `reason`; `approve` também exige `selfReviewReason`. A mesma chave com mesmo corpo retorna a resposta original; chave reutilizada com outro corpo retorna 409. Essa resposta histórica não substitui uma leitura atual para comprovar vigência.

## Próximas tarefas sugeridas ao Codex

1. Validar visualmente o acesso de Admin e o bloqueio dos demais perfis na aplicação publicada.
2. Reproduzir e corrigir as falhas de base em mudança separada, sem afrouxar controles de acesso.
3. Executar os testes novos com PostgreSQL e exercitar dois processos/instâncias para concorrência e repetição simultânea.
4. Realizar QA visual desktop/celular/teclado na aplicação principal com conta Admin.
5. Medir o inventário com volumes reais, substituir N+1 por consultas em lote e paginação no banco.
6. Após teste funcional com o responsável, propor alertas persistentes, curadores por ID, política de revisão e ligação ao editor. Só então propor gate de publicação e contrato de recomendações confiáveis.

### Mensagem pronta para continuar com o Codex

> Continue na `main` do repositório ST1 Academy. Leia `docs/M24_HOMOLOGACAO.md` e `docs/M24_BASELINE_TESTES.md`. A primeira fatia do M24 está integrada à aplicação principal e restrita a contas Admin ativas. Revise o que existe antes de reconstruir. Preserve os registros operacionais, não amplie o acesso para outros papéis e não ative campanhas como parte do M24. Registre cada alteração, teste e pendência neste documento.

## Reversão

Configurar `ACADEMY_M24_ENABLED=0` e reiniciar a aplicação: rotas e entrada desaparecem; as tabelas do piloto permanecem preservadas. Reverter o commit remove a integração, sem apagar tabelas ou dados da biblioteca. Não executar `DROP` nem apagar o histórico do piloto sem uma decisão específica de retenção.
