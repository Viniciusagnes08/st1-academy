# ST1 Academy Attempt Limits Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Limitar a três tentativas por avaliação/versão e permitir autorização auditável por Admin ou Supervisor vinculado.

**Architecture:** Um serviço central de cotas e autorizações consulta os históricos existentes e grava concessões de uma tentativa. Rotas para prova final e quizzes aplicam o mesmo serviço em transações. A interface apresenta saldo, bloqueio e tela de gestão de autorizações.

**Tech Stack:** Node.js ES Modules, Express, SQLite/adapter PostgreSQL, frontend JS sem framework, Node test runner.

---

### Task 1: Serviço de cotas e autorização
**Files:** Create `lib/attempt-limits.mjs`; Test `tests/attempt-limits.test.mjs`.
- [ ] Implementar `createAttemptLimitService(db,bank,access,{clock})`: tabela `academy_attempt_grant`, consultas `status()`, `check()`, `grant()`, `blocked()`; validar papel, vínculo, motivo, versão e registro auditável.
- [ ] Testar quatro inícios, retomada, acesso cruzado, concessão unitária e nova versão.

### Task 2: Integração ao fluxo principal
**Files:** Modify `lib/context.mjs`, `server.mjs`.
- [ ] Criar e injetar o serviço na inicialização sem alterar a migração existente.
- [ ] Envolver a contagem e o INSERT da prova final em transação `BEGIN IMMEDIATE`, preservando uma tentativa aberta.
- [ ] Incluir saldos no perfil e rotas autenticadas de consulta/gestão.

### Task 3: Práticas e provas relâmpago
**Files:** Modify `lib/game.mjs`, `lib/quizzes.mjs`.
- [ ] Injetar serviço e aplicar limite nas novas tentativas; concluir desafio expirado antes da contagem, respeitando transação existente.
- [ ] Incluir metadados de tentativa no detalhe do desafio.

### Task 4: UI
**Files:** Modify `public/assets/academy.js`, `public/assets/quiz-panel.js`; Create `public/assets/attempt-approvals.js`.
- [ ] Mostrar contagem e aviso no início de cada avaliação; botão desabilitado quando bloqueado.
- [ ] Adicionar tela restrita de autorizações e registrar motivo.

### Task 5: CI e publicação
**Files:** Update `tests/attempt-limits.test.mjs` e documentação.
- [ ] Executar `node --test tests/attempt-limits.test.mjs` e `npm test` em CI.
- [ ] Verificar jobs PostgreSQL e SQLite e só mesclar após aprovação técnica; validar produção após deploy.
