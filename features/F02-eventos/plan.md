# F02 — Gestão de eventos — Plano

> Fonte: [docs/prd.md](../../docs/prd.md) · Decisões: [docs/adr.md](../../docs/adr.md) · Desenho: [docs/tdr.md](../../docs/tdr.md)

1. `events.repo.ts` (SQL) e `events.service.ts` com validação.
2. Rotas e views: lista, novo, gestão, editar, publicar.
3. `management-slots.ts` e render da página de gestão com slots.
4. Guarda `loadOwnedEvent` aplicada a todas as rotas `:id`.
5. Testes: validação R01, estados R02, R03 com tickets inseridos direto na tabela, R13 (B → 404), `listSellableEvents`.
6. Atualizar E2E (passos 2–4 do fluxo).
