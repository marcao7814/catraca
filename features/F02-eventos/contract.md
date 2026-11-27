# F02 — Gestão de eventos — Contrato

> Fonte: [docs/prd.md](../../docs/prd.md) · Decisões: [docs/adr.md](../../docs/adr.md) · Desenho: [docs/tdr.md](../../docs/tdr.md)

Convenções, variáveis e helpers: [docs/specs.md](../../docs/specs.md#convenções-dos-contratos) e [scripts/eval-helpers.sh](../../scripts/eval-helpers.sh).

**PRE**: `npm run up`; cookies `a.jar` (org A), `b.jar` (org B), `p.jar` (participante).

| Item | Verificação | Esperado |
|---|---|---|
| C1 | POST `/organizer/events/new` (A) com nome E1, data no mês seguinte, local, lotação 2, preço `100,00` | 302 para `/organizer/events/evt_…`; página mostra status Rascunho |
| C2 | POST criar com data de ontem | 422 com mensagem de data no futuro; nenhum evento criado (lista inalterada) |
| C3 | POST criar com lotação `0`, `1.5` e preço `0` (três chamadas) | 422 em todas |
| C4 | Editar E1 com data de ontem | 422; data original mantida |
| C5 | Teste `vitest test/integration/events.sellable.test.ts` | rascunho fora, publicado dentro de `listSellableEvents` |
| C6 | POST `/organizer/events/$E1/publish` | página mostra Publicado |
| C7 | Inserir 2 tickets `pending` em E1 via teste de integração; editar lotação para 1 | rejeitado com mensagem de vagas ocupadas |
| C8 | Mesmo cenário, editar lotação para 3 | aceito |
| C9 | Teste de integração: ticket com `price_paid_cents=10000`, mudar preço para 150,00 | ticket mantém 10000; evento 15000 |
| C10 | `curl -b a.jar $WEB/organizer/events/$E1` | 200 com formulário de edição e nome E1 (URL própria por evento) |
| C11 | `curl -b b.jar $WEB/organizer/events` | 200 sem "E1" |
| C12 | `curl -b b.jar -s -w '%{http_code}' $WEB/organizer/events/$E1` | `404`; corpo não contém nome, local, lotação nem preço de E1 |
| C13 | POST de edição/publicação em E1 com `b.jar` | 404; E1 inalterado |
| C14 | Login de A pela tela; `/organizer/events` com `p.jar` → 403; sem cookie → 302 `/login` | conforme |

**Mapeamento**

| Critério | Itens |
|---|---|
| AC-F02-1 | C1 |
| AC-F02-2 | C2, C3, C4 |
| AC-F02-3 | C5, C6 |
| AC-F02-4 | C7, C8 |
| AC-F02-5 | C9 |
| AC-F02-6 | C10 |
| AC-F02-7 | C11, C12, C13 |
| CX-F01-F02 | C14 |
