# F05 — API de parceiros — Contrato

> Fonte: [docs/prd.md](../../docs/prd.md) · Decisões: [docs/adr.md](../../docs/adr.md) · Desenho: [docs/tdr.md](../../docs/tdr.md)

Convenções, variáveis e helpers: [docs/specs.md](../../docs/specs.md#convenções-dos-contratos) e [scripts/eval-helpers.sh](../../scripts/eval-helpers.sh).

**PRE**: `npm run up`; A logado em `a.jar`; `KEY` do README.

| Item | Verificação | Esperado |
|---|---|---|
| C1 | Para cada rota: sem cabeçalho e com `X-Api-Key: errada` (6 chamadas `curl -s -w ' %{http_code}'`) | `{"error":"unauthorized"} 401` em todas |
| C2 | A cria E1 (lotação 2, R$100) rascunho; `curl -s -H "X-Api-Key: $KEY" $API/api/partner/events` | E1 ausente |
| C3 | A publica E1; mesma listagem | objeto com exatamente `id,name,startsAt,priceCents:10000,availableSeats:2`; `startsAt` ISO com offset |
| C4 | `buy $E1 4000000000000001 a@ex.com` | 202 `{"ticketId":"tkt_…","code":"…","status":"pending"}` |
| C5 | `buy $E1 123` / corpo `{}` / `buyerEmail:"x"` / JSON malformado | 422 `invalid_request` em todos |
| C6 | Ordem: id inexistente com cartão `123` | 422 (validação antes de existência) |
| C7 | id inexistente / evento rascunho (cartão válido) | 404 `event_not_available` |
| C8 | Evento esgotado, cartão válido | 409 `sold_out` |
| C9 | Evento esgotado com cartão `123` | 422 (ordem) |
| C10 | `ticket $T` (compra da API) e `ticket` de ingresso de vitrine | 200 com `ticketId,code,eventId,status,checkedIn` exatos |
| C11 | `ticket tkt_naoexiste` | 404 `{"error":"ticket_not_found"}` |
| C12 | Rajada do passo 15 do fluxo em E4 e E5 novos (lotação 5) | `5 202` e `25 409` nas duas |
| C13 | E1 lotação 2 com 1 confirmado; `buy $E1 4000000000000004` → listagem; após 45 s, `ticket $T2` e listagem | `availableSeats 0`; depois `declined` e `availableSeats 1` |
| C14 | `grep PARTNER_API_KEY README.md compose.yml` e C1/C3 | chave documentada é a aceita |

**Mapeamento**

| Critério | Itens |
|---|---|
| AC-F05-1 | C1 |
| AC-F05-2 | C2, C3 |
| AC-F05-3 | C4 |
| AC-F05-4 | C5, C6, C7, C8, C9 |
| AC-F05-5 | C10, C11 |
| AC-F05-6 | C12 |
| CX-F01-F05 | C14 |
| CX-F02-F05 | C2, C3 |
| CX-F04-F05 | C13 |
