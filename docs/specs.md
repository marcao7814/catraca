# Specs — índice, convenções e cobertura — Catraca MVP

> Fonte de verdade dos critérios: [prd.md](prd.md). Decisões: [adr.md](adr.md). Desenho: [tdr.md](tdr.md).
> Spec, plano e contrato de cada feature ficam em `features/Fxx-<nome>/`; os relatórios do avaliador, em `features/Fxx-<nome>/reports/`. Este arquivo guarda as convenções comuns, o índice e a cobertura cross-feature.

## Convenções dos contratos

- **Pré-requisitos (PRE)**: estado do ambiente antes de exercitar o contrato.
- **Itens (Cn)**: verificáveis por comando ou efeito observável; o avaliador registra comando, saída e veredito `PASS`/`FAIL`.
- **Mapeamento**: cada critério `AC-*` da feature e cada `CX-*` atribuído a ela no PRD aponta para ≥ 1 item.
- Variáveis: `WEB=API=http://localhost:3000`, `KEY=catraca-partner-dev-key`.
- Helpers de shell usados nos itens (definidos em `scripts/eval-helpers.sh`):
  - `login <email> <senha> <jar>` — POST `/login` guardando cookie em `<jar>`.
  - `mkevent <jar> <nome> <lotação> <preço> [publish]` — cria (e publica) evento, imprime o id.
  - `buy <eventId> <cartão> [email]` — POST de compra na API, imprime o corpo.
  - `ticket <ticketId>` — GET do ingresso na API.
- Para itens com cartões lentos o avaliador usa o ambiente padrão (`npm run up`, atrasos reais). Testes automatizados usam `GATEWAY_DELAY_SCALE=0.01`.

## Mapa

| ID | Pasta | Wave | Depende de |
|---|---|---|---|
| F01 | `features/F01-fundacao` | W0 | — |
| F02 | `features/F02-eventos` | W1 | F01 |
| F04 | `features/F04-vendas` | W2 | F01, F02 |
| F03 | `features/F03-vitrine` | W3 ∥ | F01, F02, F04 |
| F05 | `features/F05-api-parceiros` | W3 ∥ | F01, F02, F04 |
| F07 | `features/F07-cancelamento` | W3 ∥ | F02, F04 |
| F06 | `features/F06-checkin` | W4 ∥ | F02, F04, F07 |
| F08 | `features/F08-painel` | W4 ∥ | F02, F04, F06, F07 |

## Artefatos por feature

| ID | Spec | Plano | Contrato | Relatórios |
|---|---|---|---|---|
| F01 | [spec](../features/F01-fundacao/spec.md) | [plano](../features/F01-fundacao/plan.md) | [contrato](../features/F01-fundacao/contract.md) | [reports/](../features/F01-fundacao/reports/) |
| F02 | [spec](../features/F02-eventos/spec.md) | [plano](../features/F02-eventos/plan.md) | [contrato](../features/F02-eventos/contract.md) | [reports/](../features/F02-eventos/reports/) |
| F03 | [spec](../features/F03-vitrine/spec.md) | [plano](../features/F03-vitrine/plan.md) | [contrato](../features/F03-vitrine/contract.md) | [reports/](../features/F03-vitrine/reports/) |
| F04 | [spec](../features/F04-vendas/spec.md) | [plano](../features/F04-vendas/plan.md) | [contrato](../features/F04-vendas/contract.md) | [reports/](../features/F04-vendas/reports/) |
| F05 | [spec](../features/F05-api-parceiros/spec.md) | [plano](../features/F05-api-parceiros/plan.md) | [contrato](../features/F05-api-parceiros/contract.md) | [reports/](../features/F05-api-parceiros/reports/) |
| F06 | [spec](../features/F06-checkin/spec.md) | [plano](../features/F06-checkin/plan.md) | [contrato](../features/F06-checkin/contract.md) | [reports/](../features/F06-checkin/reports/) |
| F07 | [spec](../features/F07-cancelamento/spec.md) | [plano](../features/F07-cancelamento/plan.md) | [contrato](../features/F07-cancelamento/contract.md) | [reports/](../features/F07-cancelamento/reports/) |
| F08 | [spec](../features/F08-painel/spec.md) | [plano](../features/F08-painel/plan.md) | [contrato](../features/F08-painel/contract.md) | [reports/](../features/F08-painel/reports/) |

---

## Cobertura dos critérios cross-feature

| CX | Contrato | Itens |
|---|---|---|
| CX-F01-F02 | F02 | C14 |
| CX-F01-F04 | F04 | C15 |
| CX-F01-F03 | F03 | C11 |
| CX-F01-F05 | F05 | C14 |
| CX-F02-F04 | F04 | C13 |
| CX-F02-F04b | F04 | C14 |
| CX-F02-F03 | F03 | C1, C2 |
| CX-F02-F05 | F05 | C2, C3 |
| CX-F04-F03 | F03 | C7 |
| CX-F04-F03b | F03 | C8 |
| CX-F04-F05 | F05 | C13 |
| CX-F02-F07 | F07 | C4, C5 |
| CX-F04-F07 | F07 | C1–C3 |
| CX-F02-F06 | F06 | C10 |
| CX-F04-F06 | F06 | C1, C4, C11 |
| CX-F07-F06 | F06 | C3 |
| CX-F02-F08 | F08 | C7 |
| CX-F04-F08 | F08 | C1, C5 |
| CX-F06-F08 | F08 | C3 |
| CX-F07-F08 | F08 | C4 |

## Modelo de relatório de avaliação

`features/Fxx-<nome>/reports/AAAA-MM-DD-HHMM-<sha7>.md` — criado uma vez, nunca editado.

```markdown
# Avaliação Fxx — <nome>
- Data: 2026-11-27 10:30 -03:00
- Commit avaliado: <sha completo> (branch feat/Fxx-… | main)
- Ferramenta / modelo: Claude Code / claude-opus-5-5 (sessão nova, sem contexto do implementador)
- Veredito geral: APPROVED | CHANGES_REQUESTED

| Item | Veredito | Evidência |
|---|---|---|
| C1 | PASS | `curl ...` → `HTTP 202 {"ticketId":...}` |
| C2 | FAIL | esperado `refunded`, obtido `confirmed` (saída abaixo) |

## Evidências detalhadas
### C1
$ comando
saída
```
