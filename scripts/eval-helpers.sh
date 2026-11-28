#!/usr/bin/env bash
# Helpers para o avaliador exercitar contratos. Uso: source scripts/eval-helpers.sh
# Requer: curl. Variáveis: WEB, API, KEY (com padrões abaixo).
export WEB="${WEB:-http://localhost:3000}"
export API="${API:-http://localhost:3000}"
export KEY="${KEY:-catraca-partner-dev-key}"

# login <email> <senha> <cookie-jar>  -> imprime status e Location
login() {
  curl -s -o /dev/null -c "$3" -w '%{http_code} %{redirect_url}\n' \
    -X POST "$WEB/login" --data-urlencode "email=$1" --data-urlencode "password=$2"
}

# buy <eventId> <cartão> [email]  -> corpo + status HTTP
buy() {
  curl -s -w ' %{http_code}\n' -X POST "$API/api/partner/events/$1/purchases" \
    -H "X-Api-Key: $KEY" -H 'Content-Type: application/json' \
    -d "{\"buyerEmail\":\"${3:-eval@example.com}\",\"cardNumber\":\"$2\"}"
}

# ticket <ticketId>  -> corpo + status HTTP
ticket() {
  curl -s -w ' %{http_code}\n' -H "X-Api-Key: $KEY" "$API/api/partner/tickets/$1"
}

# events  -> listagem da API de parceiros
events() {
  curl -s -w ' %{http_code}\n' -H "X-Api-Key: $KEY" "$API/api/partner/events"
}

# Compra/consulta direto no motor de vendas (F04), sem passar pela API de parceiros.
# Útil em branches onde a F05 ainda não existe. Requer o app no ar (npm run up).
# cli_buy <eventId> <cartão> [email]   |   cli_ticket <ticketId>
cli_buy() {
  docker compose exec -T app node dist/tools/sales-cli.js buy "$@"
}
cli_ticket() {
  docker compose exec -T app node dist/tools/sales-cli.js ticket "$@"
}

# mkevent <cookie-jar> <nome> <lotação> <preço> [publish] [dias-a-frente]
# Cria um evento pela área do organizador (cookie de organizador) e imprime o id.
# Com "publish" no 5º argumento, publica em seguida. Data: hoje + N dias (padrão 30), 21:00.
mkevent() {
  local jar="$1" name="$2" cap="$3" price="$4" pub="${5:-}" days="${6:-30}" when loc id
  when=$(node -e "const d=new Date(Date.now()+${days}*864e5-3*36e5);console.log(d.toISOString().slice(0,10)+'T21:00')")
  loc=$(curl -s -o /dev/null -w '%{redirect_url}' -b "$jar" -X POST "$WEB/organizer/events/new" \
    --data-urlencode "name=$name" --data-urlencode "startsAt=$when" --data-urlencode "venue=Local de teste" \
    --data-urlencode "capacity=$cap" --data-urlencode "price=$price")
  id="${loc##*/}"
  if [ "$pub" = "publish" ]; then
    curl -s -o /dev/null -b "$jar" -X POST "$WEB/organizer/events/$id/publish"
  fi
  echo "$id"
}
