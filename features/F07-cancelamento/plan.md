# F07 — Cancelamento de evento — Plano

> Fonte: [docs/prd.md](../../docs/prd.md) · Decisões: [docs/adr.md](../../docs/adr.md) · Desenho: [docs/tdr.md](../../docs/tdr.md)

1. `cancellation.service.ts` + rota POST + slot na página de gestão.
2. Bloqueios de edição/publicação de `cancelled` em F02.
3. Testes: transições, irreversibilidade, rascunho não cancelável, posse (B → 404).
4. Teste de corrida cancelamento × worker repetido 50×.
5. Passos 12–14 no E2E.
