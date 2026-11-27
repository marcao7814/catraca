# ADR — Registro de Decisões de Arquitetura — Catraca MVP

> Cada decisão segue o formato: Contexto → Decisão → Alternativas consideradas → Consequências.
> Relacionados: [prd.md](prd.md), [tdr.md](tdr.md), [specs.md](specs.md).

| ADR | Título | Status | Features afetadas |
|---|---|---|---|
| ADR-001 | Stack: Node.js + TypeScript + Fastify, HTML renderizado no servidor | Aceita | todas |
| ADR-002 | PostgreSQL como único armazenamento, tudo em Docker Compose | Aceita | F01, todas |
| ADR-003 | Um único serviço (monólito modular) servindo web e API de parceiros | Aceita | todas |
| ADR-004 | Lotação garantida por lock de linha do evento + contagem na mesma transação | Aceita | F04, F02 |
| ADR-005 | Gateway simulado com resultado agendado em tabela + worker de polling | Aceita | F04 |
| ADR-006 | Transições de status sempre condicionais ao status de origem | Aceita | F04, F07, F06 |
| ADR-007 | Cancelamento síncrono em uma transação | Aceita | F07 |
| ADR-008 | Autenticação por sessão em banco, cookie HttpOnly, e 404 para evento de outro organizador | Aceita | F01, F02, R13 |
| ADR-009 | Dinheiro em centavos inteiros; preço pago gravado no ingresso | Aceita | F02, F04, F08 |
| ADR-010 | Avaliação isolada: sessão separada, relatório imutável por avaliação | Aceita | processo |
| ADR-011 | Harness por scripts npm que delegam ao Docker Compose | Aceita | F01 |
| ADR-012 | IDs prefixados e códigos de ingresso aleatórios | Aceita | F02, F04 |

---

## ADR-001 — Stack: Node.js + TypeScript + Fastify, HTML renderizado no servidor

**Contexto.** A máquina do avaliador tem só Docker, Git e Node.js LTS. Nenhum critério avalia design. Cada feature será escrita por um agente diferente; quanto menos camadas, menos pontos de integração para quebrar.

**Decisão.**
- Runtime: Node.js 22 LTS, TypeScript estrito.
- HTTP: Fastify 5 (rotas, validação por JSON Schema, `inject()` para testes sem rede).
- UI: HTML renderizado no servidor com templates EJS (`@fastify/view`) e formulários `POST` simples. Sem SPA, sem build de front-end.
- Acesso a dados: `pg` (node-postgres) com SQL explícito em repositórios; migrações SQL versionadas executadas por `node-pg-migrate`.
- Testes: Vitest (unidade e integração contra Postgres real) + script E2E do Fluxo do avaliador em Node (`fetch`).
- Qualidade: ESLint + `tsc --noEmit`.

**Alternativas.**
- *Next.js*: mais peças (RSC, build, cache) e comportamento de cache que confunde verificação "recarregar a página".
- *NestJS*: estrutura pesada para 8 features pequenas.
- *Prisma*: dificulta `SELECT … FOR UPDATE` e updates condicionais com `RETURNING`, que são o centro de R07/R11.

**Consequências.** Controle total do SQL nas regiões críticas; a UI é feia, mas testável por HTTP (o avaliador e os testes leem HTML). Um único `package.json`.

---

## ADR-002 — PostgreSQL como único armazenamento, tudo em Docker Compose

**Contexto.** Precisamos de transações, lock de linha e persistência que sobreviva a `down`/`up`.

**Decisão.** PostgreSQL 16 em container; app em container próprio construído pelo `Dockerfile`. Volume nomeado `catraca_pgdata` para persistência. Sem Redis, sem fila externa: sessões e pagamentos agendados ficam no Postgres.

**Alternativas.** SQLite (lock de banco inteiro, fácil, mas comportamento sob concorrência diferente do que queremos provar); Redis para fila (mais um serviço para subir e derrubar).

**Consequências.** Dois containers apenas (`db`, `app`) + um container efêmero `gates`. O `down` derruba ambos; o volume permanece para provar a idempotência da seed.

---

## ADR-003 — Um único serviço (monólito modular)

**Contexto.** O brief fala em `$WEB` e `$API`; podem ser o mesmo endereço.

**Decisão.** Um processo Fastify em `http://localhost:3000` serve a web (`/`, `/login`, `/me/*`, `/organizer/*`) e a API (`/api/partner/*`). O worker do gateway roda no mesmo processo (intervalo de 500 ms). Código organizado por módulo de feature (`src/modules/<feature>`), com dependências só na direção do grafo do PRD.

`$WEB = $API = http://localhost:3000`.

**Alternativas.** Serviço de API separado + worker separado: mais isolamento, mais containers e mais portas para o `down` encerrar.

**Consequências.** Fronteiras de feature são de pasta, não de rede; o lint (`eslint-plugin-boundaries` / regra de import) impede imports contra o grafo (ex.: F04 importando F07).

---

## ADR-004 — Lotação garantida por lock de linha do evento + contagem na mesma transação

**Contexto.** R07: "as vagas ocupadas nunca passam da lotação, nem com compras simultâneas". A primeira tentativa vendeu 112 de 100: verificação e inserção estavam separadas (check-then-act).

**Decisão.** Toda operação que muda vagas ocupadas ou lotação serializa no evento:

```sql
BEGIN;
SELECT status, capacity, price_cents FROM events WHERE id = $1 FOR UPDATE;
-- se status <> 'published' → event_not_available
SELECT count(*) FROM tickets WHERE event_id = $1 AND status IN ('pending','confirmed');
-- se count >= capacity → sold_out
INSERT INTO tickets (...) VALUES (..., 'pending', price_cents_atual);
INSERT INTO payment_attempts (...);
COMMIT;
```

Operações que tomam o mesmo lock: compra (F04), edição de lotação (F02), cancelamento (F07), aplicação de resultado do gateway que libera vaga (F04, para manter ordem total por evento).

A verdade é derivada (contagem de tickets), não um contador denormalizado — elimina drift entre contador e linhas.

**Alternativas.**
- *Contador com `UPDATE events SET occupied = occupied + 1 WHERE occupied < capacity`*: também correto e mais rápido, mas exige manter o contador em todas as transições (recusa, cancelamento) — mais lugares para errar entre features.
- *Isolamento SERIALIZABLE + retry*: correto, mas exige laço de retry em todos os chamadores; 409 por falha de serialização seria confundido com `sold_out`.
- *Lock em memória (mutex no Node)*: quebra com mais de uma instância e não protege o banco.

**Prova.** (1) Teste de integração dispara 30 `purchaseTicket` concorrentes em 20 eventos novos de lotação 5 e afirma 5/25 em todos; (2) teste HTTP com 30 requisições paralelas no endpoint de parceiros; (3) consulta de invariante executada ao final da suíte: nenhum evento com `pending+confirmed > capacity`; (4) o passo 15 do Fluxo do avaliador está no script E2E e roda em `npm run gates`.

**Consequências.** Compras do mesmo evento são serializadas (dezenas de ms cada) — irrelevante para eventos pequenos. Pool de conexões dimensionado (≥ 20) para a rajada não esgotar conexões.

---

## ADR-005 — Gateway simulado com resultado agendado em tabela + worker de polling

**Contexto.** R06 exige responder sem esperar o gateway; o gateway leva 2–40 s. Resultado precisa sobreviver a reinício (NFR-5). Testes não podem esperar 40 s.

**Decisão.**
- Interface `PaymentGateway.authorize({ ticketId, cardNumber }) → { outcome, respondAt }`.
- `SimulatedGateway` decide o resultado pela tabela de finais do brief e sorteia o atraso no intervalo; grava em `payment_attempts(ticket_id, card_last4, outcome, respond_at, processed_at NULL)` na mesma transação da compra.
- Worker no processo do app, a cada 500 ms:
  ```sql
  SELECT * FROM payment_attempts
   WHERE processed_at IS NULL AND respond_at <= now()
   ORDER BY respond_at LIMIT 50
   FOR UPDATE SKIP LOCKED;
  ```
  Para cada um, chama `applyGatewayResult` (ADR-006) e marca `processed_at`.
- `GATEWAY_DELAY_SCALE` (padrão `1`) multiplica os atrasos. Só o `compose.test.yml` / gates usa `0.01`. O modo padrão (o do avaliador) é fiel à tabela.
- `GATEWAY_MODE=simulated` é o padrão e o único modo implementado; nenhuma chave real.

**Alternativas.** `setTimeout` em memória (perde resultados no restart); fila externa (mais infraestrutura); webhook HTTP para si mesmo (mais superfície de falha sem ganho).

**Consequências.** Latência efetiva = atraso sorteado + até 500 ms de polling, dentro dos limites (0001 confirma em ≤ 5,5 s no pior caso; atraso máximo sorteado limitado a 4,5 s para cartões "rápidos" para manter "em até 5 segundos" no Fluxo do avaliador com folga). Ver detalhe em [tdr.md §6](tdr.md).

---

## ADR-006 — Transições de status sempre condicionais ao status de origem

**Contexto.** R11: resposta do gateway que chegue depois do cancelamento não muda o status. A primeira tentativa sofreu com features que sobrescreviam o estado umas das outras.

**Decisão.** Nenhum `UPDATE tickets SET status` é incondicional. Tabela de transições permitidas:

| De | Para | Quem |
|---|---|---|
| `pending` | `confirmed` | worker (gateway aprovou) |
| `pending` | `declined` | worker (gateway recusou) |
| `pending` | `cancelled` | cancelamento |
| `confirmed` | `refunded` | cancelamento |

Implementação: `UPDATE tickets SET status = $to WHERE id = $id AND status = $from RETURNING id`. Zero linhas = transição ignorada (registrada em log `debug`). Check-in também é condicional: `SET checked_in_at = now() WHERE id = $1 AND checked_in_at IS NULL`.

Defesa extra no banco: `CHECK (status IN (...))` e trigger opcional rejeitando transições fora da tabela.

**Consequências.** A ordem de chegada entre cancelamento e gateway deixa de importar: quem chegar depois sobre um status que não é `pending` vira no-op.

---

## ADR-007 — Cancelamento síncrono em uma transação

**Contexto.** R11 permite até 10 s; não há motivo para ser assíncrono.

**Decisão.** `cancelEvent` em uma transação: lock do evento (`FOR UPDATE`), exige `status='published'` e posse, `UPDATE events SET status='cancelled', cancelled_at=now()`, `UPDATE tickets SET status='refunded' WHERE event_id=$1 AND status='confirmed'`, `UPDATE tickets SET status='cancelled' WHERE event_id=$1 AND status='pending'`. Os `payment_attempts` não processados ficam como estão; o worker os processa e o update condicional vira no-op.

**Consequências.** Prazo efetivo ≈ 0 s. Como o worker também toma o lock do evento ao aplicar resultado, não há janela em que o gateway confirma um ingresso entre a mudança do evento e a dos ingressos.

---

## ADR-008 — Sessão em banco, cookie HttpOnly e 404 para evento de outro organizador

**Contexto.** Dois papéis com login (participante, organizador). R13: organizador B não pode ver dados de E1 nem pelo endereço direto.

**Decisão.**
- Tabela `sessions(id aleatório 32 bytes, user_id, expires_at)`; cookie `sid` `HttpOnly; SameSite=Lax; Path=/`. Senhas com `bcryptjs` (custo 10; sem dependência nativa).
- `requireRole('organizer')` em todas as rotas `/organizer/*`: visitante → 302 `/login`; participante → 403 página genérica.
- Toda rota `/organizer/events/:id/*` passa por `loadOwnedEvent(userId, id)`, que faz `WHERE id=$1 AND organizer_id=$2`. Se não achar: **404 genérico** ("Evento não encontrado"), idêntico ao de ID inexistente — não revela existência nem dados.
- Formulários protegidos contra CSRF por `SameSite=Lax` + verificação de `Origin` em POST.

**Alternativas.** JWT (revogação no logout mais difícil); 403 para evento alheio (confirma que o ID existe).

**Consequências.** A guarda de posse é um único ponto (F02) reutilizado por F06, F07 e F08.

---

## ADR-009 — Dinheiro em centavos; preço pago gravado no ingresso

**Contexto.** R03 (mudança de preço só vale para compras futuras) e R12 (receita com preço vigente em cada compra). A API usa `priceCents`.

**Decisão.** `events.price_cents INTEGER CHECK (> 0)`; `tickets.price_paid_cents INTEGER NOT NULL` copiado de `events.price_cents` dentro da transação de compra (mesmo lock — o preço lido é o vigente no instante da compra). Receita = `SUM(price_paid_cents) WHERE status='confirmed'`. Entrada da UI aceita `100`, `100,00` ou `100.00`; exibição `R$ 1.234,56`.

**Consequências.** Nenhum histórico de preços é necessário; estornos nunca entram na receita porque o filtro é por status.

---

## ADR-010 — Avaliação isolada: sessão separada e relatório imutável

**Contexto.** Self-evaluation bias: "cada agente jurava que a sua parte estava pronta".

**Decisão.**
- Implementador e avaliador são sessões diferentes do Claude Code. O avaliador é iniciado com contexto vazio (nova sessão `claude` no diretório da branch/worktree, ou subagente novo sem histórico) e recebe apenas: AGENTS.md, o contrato da feature e o prompt fixo `docs/prompts/evaluator.md`.
- O avaliador não edita código. Ele só cria `features/Fxx/reports/AAAA-MM-DD-HHMM-<sha7>.md` com: data, commit avaliado (`git rev-parse HEAD`), ferramenta e modelo, veredito por item do contrato (PASS/FAIL) e evidência (comando + saída, resposta HTTP, trecho de HTML).
- Relatórios são imutáveis: cada nova avaliação gera arquivo novo. Gate `check-reports` falha se algum arquivo em `features/*/reports/` tiver mais de um commit no `git log`.
- `project-state.json` aponta para o relatório mais recente de cada feature; gate `check-state` valida que os caminhos existem e que o relatório mais recente é `APPROVED`.

**Consequências.** Mais custo de tokens por feature; em troca, cada "pronto" tem evidência auditável e reproduzível.

---

## ADR-011 — Harness por scripts npm que delegam ao Docker Compose

**Contexto.** Um comando para subir, um para derrubar, um para gates; o avaliador tem Node e Docker.

**Decisão.**

| Comando | Faz |
|---|---|
| `npm run up` | `docker compose up -d --build --wait` — o container `app` roda migrações e seed no entrypoint antes de abrir a porta; healthcheck em `/healthz` |
| `npm run down` | `docker compose --profile test down --remove-orphans` (mantém o volume do banco) |
| `npm run gates` | `docker compose -f compose.yml -f compose.test.yml run --rm gates` — lint, typecheck, Vitest, E2E com gateway acelerado, `check-reports`, `check-state`; banco de teste isolado (`catraca_test`) |
| `npm run seed` | re-executa a seed no container em execução (idempotente) |
| `npm run reset` | `down -v` + `up` (apaga dados; uso local) |

Os scripts não exigem `npm install` no host: só usam `docker compose`. Projeto Compose fixo: `name: catraca`.

**Consequências.** "Nenhum container do projeto continua rodando" é verificável com `docker ps --filter label=com.docker.compose.project=catraca`.

---

## ADR-012 — IDs prefixados e códigos de ingresso aleatórios

**Contexto.** A API usa IDs string (ex.: `evt_8f2k`, `tkt_51xq`) e códigos de check-in como `K7Q2M9XA`.

**Decisão.**
- IDs: `evt_` / `tkt_` / `usr_` + 12 caracteres base32 minúsculos aleatórios (`crypto.randomBytes`). Chave primária `TEXT`.
- Código do ingresso: 8 caracteres do alfabeto `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (sem `0/O/1/I`), `UNIQUE`; em colisão, nova tentativa (até 5). O check-in normaliza a entrada (`trim`, maiúsculas).
- IDs não são sequenciais, para não permitir enumeração de eventos alheios.

**Consequências.** `ZZZZZZZZ` nunca casa por acaso com probabilidade relevante; códigos não ambíguos para digitação manual.
