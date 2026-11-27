# F01 — Fundação e harness — Plano

> Fonte: [docs/prd.md](../../docs/prd.md) · Decisões: [docs/adr.md](../../docs/adr.md) · Desenho: [docs/tdr.md](../../docs/tdr.md)

1. Inicializar projeto TS (Fastify, EJS, pg, node-pg-migrate, bcryptjs, pino, vitest, eslint).
2. Escrever `Dockerfile`, `compose.yml`, `compose.test.yml`, `entrypoint.sh`; scripts npm.
3. Migração `0001_init.sql`.
4. `db/pool.ts` e helper `withTx(fn)`.
5. `lib/` + testes unitários.
6. Módulo `auth` + layout + `/healthz` + stub `/organizer/events`.
7. Seed idempotente + teste (rodar 2×).
8. `check-reports.mjs`, `check-state.mjs`, `gates:inner`.
9. AGENTS.md, CLAUDE.md, prompts, `project-state.json`, README inicial (como rodar, endereços, credenciais).
10. Validar: clone limpo → `up` → `down` → `up` → `gates`.
