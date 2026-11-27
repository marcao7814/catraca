# Specs — Spec, Plano e Contrato por feature — Catraca MVP

> Fonte de verdade dos critérios: [prd.md](prd.md). Decisões: [adr.md](adr.md). Desenho: [tdr.md](tdr.md).
> No repositório, cada seção abaixo vira `features/Fxx-<nome>/spec.md`, `plan.md` e `contract.md`; os relatórios do avaliador ficam em `features/Fxx-<nome>/reports/`.

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

---

# F01 — Fundação e harness

## Spec

**Objetivo.** Ambiente reprodutível com um comando, esquema de banco completo, autenticação, papéis, seed idempotente e porta de entrada para agentes.

**Escopo.**
- `package.json` com scripts `up`, `down`, `gates`, `seed`, `reset`, `gates:inner`, `dev`, `test`.
- `Dockerfile` multi-stage (`dev` com devDependencies para gates; `prod` com `dist/`).
- `compose.yml` (`db`, `app`) e `compose.test.yml` (`db_test`, `gates`, profile `test`), projeto `catraca`.
- `scripts/entrypoint.sh`: aguarda DB → `node-pg-migrate up` → `node dist/seed/seed.js` → `node dist/server.js`.
- Migração `0001_init.sql` com todas as tabelas do [tdr.md §3](tdr.md) (as features seguintes podem adicionar migrações, nunca editar a 0001 após o merge).
- Módulo `auth`: `/login`, `/logout`, sessões, `currentUser`, `requireRole`, hashing bcryptjs.
- `lib/`: `ids.ts` (`newId('evt')`, `newTicketCode()`), `money.ts` (`parseBRL`, `formatBRL`), `dates.ts` (`toIsoOffset`, `parseLocalDateTime`), layout EJS com menu por papel.
- `/healthz`.
- Seed com as três contas do [tdr.md §8](tdr.md).
- `AGENTS.md`, `CLAUDE.md` (aponta para AGENTS.md), `project-state.json` com F01–F08 em `todo`, `docs/prompts/implementer.md`, `docs/prompts/evaluator.md`.
- `scripts/check-reports.mjs`, `scripts/check-state.mjs`, esqueleto de `scripts/e2e-flow.mjs`.
- Stub de rota `/organizer/events` protegida (lista vazia) para validar papéis; F02 a substitui.

**Decisões técnicas.** ADR-001, 002, 003, 008, 011, 012. Lint com regra de fronteira entre `src/modules/*` conforme grafo do PRD.

**Fora do escopo da feature.** Telas de evento, compra, vitrine.

## Plano

1. Inicializar projeto TS (Fastify, EJS, pg, node-pg-migrate, bcryptjs, pino, vitest, eslint).
2. Escrever `Dockerfile`, `compose.yml`, `compose.test.yml`, `entrypoint.sh`; scripts npm.
3. Migração `0001_init.sql`.
4. `db/pool.ts` e helper `withTx(fn)`.
5. `lib/` + testes unitários.
6. Módulo `auth` + layout + `/healthz` + stub `/organizer/events`.
7. Seed idempotente + teste (rodar 2×).
8. `check-reports.mjs`, `check-state.mjs`, `gates:inner`.
9. AGENTS.md, CLAUDE.md, prompts, `project-state.json`, README inicial (como rodar, endereços, credenciais).
10. Validar: clone limpo → `up` → `down` → `up` → `gates`.

## Contrato

**PRE**: clone limpo do commit avaliado; Docker em execução; portas 3000 e 5432 livres.

| Item | Verificação | Esperado |
|---|---|---|
| C1 | `git clone <repo> /tmp/c && cd /tmp/c && npm run up && curl -s -o /dev/null -w '%{http_code}' $WEB/healthz` | `200`, sem passo manual |
| C2 | `npm run down && npm run up && curl -s $WEB/healthz` | sobe sem erro; logs do app mostram seed sem erro |
| C3 | `npm run down; curl -s -m 2 $WEB/healthz; echo $?; nc -z localhost 5432; echo $?; docker ps --filter label=com.docker.compose.project=catraca -q \| wc -l` | curl e nc falham (≠0); `0` containers |
| C4 | `npm run gates; echo $?` | saída mostra lint, tsc, vitest (≥1 teste), e2e; código `0` |
| C5 | `docker compose exec app npm run seed` duas vezes; `docker compose exec db psql -U catraca -tc "select count(*) from users where email like '%@catraca.dev'"` | `3` |
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

---

# F02 — Gestão de eventos

## Spec

**Objetivo.** Organizador cria, lista, edita e publica os próprios eventos; cada evento tem página de gestão com URL própria.

**Regras.** R01, R02, R03, R04, R13.

**Modelo.** Tabela `events` (F01). Estados: `draft` → `published` (F02) → `cancelled` (F07).

**Interfaces providas.**
```ts
// src/modules/events/events.service.ts
createEvent(organizerId, input: EventInput): Promise<Event>           // status draft
updateEvent(organizerId, eventId, input: EventInput): Promise<Event>  // R01, R03
publishEvent(organizerId, eventId): Promise<Event>                    // draft → published
loadOwnedEvent(organizerId, eventId): Promise<Event | null>           // R13
listOrganizerEvents(organizerId): Promise<Event[]>
listSellableEvents(): Promise<Event[]>                                // status='published'
getEvent(eventId): Promise<Event | null>
// src/modules/events/management-slots.ts
managementSlots.register(name: 'checkin'|'cancel'|'dashboard', render: (ctx) => Promise<string>)
```

**Validação (`EventInput`).**
- `name`, `venue`: 1–200 caracteres após `trim`.
- `startsAt`: `datetime-local` interpretado em `America/Sao_Paulo`; deve ser `> now()` ao criar e ao editar.
- `capacity`: inteiro ≥ 1 (rejeita `1.5`, `0`, vazio).
- `price`: reais (`100`, `100,00`, `100.00`) → centavos > 0.
- Erros reexibem o formulário com mensagem e status 422.

**R03.** Edição em transação com `FOR UPDATE` no evento; rejeita `capacity < count(pending+confirmed)` com "A lotação não pode ser menor que as vagas ocupadas (N)". O preço novo só altera `events.price_cents`; ingressos guardam `price_paid_cents`.

**R13.** `/organizer/*` exige papel `organizer`; `/organizer/events/:id*` usa `loadOwnedEvent` → 404 genérico "Evento não encontrado" (mesma página de ID inexistente; sem nome, números ou ingressos).

**Página de gestão** `/organizer/events/:id`: dados do evento, formulário de edição (se não cancelado), botão Publicar (se `draft`), e os slots registrados por F06/F07/F08 (vazios até lá).

**Publicação.** Só `draft` pode ser publicado; publicar evento com data no passado é rejeitado.

## Plano

1. `events.repo.ts` (SQL) e `events.service.ts` com validação.
2. Rotas e views: lista, novo, gestão, editar, publicar.
3. `management-slots.ts` e render da página de gestão com slots.
4. Guarda `loadOwnedEvent` aplicada a todas as rotas `:id`.
5. Testes: validação R01, estados R02, R03 com tickets inseridos direto na tabela, R13 (B → 404), `listSellableEvents`.
6. Atualizar E2E (passos 2–4 do fluxo).

## Contrato

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

---

# F04 — Motor de vendas e gateway

## Spec

**Objetivo.** Núcleo de vendas compartilhado pelos dois canais: compra com garantia de lotação, gateway simulado, aplicação assíncrona do resultado.

**Regras.** R05, R06, R07, R08, R09 (código), base de R11.

**Interfaces providas.**
```ts
// src/modules/sales/index.ts
type PurchaseError = 'invalid_request' | 'event_not_available' | 'sold_out';
purchaseTicket(input: {
  eventId: string; channel: 'storefront' | 'partner';
  buyerUserId?: string; buyerEmail: string; cardNumber: string;
}): Promise<{ ok: true; ticket: Ticket } | { ok: false; error: PurchaseError }>;
getSeatStats(eventId): Promise<{ capacity; occupied; available }>;   // available=0 se cancelled
getTicket(ticketId): Promise<Ticket | null>;
findTicketByCode(eventId, code): Promise<Ticket | null>;
listTicketsByUser(userId): Promise<(Ticket & { eventName; startsAt })[]>;
applyGatewayResult(ticketId, outcome: 'approved' | 'declined'): Promise<boolean>; // false = no-op
startGatewayWorker(): () => void;  // retorna stop
interface PaymentGateway { authorize(card: string): { outcome; delayMs } }
```

**Algoritmo da compra.** Conforme [tdr.md §5.1](tdr.md) e ADR-004: valida → `BEGIN` → `SELECT … FOR UPDATE` no evento → status → contagem → `authorize` → `INSERT ticket` + `INSERT payment_attempt` → `COMMIT`. Ordem dos erros: `invalid_request`, `event_not_available`, `sold_out`.

**Validação.** `buyerEmail` regex simples `^[^\s@]+@[^\s@]+\.[^\s@]+$`; `cardNumber` `^\d{16}$` (espaços removidos na vitrine, não na API).

**Gateway simulado.** Tabela do [tdr.md §6](tdr.md); `delayMs × GATEWAY_DELAY_SCALE`.

**Worker.** [tdr.md §5.2](tdr.md); iniciado em `server.ts`; parado em `onClose`. Retoma attempts pendentes após reinício.

**Transições.** ADR-006: apenas `pending→confirmed|declined` aqui, condicionais.

**Código.** ADR-012, 8 caracteres, `UNIQUE`, retry em colisão.

## Plano

1. `gateway/simulated.ts` + testes da tabela de finais e faixas de atraso.
2. `sales.repo.ts`: inserts, contagem, transições condicionais.
3. `purchaseTicket` com lock; `getSeatStats`; consultas.
4. Worker + integração no ciclo de vida do app.
5. F02 passa a usar `getSeatStats` na validação de lotação (sem mudança de comportamento).
6. Testes de integração: concorrência 30×5 repetida em 20 eventos; liberação na recusa; no-op de `applyGatewayResult`; preço vigente; retomada após reinício (worker parado, attempt vencido, worker iniciado).
7. Teste de invariante global no `afterAll`.

## Contrato

**PRE**: `npm run up` (atrasos reais) para C5–C7, C11; `npm run gates` para testes automatizados.

| Item | Verificação | Esperado |
|---|---|---|
| C1 | `vitest run test/integration/sales.purchase.test.ts -t "cria pendente"` | ticket `pending`, código `^[A-Z2-9]{8}$`, retorno < 500 ms |
| C2 | `-t "pendente ocupa vaga"`: lotação 2, uma compra 0003 → `getSeatStats.available` | `1`; após cancelar evento (update direto) → `0` |
| C3 | `-t "sold_out"`: lotação 1, duas compras sequenciais | 2ª retorna `sold_out`; 1 ticket no banco |
| C4 | `vitest run test/integration/sales.concurrency.test.ts` | 20 rodadas × (30 concorrentes, lotação 5) → 5 ok / 25 sold_out em todas; invariante OK |
| C5 | Ambiente padrão: compra 0001 via script `scripts/eval/gateway-timing.mjs` medindo tempo até `confirmed` | entre 2 e 5 s |
| C6 | Mesmo script para 0002 e 4000000000000009 | `declined` entre 2 e 5 s |
| C7 | Mesmo script para 0003 e 0004 | `confirmed`/`declined` entre 30 e 40 s |
| C8 | `-t "recusa libera vaga"`: lotação 1, compra 0002 (escala 0.01), aguarda → nova compra | 2ª compra ok |
| C9 | `-t "invalid_request"`: cartão `123`, 17 dígitos, e-mail `x@` | `invalid_request`; 0 tickets |
| C10 | `-t "event_not_available"`: id inexistente, rascunho, cancelado | `event_not_available` nos três |
| C11 | `-t "preço vigente"`: compra a 100, preço→150, compra | `price_paid_cents` 10000 e 15000 |
| C12 | `-t "no-op"`: ticket `refunded` → `applyGatewayResult(approved)` | retorna `false`; status `refunded` |
| C13 | `-t "draft → publicado → preço"` (CX) | draft→`event_not_available`; publicado→ok com preço vigente; após mudança de preço, compra seguinte com preço novo e anterior inalterada |
| C14 | `-t "lotação × pendentes"` (CX): lotação 2, duas compras (0001 lenta simulada e 0002), editar lotação para 1 via `updateEvent` → rejeitado; após recusa aplicada → aceito | conforme |
| C15 | `-t "retomada após reinício"`; e manual: compra 0003, `npm run down && npm run up`, aguardar 40 s, `ticket $T` | `confirmed` |

**Mapeamento**

| Critério | Itens |
|---|---|
| AC-F04-1 | C1 |
| AC-F04-2 | C2 |
| AC-F04-3 | C3 |
| AC-F04-4 | C4 |
| AC-F04-5 | C5, C6, C7 |
| AC-F04-6 | C8 |
| AC-F04-7 | C9 |
| AC-F04-8 | C10 |
| AC-F04-9 | C11 |
| AC-F04-10 | C12 |
| CX-F02-F04 | C13 |
| CX-F02-F04b | C14 |
| CX-F01-F04 | C15 |

---

# F03 — Vitrine e área do participante

## Spec

**Objetivo.** Visitante vê a vitrine; participante se cadastra, entra, sai, compra e vê seus ingressos.

**Regras.** R02, R06, R07, R09.

**Rotas.** [tdr.md §4.1](tdr.md): `/`, `/events/:id`, `/events/:id/purchase`, `/signup`, `/me/tickets`.

**Comportamento.**
- `/` usa `listSellableEvents()` + `getSeatStats()`; mostra nome, data, local, preço e vagas.
- `/events/:id` para evento não à venda → 404. Se `available = 0` → texto exato **Ingressos esgotados** no lugar do formulário. Senão, formulário de cartão (visitante vê "Entre para comprar" com link para login).
- POST de compra chama `purchaseTicket({channel:'storefront', buyerUserId, buyerEmail: user.email, cardNumber})`:
  - ok → 302 `/me/tickets`;
  - `sold_out` → página do evento com **Ingressos esgotados** (status 409);
  - `invalid_request` → formulário com "Número de cartão inválido (16 dígitos)" (422);
  - `event_not_available` → 404.
- `/me/tickets`: tabela evento, data, status (rótulo PT: pendente, confirmado, recusado, cancelado, estornado), código. Só ingressos do usuário logado.
- Cadastro: nome, e-mail (único, minúsculas), senha (≥ 6); cria `participant` e já loga.
- Organizador que acessa `/me/tickets` → 403.

## Plano

1. Rotas e views da vitrine e detalhe.
2. Cadastro + reuso do login/logout de F01.
3. Compra pela vitrine e tratamento de erros.
4. Meus ingressos com rótulos.
5. Testes HTTP (`inject`) + passos 2, 4, 5, 7 no E2E.

## Contrato

**PRE**: `npm run up`; A logado em `a.jar`.

| Item | Verificação | Esperado |
|---|---|---|
| C1 | A cria E1 (rascunho); `curl -s $WEB/` | sem "E1" |
| C2 | A publica E1; `curl -s $WEB/` | contém "E1" |
| C3 | POST `/signup` (nome, `novo+<ts>@ex.com`, senha) → `curl -b n.jar $WEB/me/tickets` | 302 após cadastro; 200 com lista vazia |
| C4 | POST `/signup` com o mesmo e-mail | 422 "e-mail já cadastrado" |
| C5 | POST `/logout` → `/me/tickets` | 302 `/login` |
| C6 | Visitante: GET `/events/$E1` | sem formulário de cartão; link para login |
| C7 | `n.jar`: POST `/events/$E1/purchase` cartão 4000000000000001; GET `/me/tickets` imediatamente e após 5 s | 1ª: E1, "pendente", código de 8 chars; 2ª: "confirmado", mesmo código |
| C8 | Esgotar E1 via API (`buy $E1 4000000000000004`); GET `/events/$E1` com `n.jar` | contém "Ingressos esgotados" e não contém o formulário |
| C9 | Teste `inject`: duas compras de vitrine em evento de lotação 1 quase simultâneas | perdedora recebe página com "Ingressos esgotados" |
| C10 | `curl -b p.jar $WEB/me/tickets` (participante da seed, outra conta) | não lista ingressos de `n.jar` |
| C11 | Login do participante da seed pela tela; GET `/organizer/events` | login ok; 403 |

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

---

# F05 — API de parceiros

## Spec

**Objetivo.** Implementar exatamente o contrato fixo do brief ([tdr.md §4.2](tdr.md)).

**Regras.** R02, R05, R06, R07.

**Detalhes.**
- Plugin Fastify com prefixo `/api/partner`; hook `onRequest` valida `X-Api-Key` (timing-safe) → 401 `{"error":"unauthorized"}` antes de qualquer parsing, inclusive em rota inexistente sob o prefixo.
- `GET /events`: `listSellableEvents()` mapeado para `{id, name, startsAt, priceCents, availableSeats}`; `startsAt` com offset `-03:00`; ordenado por `startsAt`.
- `POST /events/:eventId/purchases`: parser JSON tolerante (JSON inválido → 422, não 400); delega a `purchaseTicket({channel:'partner', buyerEmail, cardNumber})`; mapeia `invalid_request→422`, `event_not_available→404`, `sold_out→409`; sucesso 202 `{ticketId, code, status:"pending"}`.
- `GET /tickets/:ticketId`: `{ticketId, code, eventId, status, checkedIn: checked_in_at != null}`; ausente → 404 `ticket_not_found`.
- Respostas sempre `application/json`; nenhum campo extra.

## Plano

1. Plugin + hook de chave + error handler JSON.
2. Três rotas e mapeamento de erros.
3. Testes `inject` de contrato (corpos exatos com `toStrictEqual`).
4. Teste HTTP real de rajada (30 × `fetch` paralelos, lotação 5) repetido.
5. Passos 2, 4, 6, 8, 15, 16 no E2E.

## Contrato

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

---

# F07 — Cancelamento de evento

## Spec

**Objetivo.** Cancelar evento publicado de forma irreversível, com transição imediata dos ingressos e imunidade a respostas tardias do gateway.

**Regra.** R11.

**Interface.**
```ts
cancelEvent(organizerId, eventId): Promise<{ refunded: number; cancelled: number }>
// erros: not_found (404), not_cancellable (status ≠ published)
```

**Comportamento.** Transação única ([tdr.md §5.3](tdr.md), ADR-007). Após cancelar:
- evento some de `listSellableEvents` (já filtra `published`); compras → `event_not_available`;
- `updateEvent` e `publishEvent` rejeitam `cancelled` (F07 adiciona a checagem em F02, se ainda não existir) com "Evento cancelado não pode ser editado";
- página de gestão mostra "Evento cancelado" e não renderiza formulário de edição nem botões de publicar/cancelar;
- slot `cancel` na página de gestão: botão "Cancelar evento" com confirmação (`onsubmit confirm()`), apenas para `published`.

**Corrida com o gateway.** Garantida por ADR-006 (update condicional) + lock do evento no worker.

## Plano

1. `cancellation.service.ts` + rota POST + slot na página de gestão.
2. Bloqueios de edição/publicação de `cancelled` em F02.
3. Testes: transições, irreversibilidade, rascunho não cancelável, posse (B → 404).
4. Teste de corrida cancelamento × worker repetido 50×.
5. Passos 12–14 no E2E.

## Contrato

**PRE**: `npm run up` (atrasos reais); A em `a.jar`, B em `b.jar`.

| Item | Verificação | Esperado |
|---|---|---|
| C1 | A cria/publica E3 (lotação 5, R$50); `buy $E3 4000000000000003` (T5); `buy $E3 4000000000000001` (T6); aguarda T6 `confirmed`; antes de 30 s de T5, POST `/organizer/events/$E3/cancel` | 302; página mostra "Evento cancelado" |
| C2 | Imediatamente e em até 10 s: `ticket $T6`, `ticket $T5` | `refunded` e `cancelled` |
| C3 | 45 s após compra de T5: `ticket $T5`; `vitest -t "corrida cancelamento x gateway"` (50×) | `cancelled`; teste verde |
| C4 | `curl -s $WEB/` e listagem da API | E3 ausente nas duas |
| C5 | `buy $E3 4000000000000001` | 404 `event_not_available` |
| C6 | GET página de gestão de E3; POST de edição e POST `/publish` em E3 | sem formulário de edição; POSTs rejeitados (422/409), dados inalterados |
| C7 | POST `/cancel` de novo em E3 | rejeitado; estado igual |
| C8 | A cria rascunho E9; POST `/organizer/events/$E9/cancel` | rejeitado; E9 continua rascunho |
| C9 | B: POST `/organizer/events/$E3/cancel` em evento publicado de A | 404; evento de A intacto |

**Mapeamento**

| Critério | Itens |
|---|---|
| AC-F07-1 | C1, C7, C9 |
| AC-F07-2 | C2 |
| AC-F07-3 | C3 |
| AC-F07-4 | C6 |
| AC-F07-5 | C8 |
| CX-F02-F07 | C4, C5 |
| CX-F04-F07 | C1, C2, C3 |

---

# F06 — Check-in

## Spec

**Objetivo.** Check-in por código na página de gestão, com a primeira situação verdadeira de R10 definindo a mensagem.

**Regra.** R10.

**Interface.**
```ts
type CheckinResult =
  | 'Ingresso inválido para este evento' | 'Evento cancelado'
  | 'Ingresso não confirmado' | 'Ingresso já utilizado' | 'Entrada liberada';
checkIn(organizerId, eventId, rawCode): Promise<CheckinResult>
```

**Algoritmo.** [tdr.md §5.4](tdr.md). Código normalizado (`trim`, maiúsculas). Busca sempre filtrada por `event_id` (código de outro evento = inexistente). Marcação atômica condicional; em corrida, reavalia.

**UI.** Slot `checkin` na página de gestão: campo "Código do ingresso" + botão; após POST, a página de gestão é renderizada com a mensagem exata em `<p id="checkin-result">`. Em evento cancelado, o slot mostra **Evento cancelado** no lugar do campo; o endpoint POST continua aplicando a lista.

**Acesso.** Rota sob `loadOwnedEvent` → 404 para outro organizador.

## Plano

1. `checkin.service.ts` + testes de ordem (casos com duas condições verdadeiras, ex.: evento cancelado + ingresso de outro evento → inválido; cancelado + ingresso pendente → Evento cancelado).
2. Rota + slot.
3. Teste de concorrência (2 check-ins simultâneos).
4. Passos 10, 11 (C3), 14 (C6) no E2E.

## Contrato

**PRE**: `npm run up`; E1 de A com C1 (confirmado, vitrine), C2 (pendente/recusado, API); E2 de B com C3; E3 cancelado com C6 (refunded).

| Item | Verificação | Esperado |
|---|---|---|
| C1 | POST check-in E1 `ZZZZZZZZ` | `Ingresso inválido para este evento` |
| C2 | POST check-in E1 com C3 (de E2) | `Ingresso inválido para este evento` |
| C3 | POST check-in E3 (cancelado) com C6; GET gestão E3 | `Evento cancelado` (POST) e mensagem no lugar do campo (GET) |
| C4 | POST check-in E1 com C2 (pendente ou recusado) | `Ingresso não confirmado` |
| C5 | POST check-in E1 com C1 | `Entrada liberada`; `ticket` de C1 na API → `checkedIn: true` |
| C6 | POST check-in E1 com C1 de novo | `Ingresso já utilizado` |
| C7 | POST com `  c1-em-minúsculas  ` (código com espaços/minúsculas) de um confirmado novo | `Entrada liberada` |
| C8 | `vitest -t "check-in concorrente"` | exatamente 1 `Entrada liberada` e 1 `Ingresso já utilizado` |
| C9 | `vitest run test/unit/checkin.order.test.ts` | ordem de R10 respeitada nos casos com múltiplas condições |
| C10 | B: POST check-in em E1 com C1 | 404; nenhum dado de E1 |
| C11 | Ingresso comprado via API e confirmado em E1 (T3) | `Entrada liberada` |

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

---

# F08 — Painel do evento

## Spec

**Objetivo.** Seis indicadores na página de gestão, consistentes entre si e com o estado dos ingressos.

**Regra.** R12 (e R05, R03).

**Interface.**
```ts
getDashboard(eventId): Promise<{
  confirmed: number; pending: number; checkins: number;
  available: number; revenueCents: number; refunded: number;
}>
```

**Cálculo.** Uma consulta agregada ([tdr.md §5.6](tdr.md)); `available` = 0 se cancelado, senão `capacity − occupied`. Canal não importa (vitrine e API somam igual).

**UI.** Slot `dashboard`: `<dl id="dashboard">` com rótulos exatos **Confirmados**, **Pendentes**, **Check-ins**, **Vagas disponíveis**, **Receita** (`R$ 350,00`), **Estornados**; cada valor com `data-metric="confirmed|pending|checkins|available|revenue|refunded"` para facilitar evidência por `grep`.

**Acesso.** Só renderizado após `loadOwnedEvent` (B não vê números).

## Plano

1. `dashboard.service.ts` + testes de cada métrica com estados mistos.
2. Slot + view.
3. Passos 9, 10, 11, 14, 15 (painel) no E2E.

## Contrato

**PRE**: `npm run up`; A em `a.jar`, B em `b.jar`; helper `panel <eventId>` = `curl -b a.jar $WEB/organizer/events/<id> | grep data-metric`.

| Item | Verificação | Esperado |
|---|---|---|
| C1 | Passos 2–9 do fluxo em E1 (2 confirmados a R$100, preço→R$150, lotação→3, 1 confirmado a R$150, 1 recusado); `panel $E1` | Confirmados 3, Pendentes 0, Check-ins 0, Vagas 0, Receita R$ 350,00, Estornados 0 |
| C2 | Com compra 0003 recém-feita em evento novo; `panel` | Pendentes 1; Vagas = lotação − 1 |
| C3 | Após check-in de C1 em E1; `panel $E1` | Check-ins 1; Confirmados 3 (inalterado) |
| C4 | E3 cancelado (1 confirmado→refunded, 1 pendente→cancelled); `panel $E3` | Confirmados 0, Pendentes 0, Check-ins 0, Vagas 0, Receita R$ 0,00, Estornados 1 |
| C5 | E4 após rajada (5 confirmados a R$10) em até 10 s | Confirmados 5, Vagas 0, Receita R$ 50,00 |
| C6 | `vitest run test/integration/dashboard.test.ts` | métricas corretas com mistura de canais e status |
| C7 | `curl -b b.jar $WEB/organizer/events/$E1` | 404; nenhum `data-metric` no corpo |

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
