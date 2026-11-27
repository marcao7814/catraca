# F06 — Check-in — Plano

> Fonte: [docs/prd.md](../../docs/prd.md) · Decisões: [docs/adr.md](../../docs/adr.md) · Desenho: [docs/tdr.md](../../docs/tdr.md)

1. `checkin.service.ts` + testes de ordem (casos com duas condições verdadeiras, ex.: evento cancelado + ingresso de outro evento → inválido; cancelado + ingresso pendente → Evento cancelado).
2. Rota + slot.
3. Teste de concorrência (2 check-ins simultâneos).
4. Passos 10, 11 (C3), 14 (C6) no E2E.
