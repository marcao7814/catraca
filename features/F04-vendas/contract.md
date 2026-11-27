# F04 — Motor de vendas e gateway — Contrato

> Fonte: [docs/prd.md](../../docs/prd.md) · Decisões: [docs/adr.md](../../docs/adr.md) · Desenho: [docs/tdr.md](../../docs/tdr.md)

Convenções, variáveis e helpers: [docs/specs.md](../../docs/specs.md#convenções-dos-contratos) e [scripts/eval-helpers.sh](../../scripts/eval-helpers.sh).

**PRE**: `npm run up` (atrasos reais) para C5–C7, C11; `npm run gates` para testes automatizados.

| Item | Verificação | Esperado |
|---|---|---|
| C1 | `vitest run test/integration/sales.purchase.test.ts -t "cria pendente"` | ticket `pending`, código `^[A-Z2-9]{8}$`, retorno < 500 ms |
| C2 | `-t "pendente ocupa vaga"`: lotação 2, uma compra 0003 → `getSeatStats.available` | `1`; após cancelar evento (update direto) → `0` |
| C3 | `-t "sold_out"`: lotação 1, duas compras sequenciais | 2ª retorna `sold_out`; 1 ticket no banco |
| C4 | `vitest run test/integration/sales.concurrency.test.ts` | 20 rodadas × (30 concorrentes, lotação 5) → 5 ok / 25 sold_out em todas; invariante OK |
| C5 | Ambiente padrão: compra 0001 via script `scripts/eval/gateway-timing.mjs` medindo tempo até `confirmed` | entre 2 e 5 s |
| C6 | Mesmo script para 0002 e 4000000000000009 | `declined` entre 2 e 5 s |
| C7 | Mesmo script para 0003 e 0004 | `confirmed`/`declined` entre 30 e 40 s |
| C8 | `-t "recusa libera vaga"`: lotação 1, compra 0002 (escala 0.01), aguarda → nova compra | 2ª compra ok |
| C9 | `-t "invalid_request"`: cartão `123`, 17 dígitos, e-mail `x@` | `invalid_request`; 0 tickets |
| C10 | `-t "event_not_available"`: id inexistente, rascunho, cancelado | `event_not_available` nos três |
| C11 | `-t "preço vigente"`: compra a 100, preço→150, compra | `price_paid_cents` 10000 e 15000 |
| C12 | `-t "no-op"`: ticket `refunded` → `applyGatewayResult(approved)` | retorna `false`; status `refunded` |
| C13 | `-t "draft → publicado → preço"` (CX) | draft→`event_not_available`; publicado→ok com preço vigente; após mudança de preço, compra seguinte com preço novo e anterior inalterada |
| C14 | `-t "lotação × pendentes"` (CX): lotação 2, duas compras (0001 lenta simulada e 0002), editar lotação para 1 via `updateEvent` → rejeitado; após recusa aplicada → aceito | conforme |
| C15 | `-t "retomada após reinício"`; e manual: compra 0003, `npm run down && npm run up`, aguardar 40 s, `ticket $T` | `confirmed` |

**Mapeamento**

| Critério | Itens |
|---|---|
| AC-F04-1 | C1 |
| AC-F04-2 | C2 |
| AC-F04-3 | C3 |
| AC-F04-4 | C4 |
| AC-F04-5 | C5, C6, C7 |
| AC-F04-6 | C8 |
| AC-F04-7 | C9 |
| AC-F04-8 | C10 |
| AC-F04-9 | C11 |
| AC-F04-10 | C12 |
| CX-F02-F04 | C13 |
| CX-F02-F04b | C14 |
| CX-F01-F04 | C15 |
