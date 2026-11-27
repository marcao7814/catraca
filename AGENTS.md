# AGENTS.md — porta de entrada dos agentes

Catraca: MVP de venda de ingressos (vitrine, área do organizador, API de parceiros, gateway simulado).
Leia este arquivo inteiro antes de qualquer tarefa. Ele vale para implementadores e avaliadores.

## Comandos

Pré-requisitos no host: Docker (com Compose), Git e Node.js LTS. Nada mais.

| Comando | O que faz |
|---|---|
| `npm run up` | Sobe Postgres + app (`docker compose up -d --build --wait`). O container aplica as migrações e roda a seed antes de abrir a porta. |
| `npm run down` | Derruba tudo que a subida e os gates iniciaram (containers e rede; mantém o volume do banco). |
| `npm run gates` | Lint, typecheck e testes (unidade, integração, E2E) em container contra um Postgres efêmero; depois `check-reports` e `check-state`. Tem que terminar com `GATES: OK`. |
| `npm run test:docker -- <args>` | Roda o Vitest com argumentos livres (ex.: um arquivo, `-t "C7"`) no container dos gates, contra Postgres efêmero. |
| `npm run seed` | Roda a seed de novo (idempotente) no app em execução. |
| `npm run reset` | Derruba e apaga o volume do banco, depois sobe de novo. Só para uso local. |
| `npm run logs` | Logs do app. |

Endereço: `http://localhost:3000` (web e API de parceiros). Se a 3000 estiver ocupada, crie um `.env` com `CATRACA_PORT=<porta>` (ver `.env.example`).

`npm install` no host é opcional (só para editor/IDE e para rodar `npm run lint`/`typecheck` localmente).

## Credenciais da seed

| Conta | E-mail | Senha |
|---|---|---|
| Organizador A | `org.a@catraca.dev` | `catraca123` |
| Organizador B | `org.b@catraca.dev` | `catraca123` |
| Participante | `participante@catraca.dev` | `catraca123` |
| Parceiro | cabeçalho `X-Api-Key: catraca-partner-dev-key` | — |

## Mapa dos artefatos

| Artefato | Caminho |
|---|---|
| Brief (regras R01–R13, contrato fixo da API) | [docs/brief.md](docs/brief.md) |
| PRD: features, provides/consumes, grafo, waves, critérios | [docs/prd.md](docs/prd.md) |
| Decisões de arquitetura | [docs/adr.md](docs/adr.md) |
| Desenho técnico (esquema, rotas, fluxos) | [docs/tdr.md](docs/tdr.md) |
| Índice das specs, convenções dos contratos e cobertura cross-feature | [docs/specs.md](docs/specs.md) |
| Segurança e guardrails | [docs/seguranca.md](docs/seguranca.md) |
| Spec, plano e contrato de cada feature | `features/Fxx-<nome>/{spec,plan,contract}.md` |
| Relatórios de avaliação | `features/Fxx-<nome>/reports/AAAA-MM-DD-HHMM-<sha7>.md` |
| Estado do projeto | [project-state.json](project-state.json) |
| Prompt do implementador | [docs/prompts/implementer.md](docs/prompts/implementer.md) |
| Prompt do avaliador | [docs/prompts/evaluator.md](docs/prompts/evaluator.md) |
| Helpers de shell do avaliador | [scripts/eval-helpers.sh](scripts/eval-helpers.sh) |

## Estrutura do código

```
src/
  app.ts, server.ts, config.ts
  db/        pool, withTx, migrador
  lib/       ids, dinheiro, datas, render, lifecycle
  modules/
    auth/         F01  sessão, login/logout, requireRole
    events/       F02  eventos, página de gestão, loadOwnedEvent
    sales/        F04  purchaseTicket, vagas, gateway simulado, worker
    storefront/   F03  vitrine, cadastro, Meus ingressos
    partner-api/  F05  /api/partner/*
    cancellation/ F07  cancelamento
    checkin/      F06  check-in
    dashboard/    F08  painel
  seed/
views/         templates EJS
migrations/    NNNN_nome.sql
test/          unit/ integration/ e2e/ helpers/
```

## Regras do projeto (não negociáveis)

1. **Grafo de dependências.** Um módulo só importa módulos das features das quais depende (PRD §4). O lint (`eslint.config.js`) bloqueia o resto. Não contorne.
2. **Lotação (R07).** Toda operação que cria ingresso, libera vaga, muda a lotação ou cancela evento roda em transação e trava a linha do evento com `SELECT … FOR UPDATE` antes de contar `pending + confirmed`. Nunca faça "consultar e depois inserir" fora dessa transação (ADR-004).
3. **Transições de status condicionais.** Todo `UPDATE tickets SET status` tem `WHERE status = '<origem>'`. Transições válidas: `pending→confirmed|declined|cancelled`, `confirmed→refunded`. Um trigger no banco rejeita o resto (ADR-006).
4. **Dinheiro em centavos.** O ingresso grava `price_paid_cents` no momento da compra; a receita soma esse campo dos `confirmed` (ADR-009).
5. **Acesso (R13).** Rotas `/organizer/*` usam `requireRole('organizer')`; rotas de um evento usam `loadOwnedEvent`, que devolve 404 genérico para evento de outro organizador.
6. **Textos exatos.** As mensagens do brief (`Ingressos esgotados`, as cinco de R10) e os corpos da API de parceiros são copiados literalmente. Não traduza nem reformule.
7. **Migrações imutáveis.** Depois de mergeada na `main`, uma migração não é editada; crie `NNNN_nova.sql`.
8. **Gateway.** O modo padrão é o simulado, com os tempos do brief. Só os gates aceleram (`GATEWAY_DELAY_SCALE=0.01`). Nunca persista o número completo do cartão.
9. **Gates verdes.** Não abra PR com `npm run gates` falhando. Não desligue regra de lint nem pule teste para passar.
10. **Relatórios imutáveis.** Arquivos em `features/*/reports/` nunca são editados depois de commitados. Nova avaliação = novo arquivo. O gate `check-reports` falha se isso for violado.
11. **Segredos.** Não commite `.env`. A chave de parceiro de desenvolvimento é pública por design (documentada); chaves reais não existem neste projeto.

## Fluxo de trabalho

1. Pegue a próxima feature cuja wave anterior está toda `done` em `project-state.json`.
2. **Implementador:** branch `feat/Fxx-<nome>` (worktree nas waves paralelas). Siga `spec.md` e `plan.md`, escreva testes, rode `npm run gates`, abra PR. Marque a feature como `in_review` no estado.
3. **Avaliador:** outra sessão, de contexto vazio, com [docs/prompts/evaluator.md](docs/prompts/evaluator.md). Ele só exercita o `contract.md` e cria um relatório novo. Não edita código.
4. Reprovado → `changes_requested` → o implementador corrige → nova avaliação, novo relatório.
5. Aprovado → merge do PR → `project-state.json` com `done`, link do PR e caminho do relatório mais recente.
6. Uma wave só começa quando todas as features da anterior estão `done` (regra de ouro do handoff).
7. Ao final: Fluxo do avaliador completo (brief, passos 1–18) contra a `main`, a partir de clone limpo.

Waves: W0 F01 → W1 F02 → W2 F04 → **W3 em paralelo: F03, F05, F07** → **W4 em paralelo: F06, F08**.
