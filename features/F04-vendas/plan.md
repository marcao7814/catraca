# F04 — Motor de vendas e gateway — Plano

> Fonte: [docs/prd.md](../../docs/prd.md) · Decisões: [docs/adr.md](../../docs/adr.md) · Desenho: [docs/tdr.md](../../docs/tdr.md)

1. `gateway/simulated.ts` + testes da tabela de finais e faixas de atraso.
2. `sales.repo.ts`: inserts, contagem, transições condicionais.
3. `purchaseTicket` com lock; `getSeatStats`; consultas.
4. Worker + integração no ciclo de vida do app.
5. F02 continua contando vagas com `countOccupiedSeats` (do próprio módulo de eventos); `getSeatStats` reutiliza essa função. F02 não importa F04 (o grafo não tem aresta F04→F02).
6. Testes de integração: concorrência 30×5 repetida em 20 eventos; liberação na recusa; no-op de `applyGatewayResult`; preço vigente; retomada após reinício (worker parado, attempt vencido, worker iniciado).
7. Teste de invariante global no `afterAll`.
