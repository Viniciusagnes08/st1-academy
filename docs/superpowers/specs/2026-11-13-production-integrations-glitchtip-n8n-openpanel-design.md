# ST1 Academy — Integrações de Produção: GlitchTip, n8n e OpenPanel

Data: 2026-11-13
Status: desenho aprovado em conversa; aguardando revisão final da especificação antes da implementação.

## 1. Objetivo

Integrar GlitchTip, n8n e OpenPanel ao ST1 Academy diretamente em produção sem permitir que indisponibilidade, lentidão ou erro de qualquer serviço externo interrompa login, trilhas, provas, tentativas, certificados, campanhas, recuperação de senha ou persistência principal no PostgreSQL/Supabase.

Regra arquitetural: serviços externos observam, recebem ou processam eventos; eles não participam da transação crítica do usuário.

## 2. Abordagens avaliadas

### A. Integração assíncrona server-side com Outbox — escolhida

O Academy grava o resultado principal e registra eventos de integração na mesma base. Um dispatcher independente entrega esses eventos a n8n e OpenPanel. GlitchTip opera como observabilidade passiva no processo Node.

Vantagens: falhas externas não derrubam o Academy; eventos persistem para retry; nenhum script terceiro precisa ser liberado no CSP; integrações podem ser desligadas individualmente; comportamento é auditável e testável.

### B. Chamadas síncronas durante ações do usuário — rejeitada

Rejeitada porque aumenta latência e transforma falha de terceiros em falha do Academy.

### C. SDKs/scripts de fornecedores diretamente no navegador — rejeitada nesta fase

Rejeitada para preservar o CSP atual, reduzir exposição de dados e evitar dependência do browser em serviços externos. Session Replay do OpenPanel fica fora da primeira implantação.

## 3. Arquitetura

~~~text
Browser
  |
  | somente st1academy.tech
  v
ST1 Academy / Express
  |
  +-- regras de negócio
  +-- PostgreSQL/Supabase
  +-- campanhas e WhatsApp oficial
  |
  +-- Integration Event Recorder
          |
          v
  academy_integration_event
  academy_integration_delivery
          |
          v
  Integration Dispatcher
      |             |
      v             v
     n8n        OpenPanel

GlitchTip <--- observabilidade passiva do processo Node/Express
~~~

## 4. Estrutura de código proposta

Manter o padrão atual de módulos planos dentro de lib/:

- lib/integration-events.mjs
- lib/integration-outbox.mjs
- lib/integration-dispatcher.mjs
- lib/integration-circuit-breaker.mjs
- lib/n8n-integration.mjs
- lib/openpanel-integration.mjs
- lib/integration-health.mjs

O arquivo existente lib/integrations.mjs continua sendo a fonte administrativa de configuração e credenciais criptografadas. Ele será ampliado, não substituído.

## 5. Persistência

academy_integration_event: id, event_type, schema_version, entity_type, entity_id, payload_json, created_at.

academy_integration_delivery: id, event_id, provider, status, attempts, next_attempt_at, last_attempt_at, delivered_at, last_error.

Índice único: event_id + provider. Isso permite um evento ser entregue ao OpenPanel mesmo se n8n estiver indisponível.

## 6. Política de entrega

- timeout por chamada externa: 2,5 s;
- uma execução ativa do dispatcher por processo;
- circuit breaker independente por provider;
- abrir após 5 falhas consecutivas e aguardar 5 minutos;
- retry: 1 min, 5 min, 30 min, 2 h e 12 h;
- após esgotar retries: dead_letter;
- Admin pode reenfileirar manualmente;
- erro externo nunca é propagado para a resposta da ação principal.

O dispatcher roda no startup, em intervalo periódico e por kick assíncrono após novo evento. Em ambientes suspensos, os eventos permanecem no banco até o próximo despertar.

## 7. Catálogo inicial de eventos

- academy.user.activated
- academy.onboarding.completed
- academy.lesson.started
- academy.lesson.completed
- academy.assessment.started
- academy.assessment.completed
- academy.assessment.blocked
- academy.assessment.override_granted
- academy.trail.completed
- academy.certificate.issued
- academy.campaign.clicked
- academy.nps.submitted

Todos usam schema_version 1. Payloads não podem conter senha, token, cookie, segredo, documento pessoal, endereço ou conteúdo integral das respostas de avaliação.

## 8. GlitchTip

Função desta fase: error tracking passivo do backend Express. Performance tracing fica reservada para uma fase posterior.

Implantação: serviço separado no VPS. Criar organização ST1 e projeto ST1 Academy Production.

Código:
- usar o protocolo de envelope Sentry-compatible aceito pelo GlitchTip, sem adicionar dependência nesta fase;
- DSN configurável e cifrado;
- environment e release incluídos no evento;
- remover query string e não enviar body, cookies ou headers da requisição;
- redigir e-mail e valores com aparência de token/secret/password do texto do erro;
- registrar captura passiva no error handler sem substituir o tratamento atual;
- timeout curto e falha fechada: qualquer erro de observabilidade é ignorado pelo fluxo principal;
- manter `GLITCHTIP_TRACES_SAMPLE_RATE` reservado para futura migração ao SDK oficial e performance tracing.

Fallback: sem DSN ou com GlitchTip indisponível, o Academy continua operando e mantém logging local.

## 9. n8n

Função: orquestrar efeitos externos e integrações, nunca regras críticas do Academy.

Implantação Hostinger:
- timezone America/Fortaleza;
- secrets fora do Compose compartilhável;
- HTTPS obrigatório;
- webhook de produção protegido;
- executar n8n audit após configuração;
- não usar queue mode inicialmente sem necessidade de volume;
- preservar volume persistente.

Entrada de eventos: webhook único de ingestão.

Headers: x-academy-event-id, x-academy-event-type, x-academy-schema-version, x-academy-timestamp e header secreto de autenticação.

O n8n usa event_id como chave de idempotência nos efeitos externos.

Fallback: se n8n estiver indisponível, o evento fica no Outbox e será reenviado; o usuário não recebe erro.

## 10. OpenPanel

Função: Product Analytics e Learning Analytics.

Capacidade: o self-host atual recomenda pelo menos 4 GB de RAM. Para conviver com n8n + GlitchTip + OpenPanel no mesmo VPS, 8 GB é o mínimo operacional aceitável e 16 GB é o alvo mais seguro. Se o VPS atual não tiver folga, o adapter fica pronto e a instância deve ir para VPS separada ou OpenPanel Cloud.

Integração inicial totalmente server-side:
- não adicionar script OpenPanel no frontend;
- não alterar o CSP;
- autenticar server-side com clientId + clientSecret;
- usar adapter HTTP controlado pelo Academy;
- não enviar IP para geolocalização nesta fase;
- profileId pseudonimizado de forma estável;
- não enviar nome/e-mail por padrão;
- squad/canal/cargo podem ser propriedades analíticas;
- grupos podem representar squad/equipe.

Session Replay fica fora da primeira implantação por exigir código no navegador, ampliar a superfície de privacidade e alterar CSP.

## 11. Configuração administrativa

Ampliar lib/integrations.mjs e Admin > Integrações.

GlitchTip: enabled, DSN, traces sample rate e status.

n8n: enabled, webhook URL, segredo, última entrega, pendentes e dead letters.

OpenPanel: enabled, API URL, client ID, client secret, última entrega, pendentes e dead letters.

Segredos continuam criptografados pelo mecanismo AES-256-GCM já existente. Nenhuma API administrativa devolve segredo em texto.

## 12. Endpoints administrativos

- GET /api/admin/integrations/health
- POST /api/admin/integrations/:type/test
- GET /api/admin/integrations/deliveries
- POST /api/admin/integrations/deliveries/:id/retry

Todos protegidos por member + admin.

## 13. Testes obrigatórios

Unidade: gravação de evento, criação de deliveries, retry/backoff, circuit breaker, redaction, autenticação n8n, payload OpenPanel, comportamento sem configuração e dead letter.

Integração: servidores HTTP falsos locais cobrindo 200, timeout, 500, conexão recusada, recuperação após falha e independência entre providers.

Regressão obrigatória: login, recuperação de senha, Google login, avaliações, limite de tentativas, override, certificado, NPS, campanhas de e-mail e WhatsApp.

## 14. Sequência de produção

1. Implantar GlitchTip e criar DSN.
2. Implantar n8n com America/Fortaleza, HTTPS e webhook protegido.
3. Confirmar capacidade do VPS antes de iniciar OpenPanel.
4. Publicar Outbox + adapters com comportamento neutro quando configuração estiver ausente.
5. Configurar e validar GlitchTip.
6. Configurar e validar n8n com academy.integration.test.
7. Configurar e validar OpenPanel.
8. Ativar eventos reais gradualmente dentro da mesma produção.
9. Monitorar erros, latência, backlog e memória.
10. Se um provider apresentar problema, desabilitar somente aquele provider.

## 15. Critérios de aceite

- falha de GlitchTip, n8n ou OpenPanel não afeta função crítica;
- eventos pendentes sobrevivem a restart;
- retries não causam duplicidade conhecida;
- segredos não aparecem em API, HTML, logs ou Git;
- CSP permanece restritivo;
- suíte atual permanece verde;
- Admin consegue ver saúde e reenfileirar dead letters;
- analytics/observability não recebem dados pessoais desnecessários.

## 16. Fontes verificadas em 2026-11-13

- https://glitchtip.com/documentation/
- https://glitchtip.com/sdkdocs/node-express/
- https://docs.n8n.io/
- https://www.hostinger.com/support/10473267-how-to-use-the-n8n-vps-template-at-hostinger/
- https://openpanel.dev/docs
- https://openpanel.dev/docs/api/track
- https://openpanel.dev/docs/self-hosting/self-hosting
