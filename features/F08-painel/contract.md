# F08 — Painel do evento — Contrato

> Fonte: [docs/prd.md](../../docs/prd.md) · Decisões: [docs/adr.md](../../docs/adr.md) · Desenho: [docs/tdr.md](../../docs/tdr.md)

Convenções, variáveis e helpers: [docs/specs.md](../../docs/specs.md#convenções-dos-contratos) e [scripts/eval-helpers.sh](../../scripts/eval-helpers.sh).

**PRE**: `npm run up` (atrasos reais); `source scripts/eval-helpers.sh` (com `WEB`/`API` apontando para a porta do app, ex. `CATRACA_PORT` do `.env`); `login org.a@catraca.dev catraca123 a.jar`; `login org.b@catraca.dev catraca123 b.jar`. Helpers definidos inline:

```bash
# panel <eventId> [jar]  -> as seis métricas (data-metric) da página de gestão
panel() { curl -s -b "${2:-a.jar}" "$WEB/organizer/events/$1" | grep -o 'data-metric="[a-z]*">[^<]*'; }
# mkevent <nome> <lotação> <preço>  -> cria e publica como A, imprime o id
mkevent() {
  local id; id=$(curl -s -o /dev/null -b a.jar -w '%{redirect_url}' -X POST "$WEB/organizer/events/new" \
    --data-urlencode "name=$1" --data-urlencode "startsAt=$(date -d '+30 days' +%Y-%m-%dT20:00)" \
    --data-urlencode "venue=Local" --data-urlencode "capacity=$2" --data-urlencode "price=$3" | sed 's#.*/##')
  curl -s -o /dev/null -b a.jar -X POST "$WEB/organizer/events/$id/publish"; echo "$id"
}
# edit <eventId> <nome> <lotação> <preço>  -> POST de edição como A, imprime o status HTTP
edit() {
  curl -s -o /dev/null -b a.jar -w '%{http_code}\n' -X POST "$WEB/organizer/events/$1" \
    --data-urlencode "name=$2" --data-urlencode "startsAt=$(date -d '+30 days' +%Y-%m-%dT20:00)" \
    --data-urlencode "venue=Local" --data-urlencode "capacity=$3" --data-urlencode "price=$4"
}
```

> **Check-in (CX-F06-F08).** F06 é implementada em paralelo (W4) e não existe nesta branch. O painel conta check-ins pela coluna `tickets.checked_in_at` (existe desde a F01), a mesma que a F06 grava no **Entrada liberada**. Em C3 o check-in é simulado com `UPDATE tickets SET checked_in_at = now()` (preparação de cenário); o check-in real pela página de gestão (passo 10 do brief) é exercitado no Fluxo do avaliador final, contra a `main` integrada.

| Item | Verificação | Esperado |
|---|---|---|
| C1 | Passos 2–9 do fluxo em E1: `E1=$(mkevent E1 2 100,00)`; `buy $E1 4000000000000001` (T1) e aguarda `confirmed` (`ticket`); `buy $E1 4000000000000004` (T2) e aguarda `declined` (~40 s); `buy $E1 4000000000000001` (T3) e aguarda `confirmed`; `edit $E1 E1 1 100,00`; `edit $E1 E1 3 150,00`; `buy $E1 4000000000000001` (T4) e aguarda `confirmed`; `panel $E1`. Automatizado: `npm run test:docker -- test/integration/dashboard.test.ts -t "C1"` e `npm run test:docker -- test/e2e/dashboard.flow.test.ts -t "C1"` | edições: 422 e 302; Confirmados 3, Pendentes 0, Check-ins 0, Vagas 0, Receita R$ 350,00, Estornados 0 |
| C2 | `E=$(mkevent Novo 4 30,00)`; `buy $E 4000000000000003`; logo depois `panel $E`; teste `-t "C2"` | Pendentes 1; Vagas 3 (= lotação − 1); Receita R$ 0,00 |
| C3 | Após C1: `docker compose exec -T db psql -U catraca -d catraca -c "UPDATE tickets SET checked_in_at = now() WHERE id = '$T1'"` (simula o Entrada liberada de C1); `panel $E1`; teste `-t "C3"` | Check-ins 1; Confirmados 3 (inalterado); demais iguais a C1 |
| C4 | `E3=$(mkevent E3 5 50,00)`; `buy $E3 4000000000000003` (T5); `buy $E3 4000000000000001` (T6), aguarda T6 `confirmed`; antes de 30 s de T5: `curl -s -o /dev/null -w '%{http_code}\n' -b a.jar -X POST $WEB/organizer/events/$E3/cancel`; após 45 s de T5: `ticket $T5`, `ticket $T6`, `panel $E3`; testes `-t "C4"` (integração e E2E) | 302; T5 `cancelled`, T6 `refunded`; Confirmados 0, Pendentes 0, Check-ins 0, Vagas 0, Receita R$ 0,00, Estornados 1 |
| C5 | `E4=$(mkevent E4 5 10,00)`; rajada do passo 15 do brief em `$E4`; em até 10 s `panel $E4`; teste E2E `-t "C5"` (E4 e E5) | 5×202 e 25×409; Confirmados 5, Vagas 0, Receita R$ 50,00 |
| C6 | `npm run test:docker -- test/integration/dashboard.test.ts` | verde: métricas corretas com mistura de canais (vitrine e API) e todos os status; Vagas igual a `availableSeats` da API |
| C7 | `curl -s -o /dev/null -w '%{http_code}\n' -b b.jar $WEB/organizer/events/$E1`; `curl -s -b b.jar $WEB/organizer/events/$E1 \| grep -c data-metric`; teste `-t "C7"` (inclui participante e visitante) | 404; 0 ocorrências de `data-metric` |

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
