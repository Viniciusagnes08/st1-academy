# Secure Password Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Recuperação segura de senhas por e-mail usando Better Auth e SMTP existente.

**Architecture:** Better Auth mantém token e revogação de sessão. Um endpoint público com resposta neutra realiza throttle de e-mail e IP antes de solicitar ao Better Auth a geração do link. Páginas estáticas com JS de mesma origem implementam os formulários; um serviço SMTP reutiliza as configurações cifradas de Integrações.

**Tech Stack:** Node 24+, Better Auth 1.7.7, Express 5, nodemailer, SQLite/Postgres.

---

### 1. Recuperação e SMTP transacional

**Files:** `lib/password-recovery.mjs`, `lib/password-reset-mail.mjs`, `tests/password-recovery.test.mjs`

- [ ] Criar serviço de throttle persistente com chave hash e período deslizante; não retornar diferença entre e-mails válidos e inexistentes.
- [ ] Criar templates de recuperação (URL confiável, 30 min) e aviso de alteração, com HTML escapado, texto simples e SMTP TLS.
- [ ] Criar testes para throttling, ausência de segredo em logs e conteúdo do e-mail.

### 2. Better Auth e rotas

**Files:** `lib/context.mjs`, `server.mjs`, `tests/password-reset-http.test.mjs`

- [ ] Configurar `sendResetPassword`, `onPasswordReset`, `resetPasswordTokenExpiresIn=1800`, `revokeSessionsOnPasswordReset=true` e senha mínima de 12 caracteres.
- [ ] Injetar mailer fake em testes e usar SMTP efetivo da aba Integrações em execução real.
- [ ] Criar `POST /api/password-recovery/request`, limitar e-mails/IP, bloquear endpoints alternativos de solicitação direta.
- [ ] Criar `/esqueci-senha` e `/redefinir-senha`, com cache desativado.

### 3. Frontend

**Files:** `public/login.html`, `public/assets/login.js`, `public/forgot-password.html`, `public/reset-password.html`, `public/assets/password-recovery.js`

- [ ] Tornar "Esqueci minha senha" link funcional; criar formulários acessíveis de e-mail e de nova senha.
- [ ] Remover token da URL da página de reset após leitura, manter mensagens não reveladoras e indicar entrada Google quando apropriado.
- [ ] Preservar login Google, cadastro por convite, animações e estilo existentes.

### 4. QA e operação

**Files:** `.env.example`, `docs/superpowers/specs/2026-11-12-secure-password-recovery-design.md`, `tests/password-reset-http.test.mjs`

- [ ] Rodar `node --test tests/password-recovery.test.mjs tests/password-reset-http.test.mjs` e `npm test`.
- [ ] Validar fluxo SMTP de produção com servidor configurado sem credenciais em logs.
- [ ] Mesclar apenas após revisão, CI e validação de migração/storage; registrar eventuais falhas preexistentes separadamente.
