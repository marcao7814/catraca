# F07 — Cancelamento de evento — Contrato

> Fonte: [docs/prd.md](../../docs/prd.md) · Decisões: [docs/adr.md](../../docs/adr.md) · Desenho: [docs/tdr.md](../../docs/tdr.md)

Convenções, variáveis e helpers: [docs/specs.md](../../docs/specs.md#convenções-dos-contratos) e [scripts/eval-helpers.sh](../../scripts/eval-helpers.sh).

**PRE**: `npm run up` (atrasos reais); A em `a.jar`, B em `b.jar`.

> Nesta branch a API de parceiros (F05) ainda não existe (wave paralela W3). Compras e consultas usam a CLI do motor de vendas (`cli_buy`/`cli_ticket` em `scripts/eval-helpers.sh`), que chama as mesmas funções (`purchaseTicket`/`getTicket`) que a API usará. A listagem da API é coberta por `listSellableEvents` (fonte da listagem) e pelo teste automatizado; a verificação pela API acontece no Fluxo do avaliador final, contra a `main` integrada.

| Item | Verificação | Esperado |
|---|---|---|
| C1 | A cria/publica E3 (lotação 5, R$50); `cli_buy $E3 4000000000000003` (T5); `cli_buy $E3 4000000000000001` (T6); aguarda T6 `confirmed` (`cli_ticket $T6`); antes de 30 s de T5, POST `/organizer/events/$E3/cancel` | 302; página mostra "Evento cancelado" |
| C2 | Imediatamente e em até 10 s: `cli_ticket $T6`, `cli_ticket $T5` | `refunded` e `cancelled` |
| C3 | 45 s após compra de T5: `cli_ticket $T5`; `npm run test:docker -- test/integration/cancellation.race.test.ts -t "corrida cancelamento x gateway"` (50×) | `cancelled`; teste verde |
| C4 | `curl -s $WEB/`; listagem de eventos à venda: `npm run test:docker -- test/integration/cancellation.test.ts -t "C4"` (`listSellableEvents`, fonte da vitrine e da API) | E3 ausente nas duas; teste verde |
| C5 | `cli_buy $E3 4000000000000001` | erro `event_not_available` (a API o expõe como 404) |
| C6 | GET página de gestão de E3; POST de edição e POST `/publish` em E3 | sem formulário de edição; POSTs rejeitados (422/409), dados inalterados |
| C7 | POST `/cancel` de novo em E3 | rejeitado; estado igual |
| C8 | A cria rascunho E9; POST `/organizer/events/$E9/cancel` | rejeitado; E9 continua rascunho |
| C9 | B: POST `/organizer/events/$E3/cancel` em evento publicado de A | 404; evento de A intacto |

**Mapeamento**

| Critério | Itens |
|---|---|
| AC-F07-1 | C1, C7, C9 |
| AC-F07-2 | C2 |
| AC-F07-3 | C3 |
| AC-F07-4 | C6 |
| AC-F07-5 | C8 |
| CX-F02-F07 | C4, C5 |
| CX-F04-F07 | C1, C2, C3 |
