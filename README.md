# Catraca

MVP de venda de ingressos para eventos pequenos (shows em bar, workshops, meetups), construído em modo agente a partir do [brief](docs/brief.md).

> Em construção, feature a feature, na ordem das waves do [PRD](docs/prd.md). O estado de cada feature está em [project-state.json](project-state.json).

## Como rodar

**Pré-requisitos:** Docker (com Compose), Git e Node.js LTS. Nada mais: não é preciso rodar `npm install`.

| Ação | Comando |
|---|---|
| Subir (com migrações e seed) | `npm run up` |
| Derrubar | `npm run down` |
| Gates (lint, tipos, testes, relatórios, estado) | `npm run gates` |

Outros: `npm run seed` (roda a seed de novo, idempotente), `npm run reset` (apaga o banco e sobe de novo), `npm run logs`.

O modo padrão usa o **gateway de pagamento simulado**; nenhuma chave de pagamento é necessária.

## Endereços

| | URL |
|---|---|
| Produto (`$WEB`) | http://localhost:3000 |
| API de parceiros (`$API`) | http://localhost:3000 (rotas em `/api/partner/*`) |

Se a porta 3000 estiver ocupada, copie `.env.example` para `.env` e defina `CATRACA_PORT`.

## Credenciais

| Conta | E-mail | Senha |
|---|---|---|
| Organizador A | `org.a@catraca.dev` | `catraca123` |
| Organizador B | `org.b@catraca.dev` | `catraca123` |
| Participante da seed | `participante@catraca.dev` | `catraca123` |

**Chave de parceiro:** `catraca-partner-dev-key` (cabeçalho `X-Api-Key`).

## Mapa dos artefatos

| Artefato | Caminho |
|---|---|
| Brief | [docs/brief.md](docs/brief.md) |
| PRD | [docs/prd.md](docs/prd.md) |
| Decisões de arquitetura (ADR) | [docs/adr.md](docs/adr.md) |
| Desenho técnico (TDR) | [docs/tdr.md](docs/tdr.md) |
| Índice das specs e cobertura cross-feature | [docs/specs.md](docs/specs.md) |
| Segurança e guardrails | [docs/seguranca.md](docs/seguranca.md) |
| Features (spec, plano, contrato, relatórios) | [features/](features/) — uma pasta por feature, `Fxx-<nome>/` |
| Estado do projeto | [project-state.json](project-state.json) |
| Porta de entrada dos agentes | [AGENTS.md](AGENTS.md) ([CLAUDE.md](CLAUDE.md) aponta para ele) |

| Feature | Pasta |
|---|---|
| F01 Fundação e harness | [features/F01-fundacao](features/F01-fundacao) |
| F02 Gestão de eventos | [features/F02-eventos](features/F02-eventos) |
| F03 Vitrine e área do participante | [features/F03-vitrine](features/F03-vitrine) |
| F04 Motor de vendas e gateway | [features/F04-vendas](features/F04-vendas) |
| F05 API de parceiros | [features/F05-api-parceiros](features/F05-api-parceiros) |
| F06 Check-in | [features/F06-checkin](features/F06-checkin) |
| F07 Cancelamento de evento | [features/F07-cancelamento](features/F07-cancelamento) |
| F08 Painel do evento | [features/F08-painel](features/F08-painel) |

### PRs das waves paralelas

**W3 — F03, F05 e F07 implementadas ao mesmo tempo**, por três agentes, cada um em seu worktree e branch:

| PR | Feature | Primeiro commit | Último commit de implementação |
|---|---|---|---|
| [#5](https://github.com/marcao7814/catraca/pull/5) | F03 Vitrine e área do participante | 2026-11-27 14:58:38 -03:00 | 2026-11-27 15:08:56 -03:00 |
| [#6](https://github.com/marcao7814/catraca/pull/6) | F07 Cancelamento de evento | 2026-11-27 14:59:11 -03:00 | 2026-11-27 15:07:59 -03:00 |
| [#7](https://github.com/marcao7814/catraca/pull/7) | F05 API de parceiros | 2026-11-27 14:59:28 -03:00 | 2026-11-27 15:31:40 -03:00 |

O primeiro commit de cada PR é anterior ao último commit dos outros dois. Depois da implementação, cada PR recebeu o commit do relatório do avaliador e, nos dois últimos a entrar, o commit de integração com a `main` (conflito em `src/app.ts`, resolvido com os gates verdes).

**W4 — F06 e F08:** serão listados aqui quando integrados.

## Decisões

- **Stack:** Node.js 22 + TypeScript + Fastify, HTML renderizado no servidor (EJS) e PostgreSQL 16, tudo em Docker Compose. Roda na máquina do avaliador só com Docker e Node, tem poucas camadas para os agentes integrarem e dá controle total do SQL nas regiões críticas. Detalhes em [ADR-001 a ADR-003](docs/adr.md).
- **R07 sob concorrência:** cada compra trava a linha do evento (`SELECT … FOR UPDATE`) e conta `pending + confirmed` na mesma transação antes de inserir o ingresso. A prova é um teste automatizado de 30 compras simultâneas repetido em 20 eventos novos, mais a rajada HTTP do fluxo do avaliador. Ver [ADR-004](docs/adr.md).
- **Resposta assíncrona do gateway:** a compra grava o ingresso `pending` e um `payment_attempt` com o horário previsto da resposta; um worker no app aplica o resultado com update condicional (`WHERE status='pending'`), o que torna respostas tardias inofensivas após um cancelamento. Ver [ADR-005 e ADR-006](docs/adr.md).
- **Avaliação isolada:** cada feature é avaliada por uma sessão nova do agente, de contexto vazio, com prompt fixo ([docs/prompts/evaluator.md](docs/prompts/evaluator.md)) que proíbe editar código. Cada avaliação gera um relatório novo e imutável, garantido pelo gate `check-reports`. Ver [ADR-010](docs/adr.md).
