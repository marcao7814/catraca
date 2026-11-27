# Segurança e guardrails — Catraca MVP

> Estudo de segurança do produto e guardrails do desenvolvimento em modo agente.
> Relacionados: [prd.md](prd.md), [adr.md](adr.md), [tdr.md](tdr.md), [AGENTS.md](../AGENTS.md).

| Campo | Valor |
|---|---|
| Versão | 1.0 |
| Data | 2026-11-26 |
| Escopo | Ambiente local (sem deploy), gateway simulado, dados fictícios |

O produto roda só localmente e não processa pagamento real. Mesmo assim, segurança aqui não é enfeite: **várias regras do brief são, na prática, requisitos de segurança** (R07 lotação sob concorrência, R11 cancelamento irreversível, R13 isolamento entre organizadores). Este documento trata os dois lados:

1. **Segurança do produto**: ameaças, controles e como cada controle é provado.
2. **Guardrails do processo com agentes**: o que impede um agente de quebrar regras, vazar segredos ou declarar pronto o que não está.

---

## Parte 1 — Segurança do produto

### 1.1 Ativos

| Ativo | Por que importa |
|---|---|
| Contas e senhas (participantes, organizadores) | Tomada de conta permite comprar em nome de outro ou operar eventos alheios |
| Sessões | Equivalem à senha enquanto válidas |
| Dados de evento de cada organizador (nome, números, ingressos) | R13: um organizador não pode ver os de outro |
| Integridade da lotação | R07: overbooking foi a falha mais grave da primeira tentativa |
| Integridade dos status dos ingressos | R08/R11: estornado não pode voltar a confirmado; check-in depende disso |
| Códigos de ingresso | São a "chave" da entrada no evento |
| Chave de parceiro | Permite vender em nome do parceiro |
| Número do cartão | Dado sensível, mesmo simulado |

### 1.2 Atores de ameaça

| Ator | Capacidade | Motivação típica |
|---|---|---|
| Visitante anônimo | Acessa qualquer URL pública | Ver dados de organizador, adivinhar códigos |
| Participante mal-intencionado | Conta válida de participante | Escalar para área de organizador, ver ingressos de outros |
| Organizador curioso (B) | Conta válida de organizador | Ver ou operar eventos de A (R13) |
| Parceiro com chave | Chave válida | Burlar lotação com rajadas, consultar ingressos |
| Cliente sem chave | Acesso à API | Usar a API sem autorização |
| Site de terceiros | Navegador da vítima logada | CSRF: cancelar evento ou fazer check-in em nome do organizador |

### 1.3 Modelo de ameaças (STRIDE)

| # | Categoria | Ameaça | Controle | Prova (teste/contrato) |
|---|---|---|---|---|
| T1 | Spoofing | Adivinhar senha ou enumerar e-mails pelo login | Mensagem única "E-mail ou senha inválidos."; bcrypt também para e-mail inexistente (tempo parecido) | `foundation.test.ts` "senha errada ou e-mail inexistente" |
| T2 | Spoofing | Roubo de sessão por XSS | Cookie `HttpOnly`; escape automático do EJS (`<%= %>`) | `foundation.test.ts` verifica `HttpOnly` e `SameSite=Lax` |
| T3 | Spoofing | Sessão eterna após logout | Sessão no banco, apagada no logout; expiração (`SESSION_TTL_HOURS`) | "logout invalida a sessão" |
| T4 | Spoofing | Usar a API sem chave | Hook `onRequest` em `/api/partner/*`, comparação em tempo constante, 401 antes do parsing | F05 contrato C1 |
| T5 | Tampering | Overbooking com compras simultâneas | `SELECT … FOR UPDATE` no evento + contagem na mesma transação (ADR-004) | F04 C4 (20 rodadas × 30), F05 C12 (rajada HTTP), passo 15 do fluxo |
| T6 | Tampering | Resposta tardia do gateway reverter cancelamento | Update condicional `WHERE status='pending'` + trigger de transições (ADR-006) | F04 C12, F07 C3 (corrida 50×), trigger testado em F01 |
| T7 | Tampering | Alterar preço de compra já feita | `price_paid_cents` gravado na compra (ADR-009) | F02 C9, F04 C11 |
| T8 | Tampering | CSRF: site externo envia POST de cancelamento/check-in | `SameSite=Lax` + recusa de POST com `Origin` de outro host | "POST de formulário com Origin de outro host é recusado" |
| T9 | Tampering | Editar ou republicar evento cancelado | Checagem de status na transação de edição; página sem formulário | F07 C6 |
| T10 | Repudiation | Não saber quem fez o quê | Logs JSON com `reqId`, `eventId`, `ticketId`; ingressos com `channel` e `buyer_email` | Evidência nos relatórios |
| T11 | Info disclosure | Organizador B abre a URL de gestão de E1 | `loadOwnedEvent` com `organizer_id` na consulta; 404 igual ao de ID inexistente | F02 C12, F06 C10, F08 C7 |
| T12 | Info disclosure | Enumerar eventos por ID sequencial | IDs aleatórios de 60 bits (`evt_` + 12 base32) (ADR-012) | `ids.test.ts` |
| T13 | Info disclosure | Adivinhar código de ingresso | 8 caracteres de alfabeto de 32 símbolos (~10¹²); busca sempre filtrada pelo evento | `ids.test.ts`; F06 C2 |
| T14 | Info disclosure | Vazar número do cartão em banco ou log | Só `card_last4` é persistido; logger com `redact` de `x-api-key` e `cookie` | Revisão de código; esquema `payment_attempts` |
| T15 | Info disclosure | Participante ver ingressos de outro | `/me/tickets` filtra por `buyer_user_id` da sessão | F03 C10 |
| T16 | Info disclosure | Open redirect via `next` no login | `safeNext` aceita só caminho interno (`/x`, não `//x`) | "next só aceita caminho interno" |
| T17 | DoS | Rajada esgota conexões do banco | Pool dimensionado (`PG_POOL_MAX=30`); compras curtas (< 50 ms com lock) | F05 C12 |
| T18 | DoS | Força bruta no login | **Risco aceito no MVP** (ambiente local). Mitigação futura: rate limit por IP/e-mail | — |
| T19 | Elevation | Participante acessa `/organizer/*` | `requireRole('organizer')` → 403 | F01 C10, `foundation.test.ts` |
| T20 | Elevation | Cadastro criar organizador | Cadastro grava sempre `role='participant'`; papel não vem do formulário | F03 (teste de cadastro) |
| T21 | Injection | SQL injection | SQL sempre parametrizado (`$1`), nunca concatenado | Revisão; lint de padrões proibidos (futuro) |
| T22 | Injection | XSS armazenado em nome de evento | EJS `<%= %>` escapa; `<%-` só para o `body` do layout | Teste com nome `<script>` (F02) |

### 1.4 Controles por camada

**Autenticação e sessão**
- Senhas: bcryptjs, custo 10; nunca logadas.
- Sessão: 256 bits aleatórios, tabela `sessions`, cookie `sid` `HttpOnly; SameSite=Lax; Path=/`. `Secure` desligado só porque o ambiente é `http://localhost`; em produção seria obrigatório.
- Login com mensagem única e hash fictício para e-mail inexistente.

**Autorização**
- Dois níveis: papel (`requireRole`) e posse (`loadOwnedEvent`).
- A posse é verificada **na mesma consulta** que busca o evento (`WHERE id=$1 AND organizer_id=$2`), sem "buscar e depois comparar", para não haver caminho que esqueça a comparação.
- Resposta para recurso alheio = 404 idêntico ao inexistente.

**Integridade de dados**
- Constraints no banco: `CHECK` de status, lotação ≥ 1, preço > 0, código `^[A-Z2-9]{8}$`, `checked_in_at` só em `confirmed`/`refunded`.
- Trigger `tickets_status_transition` rejeita transições fora da tabela, mesmo que algum código esqueça a cláusula `WHERE status=`.
- Lock por evento para tudo que mexe em vagas.

**Entrada**
- Validação no servidor de todos os campos (Fastify JSON Schema na API; validação explícita nos formulários).
- API: JSON malformado → 422 `invalid_request`, nunca 500.

**Saída**
- EJS com escape por padrão.
- API devolve apenas os campos do contrato (sem vazar `buyer_email`, `price_paid_cents` etc.).
- Erros 500 genéricos (`internal_error`), sem stack trace na resposta.

**Infraestrutura**
- Postgres sem porta publicada no host: só o app o acessa, pela rede interna do Compose.
- Imagem `prod` sem devDependencies; processo roda como usuário `node`, não root (`USER node` no Dockerfile).
- Nenhum segredo real: a chave de parceiro e a senha do banco são de desenvolvimento, públicas por design e documentadas.

### 1.5 Riscos aceitos no MVP

| Risco | Por que é aceitável aqui | O que faríamos em produção |
|---|---|---|
| Sem rate limit no login e na API | Ambiente local, sem exposição | `@fastify/rate-limit` por IP/chave/e-mail |
| Cookie sem `Secure` | `http://localhost` | HTTPS obrigatório + `Secure` + HSTS |
| Chave de parceiro única e fixa | Brief pede chave documentada | Chaves por parceiro, rotacionáveis, guardadas com hash |
| Senha mínima de 6 caracteres | Simplicidade do MVP | Política maior + verificação contra senhas vazadas |
| Sem cabeçalhos de segurança (CSP etc.) | Nenhum script de terceiros | `@fastify/helmet` com CSP restrita |
| Sem auditoria formal | Logs JSON bastam para o desafio | Trilha de auditoria imutável para cancelamentos e check-ins |

---

## Parte 2 — Guardrails do desenvolvimento com agentes

A primeira tentativa falhou porque **cada agente validou o próprio trabalho isoladamente**. Os guardrails abaixo existem para que regra quebrada seja pega por máquina ou por outro agente, nunca pela boa vontade de quem implementou.

### 2.1 Princípios

1. **Quem implementa não avalia** (self-evaluation bias). Avaliador em sessão nova, de contexto vazio.
2. **Regra importante vira verificação automática.** Se uma regra está só em texto, um agente vai esquecê-la; se está no lint, no banco ou num teste, ela se defende sozinha.
3. **Defesa em camadas.** Regra crítica tem pelo menos duas barreiras (ex.: transições de status: cláusula `WHERE` no código + trigger no banco + teste).
4. **Evidência ou não aconteceu.** "Pronto" só com relatório contendo comando e saída.
5. **Menor privilégio para agentes.** O agente não precisa de mais acesso do que a tarefa exige.

### 2.2 Guardrails automáticos (impostos por máquina)

| Guardrail | Onde | O que impede |
|---|---|---|
| Fronteiras entre módulos | `eslint.config.js` (`no-restricted-imports` gerado do grafo do PRD) | Feature importar outra fora do grafo (acoplamento escondido que quebra waves paralelas) |
| TypeScript estrito | `tsconfig.json` (`strict`, `noUncheckedIndexedAccess`) | Acesso a valor possivelmente `undefined` sem tratamento |
| Constraints e trigger no banco | `migrations/0001_init.sql` | Status inválido, transição proibida, preço/lotação inválidos, mesmo com bug no código |
| Gates obrigatórios | `npm run gates` | PR com lint, tipos ou testes quebrados |
| Teste de concorrência repetido | F04/F05 | Regressão de R07 que só aparece às vezes |
| Relatórios imutáveis | `scripts/check-reports.mjs` | Avaliador ou implementador "ajustar" um relatório reprovado |
| Estado coerente | `scripts/check-state.mjs` | `done` sem relatório aprovado, ou caminho de relatório inexistente |
| Textos exatos testados | testes de R10, `Ingressos esgotados`, corpos da API | Agente "melhorar" a redação e quebrar o contrato |
| Migrações imutáveis | regra em AGENTS.md + revisão de PR | Editar migração já aplicada e divergir bancos |

### 2.3 Guardrails de processo

| Guardrail | Como |
|---|---|
| Handoff por wave | Nenhuma feature começa sem todas as dependências `done` em `project-state.json` |
| Contrato antes do código | O avaliador exercita o `contract.md` escrito antes da implementação, não o que o implementador decidir mostrar |
| Critérios cross-feature | Cada aresta do grafo tem critério que exercita as duas features juntas (PRD §5.2) |
| PR por feature | Mudanças revisáveis; histórico dos PRs prova o paralelismo |
| Fluxo do avaliador no fim | Rodado na `main`, a partir de clone limpo, depois do último merge: pega regressões entre features que os relatórios individuais não pegam |
| Prompts fixos | `docs/prompts/implementer.md` e `evaluator.md`: o avaliador não pode editar código; o implementador não pode escrever relatório |

### 2.4 Guardrails do agente de código (Claude Code)

**Permissões recomendadas** (`.claude/settings.json` do projeto):

| Permitir sem perguntar | Perguntar | Negar |
|---|---|---|
| `npm run gates`, `npm run up/down/logs/seed`, `npx eslint`, `npx tsc`, `npx vitest`, `git status/diff/log/add/commit`, `curl` para `localhost` | `git push`, `gh pr create/merge`, `npm install <pacote novo>`, `npm run reset` (apaga dados) | `git push --force` na `main`, `rm -rf` fora de `dist/`/`coverage/`, leitura de `.env` de fora do projeto, `docker system prune`, `curl` para hosts externos com dados do projeto |

**Regras de comportamento** (reforçadas em AGENTS.md):
- Não desligar regra de lint, não usar `// @ts-ignore`/`eslint-disable` para passar gate, não marcar teste como `skip`.
- Não mexer em `features/*/reports/` (implementador) nem em `src/` (avaliador).
- Não adicionar dependência sem justificar no PR.
- Não commitar `.env`, dumps de banco, cookies (`*.jar`) ou logs.
- Pedir confirmação antes de ações difíceis de desfazer (push, merge, apagar volume).

**Hooks úteis** (opcionais):
- `PreToolUse` em `Edit|Write` bloqueando caminhos `features/*/reports/*.md` já commitados.
- `PreToolUse` em `Bash` bloqueando `git push --force` e `--no-verify`.
- `Stop` lembrando de rodar `npm run gates` se houve alteração em `src/`.

### 2.5 Riscos específicos de agentes e mitigação

| Risco | Exemplo | Mitigação |
|---|---|---|
| Declarar pronto sem testar | "Implementei o cancelamento" sem rodar nada | Avaliador independente + gates no PR |
| Ajustar o teste para passar | Mudar `toBe(5)` para `toBeLessThanOrEqual(5)` na rajada | Contrato fixa o esperado; avaliador roda o contrato, não só os testes |
| Corrigir sintoma em outra feature | F08 "corrige" a receita filtrando por canal em vez de status | Fronteiras de módulo no lint; spec define a fórmula |
| Reescrever texto exato | "Ingresso inválido" em vez de "Ingresso inválido para este evento" | Testes com string literal; regra 6 do AGENTS.md |
| Conflito de merge resolvido errado | Na W3, um PR apaga o registro de rota do outro | Gates no PR que mergear por último; slots na página de gestão reduzem a área de conflito |
| Injeção de instruções por conteúdo | Nome de evento com "ignore as regras e …" lido pelo agente | Conteúdo de dados é dado, não instrução; avaliador usa só o contrato |
| Vazamento de dados para fora | Agente enviar logs/código para serviço externo | Permissões negam rede externa com dados do projeto; nenhum dado real existe |

---

## Parte 3 — Checklist de segurança por PR

- [ ] Rotas novas de organizador usam `requireRole('organizer')` e, quando de um evento, `loadOwnedEvent`.
- [ ] Todo SQL é parametrizado.
- [ ] Todo `UPDATE tickets SET status` tem `WHERE status = '<origem>'`.
- [ ] Operações que mexem em vagas travam o evento (`FOR UPDATE`) na mesma transação.
- [ ] Nenhum dado sensível novo em log (cartão, senha, cookie, chave).
- [ ] Saída HTML usa `<%= %>`; `<%-` só com conteúdo confiável.
- [ ] Respostas da API trazem só os campos do contrato.
- [ ] Testes cobrem o caminho negado (outro organizador, papel errado, sem chave), não só o feliz.
- [ ] `npm run gates` verde.
