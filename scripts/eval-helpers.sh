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
