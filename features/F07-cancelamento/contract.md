# F07 — Cancelamento de evento — Contrato

> Fonte: [docs/prd.md](../../docs/prd.md) · Decisões: [docs/adr.md](../../docs/adr.md) · Desenho: [docs/tdr.md](../../docs/tdr.md)

Convenções, variáveis e helpers: [docs/specs.md](../../docs/specs.md#convenções-dos-contratos) e [scripts/eval-helpers.sh](../../scripts/eval-helpers.sh).

**PRE**: `npm run up` (atrasos reais); A em `a.jar`, B em `b.jar`.

| Item | Verificação | Esperado |
|---|---|---|
| C1 | A cria/publica E3 (lotação 5, R$50); `buy $E3 4000000000000003` (T5); `buy $E3 4000000000000001` (T6); aguarda T6 `confirmed`; antes de 30 s de T5, POST `/organizer/events/$E3/cancel` | 302; página mostra "Evento cancelado" |
| C2 | Imediatamente e em até 10 s: `ticket $T6`, `ticket $T5` | `refunded` e `cancelled` |
| C3 | 45 s após compra de T5: `ticket $T5`; `vitest -t "corrida cancelamento x gateway"` (50×) | `cancelled`; teste verde |
| C4 | `curl -s $WEB/` e listagem da API | E3 ausente nas duas |
| C5 | `buy $E3 4000000000000001` | 404 `event_not_available` |
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
