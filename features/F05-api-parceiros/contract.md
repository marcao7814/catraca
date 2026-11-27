# F05 — API de parceiros — Contrato

> Fonte: [docs/prd.md](../../docs/prd.md) · Decisões: [docs/adr.md](../../docs/adr.md) · Desenho: [docs/tdr.md](../../docs/tdr.md)

Convenções, variáveis e helpers: [docs/specs.md](../../docs/specs.md#convenções-dos-contratos) e [scripts/eval-helpers.sh](../../scripts/eval-helpers.sh).

**PRE**

```bash
npm run up                                  # porta 3000, ou CATRACA_PORT do .env
source scripts/eval-helpers.sh              # WEB, API, KEY, login, buy, ticket, events
# se a porta não for 3000: export WEB=http://localhost:<porta> API=http://localhost:<porta>
login org.a@catraca.dev catraca123 a.jar    # 302 /organizer/events

# mkevent <nome> <lotação> <preço "100,00"> [publish] -> imprime o id (cria pela área do organizador)
mkevent() {
  local id
  id=$(curl -s -o /dev/null -b a.jar -w '%{redirect_url}' -X POST "$WEB/organizer/events/new" \
    --data-urlencode "name=$1" --data-urlencode "startsAt=$(date -d '+30 days' +%Y-%m-%dT21:00)" \
    --data-urlencode "venue=Bar do Porão" --data-urlencode "capacity=$2" --data-urlencode "price=$3" \
    | sed 's#.*/organizer/events/##')
  [ "$4" = publish ] && curl -s -o /dev/null -b a.jar -X POST "$WEB/organizer/events/$id/publish"
  echo "$id"
}
```

Testes automatizados de cada item (nomes começam pelo id do item): `test/integration/partner-api.test.ts`,
`test/integration/partner-api.burst.test.ts` e `test/e2e/partner-api.flow.test.ts`. Para rodar só os da F05:
`npm run test:docker -- test/integration/partner-api.test.ts test/integration/partner-api.burst.test.ts test/e2e/partner-api.flow.test.ts`.

| Item | Verificação | Esperado |
|---|---|---|
| C1 | Para cada rota (`GET $API/api/partner/events`, `POST $API/api/partner/events/evt_x/purchases` com corpo JSON válido, `GET $API/api/partner/tickets/tkt_x`): sem cabeçalho e com `-H 'X-Api-Key: errada'` (6 chamadas `curl -s -w ' %{http_code}\n'`). Extra: `curl -s -w ' %{http_code}\n' -X POST $API/api/partner/events/evt_x/purchases -H 'Content-Type: application/json' -d '{'` (sem chave, JSON malformado) | `{"error":"unauthorized"} 401` em todas (a chave é checada antes do parsing) |
| C2 | `E1=$(mkevent E1 2 100,00)` (rascunho); `events` | E1 ausente da lista |
| C3 | `curl -s -o /dev/null -b a.jar -X POST $WEB/organizer/events/$E1/publish`; `events` | objeto de E1 com exatamente `id,name,startsAt,priceCents:10000,availableSeats:2`; `startsAt` no formato `AAAA-MM-DDTHH:MM:SS-03:00`; status 200 |
| C4 | `buy $E1 4000000000000001 a@ex.com` | `{"ticketId":"tkt_…","code":"XXXXXXXX","status":"pending"} 202` (sem outros campos) |
| C5 | `buy $E1 123` / `curl … -d '{}'` / `buy $E1 4000000000000001 x` (e-mail `x`) / `curl … -d '{"buyerEmail":'` (JSON malformado) / `curl … -H 'Content-Type: text/plain' -d '{"buyerEmail":"a@ex.com","cardNumber":"4000000000000001"}'` (sempre com `X-Api-Key`, `-w ' %{http_code}\n'`) | `{"error":"invalid_request"} 422` em todos (nunca 400/415/500) |
| C6 | `buy evt_naoexiste 123` | `{"error":"invalid_request"} 422` (validação antes de existência) |
| C7 | `buy evt_naoexiste 4000000000000001` / `D=$(mkevent D 2 10,00); buy $D 4000000000000001` | `{"error":"event_not_available"} 404` nos dois |
| C8 | `S=$(mkevent S 1 10,00 publish); buy $S 4000000000000003; buy $S 4000000000000001` | 1ª `202`; 2ª `{"error":"sold_out"} 409` |
| C9 | `buy $S 123` (S esgotado) | `{"error":"invalid_request"} 422` (ordem) |
| C10 | `ticket $T` (ticketId de C4) e `ticket` de um ingresso comprado na vitrine (F03; enquanto ela não estiver na branch, coberto pelo teste `C10/AC-F05-5: ingresso da vitrine…`) | `{"ticketId":…,"code":…,"eventId":…,"status":…,"checkedIn":false} 200`, exatamente esses campos |
| C11 | `ticket tkt_naoexiste` | `{"error":"ticket_not_found"} 404` |
| C12 | Rajada do passo 15 do fluxo (abaixo) em `E4=$(mkevent E4 5 10,00 publish)` e depois em `E5` novo | `5 202` e `25 409` nas duas rodadas |
| C13 | `E7=$(mkevent E7 2 100,00 publish)`; `buy $E7 4000000000000001` e esperar `confirmed` (≈5 s); `buy $E7 4000000000000004` → guardar `T2`; `events`; após 45 s, `ticket $T2` e `events` | primeiro `availableSeats 0` para E7; depois `"status":"declined"` e `availableSeats 1` |
| C14 | `grep -n catraca-partner-dev-key README.md compose.yml`; C1 e C3 | a chave documentada no README é a configurada no compose e a aceita (C3 200), outra recebe 401 (C1) |

Rajada (C12, passo 15 do brief):

```bash
seq 30 | xargs -P 30 -I{} curl -s -o /dev/null -w "%{http_code}\n" \
  -X POST "$API/api/partner/events/$E4/purchases" \
  -H "X-Api-Key: $KEY" -H "Content-Type: application/json" \
  -d '{"buyerEmail":"carga{}@example.com","cardNumber":"4000000000000001"}' | sort | uniq -c
```

**Mapeamento**

| Critério | Itens | Testes automatizados |
|---|---|---|
| AC-F05-1 | C1 | `C1/AC-F05-1: …` (3 testes), passo 16 no E2E |
| AC-F05-2 | C2, C3 | `C2/C3/AC-F05-2/CX-F02-F05: …`, `AC-F05-2: …` (2 testes) |
| AC-F05-3 | C4 | `C4/AC-F05-3: …` |
| AC-F05-4 | C5, C6, C7, C8, C9 | `C5/AC-F05-4: …` (2), `C6/…`, `C7/…`, `C8/C9/…`, `AC-F05-4: …` (2) |
| AC-F05-5 | C10, C11 | `C10/AC-F05-5: …` (2), `C11/AC-F05-5: …` |
| AC-F05-6 | C12 | `C12/AC-F05-6: …` (10 rodadas HTTP reais), passo 15 no E2E (E4 e E5) |
| CX-F01-F05 | C14 | `C14/CX-F01-F05: …` |
| CX-F02-F05 | C2, C3 | `C2/C3/AC-F05-2/CX-F02-F05: …` |
| CX-F04-F05 | C13 | `C13/CX-F04-F05: …`, passos 6–8 no E2E |
