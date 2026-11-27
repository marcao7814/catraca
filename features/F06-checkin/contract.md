# F06 — Check-in — Contrato

> Fonte: [docs/prd.md](../../docs/prd.md) · Decisões: [docs/adr.md](../../docs/adr.md) · Desenho: [docs/tdr.md](../../docs/tdr.md)

Convenções, variáveis e helpers: [docs/specs.md](../../docs/specs.md#convenções-dos-contratos) e [scripts/eval-helpers.sh](../../scripts/eval-helpers.sh).

**PRE**: `npm run up`; E1 de A com C1 (confirmado, vitrine), C2 (pendente/recusado, API); E2 de B com C3; E3 cancelado com C6 (refunded).

| Item | Verificação | Esperado |
|---|---|---|
| C1 | POST check-in E1 `ZZZZZZZZ` | `Ingresso inválido para este evento` |
| C2 | POST check-in E1 com C3 (de E2) | `Ingresso inválido para este evento` |
| C3 | POST check-in E3 (cancelado) com C6; GET gestão E3 | `Evento cancelado` (POST) e mensagem no lugar do campo (GET) |
| C4 | POST check-in E1 com C2 (pendente ou recusado) | `Ingresso não confirmado` |
| C5 | POST check-in E1 com C1 | `Entrada liberada`; `ticket` de C1 na API → `checkedIn: true` |
| C6 | POST check-in E1 com C1 de novo | `Ingresso já utilizado` |
| C7 | POST com `  c1-em-minúsculas  ` (código com espaços/minúsculas) de um confirmado novo | `Entrada liberada` |
| C8 | `vitest -t "check-in concorrente"` | exatamente 1 `Entrada liberada` e 1 `Ingresso já utilizado` |
| C9 | `vitest run test/unit/checkin.order.test.ts` | ordem de R10 respeitada nos casos com múltiplas condições |
| C10 | B: POST check-in em E1 com C1 | 404; nenhum dado de E1 |
| C11 | Ingresso comprado via API e confirmado em E1 (T3) | `Entrada liberada` |

**Mapeamento**

| Critério | Itens |
|---|---|
| AC-F06-1 | C1, C2 |
| AC-F06-2 | C3 |
| AC-F06-3 | C4 |
| AC-F06-4 | C6 |
| AC-F06-5 | C5, C7, C8 |
| AC-F06-6 | C9 |
| CX-F02-F06 | C10 |
| CX-F04-F06 | C1, C4, C11 |
| CX-F07-F06 | C3 |
