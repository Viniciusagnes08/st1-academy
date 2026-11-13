# Estrutura organizacional da ST1 Academy — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cadastrar 18 áreas e seus setores na ST1 Academy, permitir classificação de usuários e administração sem alterar permissões.

**Architecture:** Um serviço de domínio mantém catálogo padrão e setores editáveis persistidos em SQLite/PostgreSQL via adapter existente. Onboarding persiste associação em tabela própria, e uma tela Admin oferece navegação e classificação; rotas protegidas reutilizam os middlewares atuais.

**Tech Stack:** Node.js 24, Express 5, SQLite compatível via PostgreSQL/Supabase, JavaScript ES modules, testes node:test, GitHub Actions, Render.

---

### Task 1: Catálogo e persistência
**Files:** Create: lib/organization.mjs; Test: tests/organization.test.mjs
- [ ] Escrever teste de 18 áreas, sem duplicação no bootstrap e com setores padrão.
- [ ] Rodar teste: node --test tests/organization.test.mjs (deve falhar antes de implementar).
- [ ] Criar tabelas academy_org_sector e academy_org_member aditivas e sementes com ON CONFLICT DO NOTHING.
- [ ] Implementar list(), resolveSector(), createSector(), updateSector(), assignUser(), members(), audit.
- [ ] Rodar node --test tests/organization.test.mjs (esperado PASS).

### Task 2: Onboarding por área e setor
**Files:** Modify: lib/onboarding.mjs, public/assets/onboarding.js; Test: tests/onboarding.test.mjs
- [ ] Cobrir validação de par areaId/sectorId e setor desativado.
- [ ] Injetar organização no createOnboardingService; preservar modo legado para fixtures existentes.
- [ ] Salvar IDs e rótulo do setor, sincronizando vínculo do colaborador sem alterar grants.
- [ ] Atualizar interface em duas etapas (área → setor), mantendo todas as perguntas seguintes.
- [ ] Rodar node --test tests/onboarding.test.mjs.

### Task 3: Endpoints administrativos
**Files:** Modify: server.mjs; Test: tests/organization-http.test.mjs
- [ ] Cobrir GET/POST/PATCH de setores e PATCH de classificação de colaborador.
- [ ] Instanciar organização antes do onboarding e compartilhar na aplicação.
- [ ] Aplicar middlewares member + admin + contentAction aos endpoints.
- [ ] Negar não-admin e inputs inválidos; registrar auditoria de mudanças.
- [ ] Rodar node --test tests/organization-http.test.mjs.

### Task 4: Painel Gestão → Setores
**Files:** Create: public/assets/organization.js, public/assets/organization.css; Modify: public/index.html, public/assets/academy.js, public/assets/management.js
- [ ] Adicionar navegação Admin e link na página de Cadastros.
- [ ] Criar painel com 18 áreas expansíveis, especialidades com status e editor simples.
- [ ] Adicionar classificação e busca de colaboradores, com valores salvos no banco.
- [ ] Mostrar que classificação organizacional não altera permissões.
- [ ] Verificar que no mobile a interface se adapta e que itens de usuário são escapados.

### Task 5: CI e publicação
**Files:** docs/superpowers/specs/2026-11-13-academy-organizacao-setores-design.md, docs/superpowers/plans/2026-11-13-academy-organizacao-setores.md
- [ ] Rodar npm test e os testes PostgreSQL via GitHub Actions no PR.
- [ ] Auditar diffs, evitar alterações em credenciais, códigos de autorização, certificações e campanhas.
- [ ] Mesclar após checks verdes, sem reescrever histórico.
- [ ] Verificar atualização de produção por deploy, /healthz e experiência Admin quando permitido.

## Critérios de aceite
18 áreas; setores ativos; CRUD Admin de setores; associação por usuário; escolha no primeiro acesso; informações antigas preservadas; sem alteração de roles, grants ou squads; testes integrados aprovados.
