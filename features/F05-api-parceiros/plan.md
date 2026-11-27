# F05 — API de parceiros — Plano

> Fonte: [docs/prd.md](../../docs/prd.md) · Decisões: [docs/adr.md](../../docs/adr.md) · Desenho: [docs/tdr.md](../../docs/tdr.md)

1. Plugin + hook de chave + error handler JSON.
2. Três rotas e mapeamento de erros.
3. Testes `inject` de contrato (corpos exatos com `toStrictEqual`).
4. Teste HTTP real de rajada (30 × `fetch` paralelos, lotação 5) repetido.
5. Passos 2, 4, 6, 8, 15, 16 no E2E.
