# F04 — Motor de vendas e gateway — Contrato

> Fonte: [docs/prd.md](../../docs/prd.md) · Decisões: [docs/adr.md](../../docs/adr.md) · Desenho: [docs/tdr.md](../../docs/tdr.md)

Convenções, variáveis e helpers: [docs/specs.md](../../docs/specs.md#convenções-dos-contratos) e [scripts/eval-helpers.sh](../../scripts/eval-helpers.sh).

**PRE**: `npm run up` (atrasos reais do gateway) para C5–C7 e C15-manual; os demais itens rodam com `npm run test:docker` (container dos gates, Postgres efêmero, atrasos × 0,01). Ainda não há canal de compra na interface nem na API (chegam em F03/F05): no ambiente real a compra é exercitada pela ferramenta `dist/tools/gateway-timing.js`, que chama `purchaseTicket` dentro do container do app.

| Item | Verificação | Esperado |
|---|---|---|
| C1 | `npm run test:docker -- test/integration/sales.purchase.test.ts -t "C1"` | ticket `pending`, `id` `tkt_…`, código `^[A-HJ-NP-Z2-9]{8}$`, retorno < 500 ms sem esperar o gateway; `payment_attempts` guarda só `card_last4` |
| C2 | `npm run test:docker -- test/integration/sales.purchase.test.ts -t "C2"` | lotação 2 + 1 pendente → `available` 1; evento cancelado → `available` 0 |
| C3 | `npm run test:docker -- test/integration/sales.purchase.test.ts -t "C3"` | 2ª compra em lotação 1 → `sold_out`; 1 ticket no banco |
| C4 | `npm run test:docker -- test/integration/sales.concurrency.test.ts` (rodar 2× ou mais) | 20 rodadas × (30 concorrentes, lotação 5) → 5 ok / 25 `sold_out` em todas; invariante sem overbooking |
| C5 | Com `npm run up`: `docker compose exec -T app node dist/tools/gateway-timing.js 4000000000000001` | `"initial":"pending"`, `"final":"confirmed"`, `seconds` entre 2 e 5 |
| C6 | Idem com `4000000000000002 4000000000000009` | ambos `"final":"declined"`, `seconds` entre 2 e 5 |
| C7 | Idem com `4000000000000003 4000000000000004` | `confirmed` e `declined`, `seconds` entre 30 e 40 |
| C8 | `npm run test:docker -- test/integration/sales.purchase.test.ts -t "C8"` | recusa libera a vaga: depois do `declined`, nova compra em lotação 1 é aceita |
| C9 | `npm run test:docker -- test/integration/sales.purchase.test.ts -t "C9"` | cartão `123`, 17 dígitos, com letra, e-mail `x@` ou vazio → `invalid_request`, 0 tickets; validação vem antes da existência do evento |
| C10 | `npm run test:docker -- test/integration/sales.purchase.test.ts -t "C10"` e `-t "indisponível vem antes"` | inexistente, rascunho, cancelado → `event_not_available`; cancelado e esgotado → `event_not_available` |
| C11 | `npm run test:docker -- test/integration/sales.purchase.test.ts -t "C11"` | `price_paid_cents` 10000 e 15000 |
| C12 | `npm run test:docker -- test/integration/sales.purchase.test.ts -t "C12"` | `applyGatewayResult` sobre `cancelled`/`refunded` retorna `false` e não muda o status |
| C13 | `npm run test:docker -- test/integration/sales.purchase.test.ts -t "C13"` (CX-F02-F04) | rascunho→`event_not_available`; publicado→ok com preço vigente; após mudança de preço, compra nova com preço novo e a anterior inalterada |
| C14 | `npm run test:docker -- test/integration/sales.purchase.test.ts -t "C14"` (CX-F02-F04b) | lotação 2 com 2 pendentes → reduzir para 1 rejeitado com a mensagem de vagas ocupadas; após o `declined` aplicado → aceito |
| C15 | `npm run test:docker -- test/integration/sales.purchase.test.ts -t "C15"` (CX-F01-F04); manual: com `npm run up`, rodar em segundo plano `docker compose run --rm -T app node dist/tools/gateway-timing.js 4000000000000003` (container separado), após ~8 s `docker compose stop app`, aguardar 35 s, `docker compose start app` | resposta vencida durante a parada é aplicada quando o worker volta: a ferramenta reporta `"final":"confirmed"` com `seconds` > 40 |

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
