# F01 — Fundação e harness — Contrato

> Fonte: [docs/prd.md](../../docs/prd.md) · Decisões: [docs/adr.md](../../docs/adr.md) · Desenho: [docs/tdr.md](../../docs/tdr.md)

Convenções, variáveis e helpers: [docs/specs.md](../../docs/specs.md#convenções-dos-contratos) e [scripts/eval-helpers.sh](../../scripts/eval-helpers.sh).

**PRE**: clone limpo do commit avaliado; Docker em execução; porta 3000 livre (ou `CATRACA_PORT` definido e `WEB` ajustado).

| Item | Verificação | Esperado |
|---|---|---|
| C1 | `git clone <repo> /tmp/c && cd /tmp/c && npm run up && curl -s -o /dev/null -w '%{http_code}' $WEB/healthz` | `200`, sem passo manual |
| C2 | `npm run down && npm run up && curl -s $WEB/healthz` | sobe sem erro; logs do app mostram seed sem erro |
| C3 | `npm run down; curl -s -m 2 $WEB/healthz; echo $?; docker ps -a --filter label=com.docker.compose.project=catraca -q \| wc -l` | curl falha (≠0); `0` containers (o Postgres não publica porta no host) |
| C4 | `npm run gates; echo $?` | saída mostra lint, typecheck, vitest (≥1 teste), check-reports, check-state e `GATES: OK`; código `0`; nenhum container `db_test`/`gates` sobra |
| C5 | `npm run seed` duas vezes; `docker compose exec db psql -U catraca -tc "select count(*) from users where email like '%@catraca.dev'"` | `3` |
| C6 | `login org.a@catraca.dev catraca123 a.jar` e idem B e participante | 302 para área correta nos três |
| C7 | `grep -E 'GATEWAY_MODE' compose.yml` e ausência de variáveis de chave real; compra possível sem `.env` (verificado em F04/F05) | `simulated`; nenhuma chave exigida |
| C8 | `grep -nE 'npm run up\|npm run down\|npm run gates' AGENTS.md`; seção "Mapa dos artefatos"; `cat CLAUDE.md` | comandos presentes; CLAUDE.md referencia AGENTS.md |
| C9 | `curl -s -o /dev/null -w '%{http_code} %{redirect_url}' $WEB/organizer/events` | `302 …/login` |
| C10 | com cookie do participante: `curl -b p.jar -s -o /dev/null -w '%{http_code}' $WEB/organizer/events` | `403` |
| C11 | `node scripts/check-state.mjs` com `project-state.json` inicial | lista F01–F08; código 0 |

**Mapeamento**

| Critério | Itens |
|---|---|
| AC-F01-1 | C1 |
| AC-F01-2 | C2, C5 |
| AC-F01-3 | C3 |
| AC-F01-4 | C4 |
| AC-F01-5 | C5, C6 |
| AC-F01-6 | C7 |
| AC-F01-7 | C8, C11 |
| AC-F01-8 | C9, C10 |
