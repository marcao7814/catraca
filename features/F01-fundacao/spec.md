# F01 — Fundação e harness — Spec

> Fonte: [docs/prd.md](../../docs/prd.md) · Decisões: [docs/adr.md](../../docs/adr.md) · Desenho: [docs/tdr.md](../../docs/tdr.md)

**Objetivo.** Ambiente reprodutível com um comando, esquema de banco completo, autenticação, papéis, seed idempotente e porta de entrada para agentes.

**Escopo.**
- `package.json` com scripts `up`, `down`, `gates`, `seed`, `reset`, `logs`, `gates:inner`, `lint`, `typecheck`, `test`, `build`, `dev`.
- `scripts/gates.mjs`: roda `gates:inner` no container `gates` contra `db_test` efêmero, remove o `db_test` e depois roda `check-reports` e `check-state` no host (precisam do git).
- `Dockerfile` multi-stage (`dev` com devDependencies para gates; `prod` com `dist/`).
- `compose.yml` (`db`, `app`) e `compose.test.yml` (`db_test`, `gates`, profile `test`), projeto `catraca`.
- `scripts/entrypoint.sh`: `node dist/db/migrate.js` (aguarda o DB e aplica `migrations/*.sql` sob advisory lock) → `node dist/seed/seed.js` → `node dist/server.js`.
- Migração `0001_init.sql` com todas as tabelas do [docs/tdr.md §3](../../docs/tdr.md) (as features seguintes podem adicionar migrações, nunca editar a 0001 após o merge).
- Módulo `auth`: `/login`, `/logout`, sessões, `currentUser`, `requireRole`, hashing bcryptjs.
- `lib/`: `ids.ts` (`newId('evt')`, `newTicketCode()`), `money.ts` (`parseBRL`, `formatBRL`), `dates.ts` (`toIsoOffset`, `parseLocalDateTime`), layout EJS com menu por papel.
- `/healthz`.
- Seed com as três contas do [docs/tdr.md §8](../../docs/tdr.md).
- `AGENTS.md`, `CLAUDE.md` (aponta para AGENTS.md), `project-state.json` com F01–F08 em `todo`, `docs/prompts/implementer.md`, `docs/prompts/evaluator.md`.
- `scripts/check-reports.mjs`, `scripts/check-state.mjs`, `scripts/eval-helpers.sh`. O E2E do Fluxo do avaliador é uma suíte Vitest (`test/e2e/`) que cresce a cada feature.
- Stub de rota `/organizer/events` protegida (lista vazia) para validar papéis; F02 a substitui.

**Decisões técnicas.** ADR-001, 002, 003, 008, 011, 012. Postgres sem porta publicada no host (só o app o acessa). Porta do app no host configurável por `CATRACA_PORT` (padrão 3000). Trigger no banco rejeita transições de status fora da tabela do ADR-006. Lint com regra de fronteira entre `src/modules/*` conforme grafo do PRD.

**Fora do escopo da feature.** Telas de evento, compra, vitrine.
