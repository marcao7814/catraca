# F03 — Vitrine e área do participante — Contrato

> Fonte: [docs/prd.md](../../docs/prd.md) · Decisões: [docs/adr.md](../../docs/adr.md) · Desenho: [docs/tdr.md](../../docs/tdr.md)

Convenções, variáveis e helpers: [docs/specs.md](../../docs/specs.md#convenções-dos-contratos) e [scripts/eval-helpers.sh](../../scripts/eval-helpers.sh).

**PRE**: `npm run up` (atrasos reais do gateway); `source scripts/eval-helpers.sh`; `login org.a@catraca.dev catraca123 a.jar`. Os testes automatizados citados rodam com `npm run test:docker -- test/integration/storefront.test.ts -t "<Cn>"` (Postgres efêmero, atrasos × 0,01).

Criar um evento em rascunho (lotação 1, preço 100,00) e guardar o id (usado para E1 e E2):

```bash
mkev() { curl -s -o /dev/null -w '%{redirect_url}' -b a.jar -X POST "$WEB/organizer/events/new" \
  --data-urlencode "name=$1" --data-urlencode "startsAt=$(date -d '+30 days' +%Y-%m-%dT20:00)" \
  --data-urlencode "venue=Teatro" --data-urlencode "capacity=1" --data-urlencode "price=100,00" | sed 's#.*/##'; }
E1=$(mkev "E1 $(date +%s)"); echo $E1
```

| Item | Verificação | Esperado |
|---|---|---|
| C1 | Com E1 em rascunho: `curl -s $WEB/ \| grep -c "$E1"`; `curl -s -o /dev/null -w '%{http_code}' $WEB/events/$E1` | `0` (E1 fora da vitrine); `404` |
| C2 | `curl -s -o /dev/null -b a.jar -X POST $WEB/organizer/events/$E1/publish`; `curl -s $WEB/ \| grep -c "$E1"` | `≥ 1`: vitrine lista E1 com data, local, preço e vagas (`1`) |
| C3 | `N=novo+$(date +%s)@ex.com; curl -s -o /dev/null -c n.jar -w '%{http_code} %{redirect_url}\n' -X POST $WEB/signup --data-urlencode name=Nova --data-urlencode "email=$N" --data-urlencode password=segredo1`; depois `curl -s -b n.jar -w ' %{http_code}' $WEB/me/tickets` | `302 …/me/tickets`; página "Meus ingressos" com "Você ainda não tem ingressos." e `200`. Teste: `-t "C3"` (campo `role=organizer` no corpo é ignorado: conta criada como participante, e-mail em minúsculas) |
| C4 | Repetir o POST `/signup` com o mesmo `$N`, sem `-o /dev/null` | `422` e corpo contém `e-mail já cadastrado`. Teste: `-t "C4"` (também com o e-mail em maiúsculas) |
| C5 | `curl -s -o /dev/null -b n.jar -c n.jar -X POST $WEB/logout`; `curl -s -o /dev/null -b n.jar -w '%{http_code} %{redirect_url}' $WEB/me/tickets`; depois `login "$N" segredo1 n.jar` | `302 …/login?next=%2Fme%2Ftickets`; novo login `302` |
| C6 | Visitante: `curl -s $WEB/events/$E1` | sem `name="cardNumber"`; contém `Entre para comprar` com link `/login?next=…`. Teste: `-t "C6"` (POST de compra sem sessão → 302 `/login`) |
| C7 | `curl -s -o /dev/null -b n.jar -w '%{http_code} %{redirect_url}\n' -X POST $WEB/events/$E1/purchase --data-urlencode "cardNumber=4000 0000 0000 0001"`; `curl -s -b n.jar $WEB/me/tickets` imediatamente e após 5 s | `302 …/me/tickets`; 1ª: E1, `pendente`, código de 8 caracteres em `<code>`; 2ª: `confirmado`, mesmo código. Teste: `-t "C7"` (inclui rótulos `recusado` e `estornado`) |
| C8 | `E2=$(mkev "E2 $(date +%s)")`, publicar E2 como em C2; esgotar fora da vitrine com `cli_buy $E2 4000000000000004` (motor de vendas, canal `partner`; substitui o `buy` da API de parceiros, que não existe nesta branch); `curl -s -b n.jar $WEB/events/$E2` | `cli_buy` imprime `{"ticketId":…,"status":"pending"}`; página contém `Ingressos esgotados` e não contém `name="cardNumber"`. Teste: `-t "C8"` (esgotado via `purchaseTicket({channel:'partner'})`; a vitrine também mostra o texto; nova compra → 409 com o texto) |
| C9 | `npm run test:docker -- test/integration/storefront.test.ts -t "C9"` | 5 rodadas de duas compras de vitrine simultâneas (`inject`) em lotação 1: uma `302`, outra `409` com `Ingressos esgotados` e sem formulário; 1 ingresso por evento; sem overbooking |
| C10 | `login participante@catraca.dev catraca123 p.jar`; `curl -s -b p.jar $WEB/me/tickets` | `200`; não contém o código nem o nome de E1 comprados por `n.jar`. Teste: `-t "C10"` |
| C11 | `login participante@catraca.dev catraca123 p.jar` (tela de login); `curl -s -o /dev/null -b p.jar -w '%{http_code}' $WEB/me/tickets`; idem `$WEB/organizer/events` | login `302 …/`; `200`; `403`. Teste: `-t "C11"`; organizador em `/me/tickets` e na compra → 403 (`-t "organizador não acessa"`) |

**Mapeamento**

| Critério | Itens |
|---|---|
| AC-F03-1 | C1, C2 |
| AC-F03-2 | C3, C4, C5 |
| AC-F03-3 | C6, C7 |
| AC-F03-4 | C8, C9 |
| AC-F03-5 | C7, C10 |
| CX-F01-F03 | C11 |
| CX-F02-F03 | C1, C2 |
| CX-F04-F03 | C7 |
| CX-F04-F03b | C8 |
