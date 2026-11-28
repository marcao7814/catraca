# F06 — Check-in — Contrato

> Fonte: [docs/prd.md](../../docs/prd.md) · Decisões: [docs/adr.md](../../docs/adr.md) · Desenho: [docs/tdr.md](../../docs/tdr.md)

Convenções, variáveis e helpers: [docs/specs.md](../../docs/specs.md#convenções-dos-contratos) e [scripts/eval-helpers.sh](../../scripts/eval-helpers.sh) (`login`, `buy`, `ticket`).

**PRE**: `npm run up` (atrasos reais); `source scripts/eval-helpers.sh` (ajuste `WEB`/`API` se usar outra porta); A em `a.jar`, B em `b.jar`, participante da seed em `p.jar`, e as funções auxiliares abaixo:

```bash
login org.a@catraca.dev catraca123 a.jar; login org.b@catraca.dev catraca123 b.jar
login participante@catraca.dev catraca123 p.jar
# mkev <jar> <nome> <lotação> <preço>  -> cria e publica, imprime o id
mkev() {
  local d; d=$(date -d '+30 days' +%Y-%m-%dT20:00 2>/dev/null || date -v+30d +%Y-%m-%dT20:00)
  local loc; loc=$(curl -s -o /dev/null -b "$1" -w '%{redirect_url}' -X POST "$WEB/organizer/events/new" \
    --data-urlencode "name=$2" --data-urlencode "startsAt=$d" --data-urlencode "venue=Local" \
    --data-urlencode "capacity=$3" --data-urlencode "price=$4")
  local id=${loc##*/}; curl -s -o /dev/null -b "$1" -X POST "$WEB/organizer/events/$id/publish"; echo "$id"
}
# checkin <jar> <eventId> <código>  -> status HTTP e a linha <p id="checkin-result">…</p>
checkin() {
  curl -s -b "$1" -w '\n%{http_code}\n' -X POST "$WEB/organizer/events/$2/checkin" --data-urlencode "code=$3" \
    | grep -oE '<p id="checkin-result">[^<]*</p>|^[0-9]{3}$'
}
```

**Cenário**: E1 de A (`E1=$(mkev a.jar E1 3 100,00)`) com C1 confirmado (vitrine: participante compra E1 com `4000000000000001`, ou `buy $E1 4000000000000001`) e C2 pendente/recusado (`buy $E1 4000000000000004`); E2 de B (`E2=$(mkev b.jar E2 1 20,00)`) com C3 (`buy $E2 4000000000000001`); E3 de A (`E3=$(mkev a.jar E3 5 50,00)`) com C6 (`buy $E3 4000000000000001`, aguardar `confirmed` com `ticket`), depois cancelado (`curl -s -o /dev/null -b a.jar -X POST $WEB/organizer/events/$E3/cancel`), deixando C6 `refunded`.

| Item | Verificação | Esperado |
|---|---|---|
| C1 | `checkin a.jar $E1 ZZZZZZZZ` | 200 e `Ingresso inválido para este evento` |
| C2 | `checkin a.jar $E1 <C3>` (C3 é de E2, de B) | 200 e `Ingresso inválido para este evento` |
| C3 | `checkin a.jar $E3 <C6>`; `curl -s -b a.jar $WEB/organizer/events/$E3 \| grep -oE 'checkin-closed.{0,40}\|checkin-form'` | POST: `Evento cancelado`; GET: `<p id="checkin-closed"><strong>Evento cancelado</strong></p>` e nenhum `checkin-form` (mensagem no lugar do campo) |
| C4 | `checkin a.jar $E1 <C2>` (pendente ou recusado) | 200 e `Ingresso não confirmado` |
| C5 | `checkin a.jar $E1 <C1>`; `ticket <ticketId de C1>` | `Entrada liberada`; `"checkedIn":true` |
| C6 | `checkin a.jar $E1 <C1>` de novo | `Ingresso já utilizado` |
| C7 | Novo confirmado em E1 (`buy $E1 4000000000000001`, aguardar `confirmed`); `checkin a.jar $E1 "  <código em minúsculas>  "` | `Entrada liberada` |
| C8 | `npm run test:docker -- test/integration/checkin.test.ts -t "check-in concorrente"` | teste verde: em cada uma das 15 rodadas, exatamente 1 `Entrada liberada` e 1 `Ingresso já utilizado` (e 1 de 8 pela rota HTTP) |
| C9 | `npm run test:docker -- test/unit/checkin.order.test.ts`; `npm run test:docker -- test/integration/checkin.test.ts -t "C9"` | testes verdes: ordem de R10 respeitada nos casos com múltiplas condições |
| C10 | `checkin b.jar $E1 <C1>`; `curl -s -b b.jar -X POST $WEB/organizer/events/$E1/checkin --data-urlencode code=<C1> \| grep -c E1`; `checkin p.jar $E1 <C1>` | B: 404 e nenhum dado de E1 (`0`); participante: 403 |
| C11 | `buy $E1 4000000000000001` (T3), aguardar `confirmed` com `ticket`; `checkin a.jar $E1 <code de T3>` | `Entrada liberada` |

Automatizado: `test/integration/checkin.test.ts` (C1–C11), `test/unit/checkin.order.test.ts` (C9) e `test/e2e/checkin.flow.test.ts` (passos 10, 11 e 14 do Fluxo do avaliador).

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
