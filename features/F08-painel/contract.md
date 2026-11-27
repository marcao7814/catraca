# F08 — Painel do evento — Contrato

> Fonte: [docs/prd.md](../../docs/prd.md) · Decisões: [docs/adr.md](../../docs/adr.md) · Desenho: [docs/tdr.md](../../docs/tdr.md)

Convenções, variáveis e helpers: [docs/specs.md](../../docs/specs.md#convenções-dos-contratos) e [scripts/eval-helpers.sh](../../scripts/eval-helpers.sh).

**PRE**: `npm run up`; A em `a.jar`, B em `b.jar`; helper `panel <eventId>` = `curl -b a.jar $WEB/organizer/events/<id> | grep data-metric`.

| Item | Verificação | Esperado |
|---|---|---|
| C1 | Passos 2–9 do fluxo em E1 (2 confirmados a R$100, preço→R$150, lotação→3, 1 confirmado a R$150, 1 recusado); `panel $E1` | Confirmados 3, Pendentes 0, Check-ins 0, Vagas 0, Receita R$ 350,00, Estornados 0 |
| C2 | Com compra 0003 recém-feita em evento novo; `panel` | Pendentes 1; Vagas = lotação − 1 |
| C3 | Após check-in de C1 em E1; `panel $E1` | Check-ins 1; Confirmados 3 (inalterado) |
| C4 | E3 cancelado (1 confirmado→refunded, 1 pendente→cancelled); `panel $E3` | Confirmados 0, Pendentes 0, Check-ins 0, Vagas 0, Receita R$ 0,00, Estornados 1 |
| C5 | E4 após rajada (5 confirmados a R$10) em até 10 s | Confirmados 5, Vagas 0, Receita R$ 50,00 |
| C6 | `vitest run test/integration/dashboard.test.ts` | métricas corretas com mistura de canais e status |
| C7 | `curl -b b.jar $WEB/organizer/events/$E1` | 404; nenhum `data-metric` no corpo |

**Mapeamento**

| Critério | Itens |
|---|---|
| AC-F08-1 | C1, C3, C6 |
| AC-F08-2 | C2, C6 |
| AC-F08-3 | C3, C6 |
| AC-F08-4 | C1, C2, C4 |
| AC-F08-5 | C1, C5, C6 |
| AC-F08-6 | C4, C6 |
| CX-F02-F08 | C7 |
| CX-F04-F08 | C1, C5 |
| CX-F06-F08 | C3 |
| CX-F07-F08 | C4 |
