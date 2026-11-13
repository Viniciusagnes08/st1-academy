# Production Integrations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add production-safe GlitchTip, n8n and OpenPanel integrations to ST1 Academy without allowing external failures to block critical Academy flows.

**Architecture:** Persist integration events in the Academy database, fan them out into per-provider deliveries, and process them asynchronously with provider-specific timeouts, retries and circuit breakers. GlitchTip is passive observability; n8n and OpenPanel consume server-side events. Existing email, WhatsApp, NPS and authentication remain native.

**Tech Stack:** Node.js 24, Express 5, SQLite/PostgreSQL-compatible repository adapter, native fetch/AbortSignal, Sentry-compatible envelope protocol for GlitchTip, existing AES-256-GCM integration settings, node:test.

---

## File map

- `lib/integration-circuit-breaker.mjs`: provider-local circuit state.
- `lib/integration-outbox.mjs`: event and delivery persistence, retry schedule, dead-letter handling.
- `lib/integration-dispatcher.mjs`: asynchronous delivery loop and provider isolation.
- `lib/n8n-integration.mjs`: authenticated n8n webhook adapter.
- `lib/openpanel-integration.mjs`: OpenPanel server-side event adapter.
- `lib/integration-health.mjs`: admin health/read-model helpers.
- `lib/integrations.mjs`: encrypted configuration for GlitchTip, n8n and OpenPanel.
- `server.mjs`: service wiring, admin routes, dispatcher lifecycle, event emission hooks.
- `public/assets/integrations.js`: admin configuration/health/retry UI.
- `tests/integration-outbox.test.mjs`: persistence, retries and provider independence.
- `tests/integration-providers.test.mjs`: n8n/OpenPanel HTTP contracts and timeout behavior.
- `tests/integrations.test.mjs`: encrypted setting coverage.

### Task 1: Persist integration events and retries

**Files:**
- Create: `lib/integration-circuit-breaker.mjs`
- Create: `lib/integration-outbox.mjs`
- Test: `tests/integration-outbox.test.mjs`

- [ ] **Step 1: Write failing tests** for one event producing one delivery per enabled provider, independent provider states, retry schedule `1m,5m,30m,2h,12h`, dead-letter after final failure, and manual retry.

Core API expected by the tests:
```js
const outbox=createIntegrationOutbox(db,{clock});
const event=outbox.record('academy.trail.completed',{entityType:'trail',entityId:'pap-t1',payload:{userId:'u1'}},['n8n','openpanel']);
assert.equal(outbox.due().length,2);
outbox.fail(delivery.id,'boom');
outbox.retry(delivery.id);
```

- [ ] **Step 2: Run** `node --test tests/integration-outbox.test.mjs`; expect FAIL because modules do not exist.
- [ ] **Step 3: Implement minimal persistence** using `academy_integration_event` and `academy_integration_delivery`, unique `(event_id,provider)`, attempt counters and ISO timestamps.
- [ ] **Step 4: Implement circuit breaker** with `canAttempt()`, `success()` and `failure()`; open after 5 consecutive failures for 5 minutes.
- [ ] **Step 5: Re-run test** and expect PASS.
- [ ] **Step 6: Commit** `feat: add durable integration outbox`.

### Task 2: Add n8n and OpenPanel provider adapters

**Files:**
- Create: `lib/n8n-integration.mjs`
- Create: `lib/openpanel-integration.mjs`
- Create: `lib/integration-dispatcher.mjs`
- Test: `tests/integration-providers.test.mjs`

- [ ] **Step 1: Write failing tests** with local HTTP servers for 200, 500, timeout, connection failure, one-provider-fails/other-succeeds, and idempotency headers.

n8n request contract:
```js
await fetch(webhookUrl,{method:'POST',headers:{
  'content-type':'application/json',
  'x-academy-event-id':event.id,
  'x-academy-event-type':event.event_type,
  'x-academy-schema-version':String(event.schema_version),
  'x-academy-timestamp':event.created_at,
  'x-academy-secret':secret
},body:JSON.stringify(envelope),signal:AbortSignal.timeout(2500)});
```

OpenPanel request contract:
```js
await fetch(apiUrl+'/track',{method:'POST',headers:{
  'content-type':'application/json',
  'openpanel-client-id':clientId,
  'openpanel-client-secret':clientSecret
},body:JSON.stringify({type:'track',payload:{name:event.event_type,profileId,payload:properties}}),signal:AbortSignal.timeout(2500)});
```

- [ ] **Step 2: Run** provider tests and expect FAIL.
- [ ] **Step 3: Implement adapters** returning `{ok,status}` and throwing only provider-local delivery errors; never log full payload/secret.
- [ ] **Step 4: Implement dispatcher** that leases due deliveries in-process, checks circuit breaker, invokes adapters independently, and records success/failure.
- [ ] **Step 5: Re-run tests** and expect PASS.
- [ ] **Step 6: Commit** `feat: add resilient n8n and OpenPanel delivery`.

### Task 3: Extend encrypted integration configuration

**Files:**
- Modify: `lib/integrations.mjs`
- Modify: `tests/integrations.test.mjs`

- [ ] **Step 1: Add failing tests** proving DSN/secrets/client secret are encrypted and omitted from public configuration.
- [ ] **Step 2: Add config groups**:
```js
glitchtip: ['GLITCHTIP_DSN','GLITCHTIP_TRACES_SAMPLE_RATE'],
n8n: ['N8N_WEBHOOK_URL','N8N_WEBHOOK_SECRET'],
openpanel: ['OPENPANEL_API_URL','OPENPANEL_CLIENT_ID','OPENPANEL_CLIENT_SECRET']
```
- [ ] **Step 3: Validate HTTPS URLs, sample rate 0..1, non-empty IDs and >=16-char secrets.**
- [ ] **Step 4: Run** `node --test tests/integrations.test.mjs`; expect PASS.
- [ ] **Step 5: Commit** `feat: configure production integrations securely`.

### Task 4: Add passive GlitchTip reporting

**Files:**
- Create: `lib/glitchtip-integration.mjs`
- Modify: `server.mjs`
- Test: `tests/glitchtip-integration.test.mjs`

- [x] **Step 1: Implement a native Sentry-compatible envelope sender** without adding a package dependency, because the implementation environment could not reach the npm registry safely enough to update the lockfile.
- [x] **Step 2: Activate only when a valid DSN exists**, attach release/environment, strip query strings and redact e-mail/token-like values; no request body, headers or cookies are sent.
- [x] **Step 3: Register passive capture in the Express error handler** while preserving existing responses and local logging.
- [x] **Step 4: Fail closed:** timeout/network/GlitchTip failures return `false` and never propagate into the Academy request.
- [x] **Step 5: Cover envelope shape, redaction and unavailable-provider behavior with focused tests.
- [x] **Step 6: Keep `GLITCHTIP_TRACES_SAMPLE_RATE` reserved for a later SDK-based performance phase; this release implements error tracking only.

### Task 5: Wire event recording into Academy flows

**Files:**
- Modify: `server.mjs`
- Modify only the domain modules necessary to expose post-success hooks if a safe hook is not already available.
- Test: extend relevant existing tests.

- [ ] **Step 1: Add an `emitIntegrationEvent()` helper** that only records after the domain operation succeeds and never throws into the caller.
- [ ] **Step 2: Emit v1 events** for onboarding completion, lesson started/completed, assessment started/completed/blocked, override granted, trail completed, certificate issued, campaign click and NPS submitted.
- [ ] **Step 3: Ensure payload allow-listing** excludes answers, passwords, tokens, cookies, CPF/documents, addresses and raw request bodies.
- [ ] **Step 4: Run affected test files and full `npm test`; expect PASS.**
- [ ] **Step 5: Commit** `feat: publish Academy learning events to integration outbox`.

### Task 6: Admin health, test and retry controls

**Files:**
- Create: `lib/integration-health.mjs`
- Modify: `server.mjs`
- Modify: `public/assets/integrations.js`
- Test: `tests/integrations.test.mjs` and HTTP route tests.

- [ ] **Step 1: Add admin routes**:
```text
GET  /api/admin/integrations/health
POST /api/admin/integrations/:type/test
GET  /api/admin/integrations/deliveries
POST /api/admin/integrations/deliveries/:id/retry
```
- [ ] **Step 2: Implement safe test events** using `academy.integration.test`, never a real learner action.
- [ ] **Step 3: Extend the Integrations panel** with GlitchTip, n8n and OpenPanel cards plus pending/dead-letter counts and retry action.
- [ ] **Step 4: Run syntax/UI tests and full `npm test`; expect PASS.**
- [ ] **Step 5: Commit** `feat: manage production integrations from admin`.

### Task 7: Production verification and merge

**Files:**
- Modify: `.env.example`
- Modify: `README.md` or production integration docs

- [ ] **Step 1: Document variables without real credentials.**
- [ ] **Step 2: Open PR and wait for both GitHub Actions jobs (`test` and `postgres`) to pass.**
- [ ] **Step 3: Review diff for secrets, unexpected CSP changes and synchronous external calls.**
- [ ] **Step 4: Merge only after CI is green.**
- [ ] **Step 5: Configure provider credentials in production Admin/hosting environment, then trigger `academy.integration.test` for each provider.**
- [ ] **Step 6: Verify Academy critical flows still work with each provider temporarily disabled/unreachable.**

## Self-review

- Spec coverage: Outbox, retries, circuit breaker, GlitchTip, n8n, OpenPanel, admin health, security, tests and production sequence are all mapped to tasks.
- Placeholder scan: no TBD/TODO placeholders.
- Type consistency: provider names are `n8n` and `openpanel`; event schema field is `schema_version`; delivery terminal state is `dead_letter` throughout.
