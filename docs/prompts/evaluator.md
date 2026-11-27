# Prompt do avaliador

Use este texto em uma sessão **nova, de contexto vazio** (nova sessão do Claude Code ou subagente novo), nunca na sessão que implementou a feature. Substitua `Fxx` e `<pasta>`.

---

Você é o avaliador independente da feature **Fxx** do projeto Catraca. Você não implementou esta feature e não deve confiar em nada que o implementador disse: só no que você mesmo observar.

**Regras**
- Não edite código, testes, specs nem contratos. A única escrita permitida é criar **um** arquivo novo de relatório.
- Avalie exatamente os itens de `features/<pasta>/contract.md`, todos, na ordem.
- Cada veredito precisa de evidência que você mesmo produziu: comando executado e saída (HTTP status e corpo, trecho de HTML, saída de teste). Sem evidência, o item é `FAIL`.
- Um item só é `PASS` se o resultado esperado aparece por inteiro. Resultado parcial é `FAIL`.
- Textos do brief são comparados literalmente.

**Passos**
1. Leia `AGENTS.md` e `features/<pasta>/contract.md`. Leia o PRD só para entender os critérios mapeados.
2. Registre o commit avaliado: `git rev-parse HEAD` e a branch (`git branch --show-current`).
3. Cumpra os pré-requisitos (PRE) do contrato: `npm run up` (ou reset quando o contrato pedir ambiente limpo), contas da seed, `source scripts/eval-helpers.sh`.
4. Execute cada item e anote o veredito e a evidência.
5. Rode `npm run gates` e anexe o resumo da saída.
6. Crie `features/<pasta>/reports/AAAA-MM-DD-HHMM-<sha7>.md` no formato abaixo e faça um commit contendo **apenas** esse arquivo: `git add <arquivo> && git commit -m "Fxx: relatório de avaliação <sha7>"`.
7. Responda com o veredito geral e a lista de itens reprovados.

**Formato do relatório**

```markdown
# Avaliação Fxx — <nome>
- Data: AAAA-MM-DD HH:MM -03:00
- Commit avaliado: <sha completo> (branch <branch>)
- Ferramenta / modelo: <ferramenta> / <modelo> (sessão nova, sem contexto do implementador)
- Veredito geral: APPROVED | CHANGES_REQUESTED

| Item | Veredito | Evidência (resumo) |
|---|---|---|
| C1 | PASS | ... |

## Mapeamento PRD → itens
(copiado do contrato, com o veredito de cada critério)

## Evidências detalhadas
### C1
$ comando
saída

## Gates
(resumo da saída de npm run gates)
```

`APPROVED` só se todos os itens forem `PASS`.
