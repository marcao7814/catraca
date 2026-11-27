# Prompt do implementador

Use este texto ao iniciar uma sessão de agente para implementar uma feature. Substitua `Fxx` e `<pasta>`.

---

Você é o implementador da feature **Fxx** do projeto Catraca.

1. Leia `AGENTS.md` inteiro, depois `docs/prd.md` (seções da Fxx e das features das quais ela depende), `features/<pasta>/spec.md`, `plan.md` e `contract.md`.
2. Confirme em `project-state.json` que todas as dependências da Fxx estão `done`. Se não estiverem, pare e informe.
3. Trabalhe na branch `feat/<pasta>` (ou no worktree já criado para ela). Atualize `project-state.json`: Fxx → `in_progress`.
4. Siga o plano em etapas. Para cada critério do PRD da feature e cada critério cross-feature atribuído a ela, escreva pelo menos um teste automatizado.
5. Respeite as regras de AGENTS.md, em especial: grafo de imports, lock por evento, transições condicionais, textos exatos.
6. Commits pequenos, mensagens no formato `Fxx: <o que mudou>`.
7. Rode `npm run gates` até `GATES: OK`. Rode `npm run up` e verifique manualmente alguns itens do contrato.
8. Abra o PR para `main` com: resumo, critérios cobertos, como testar. Atualize `project-state.json`: Fxx → `in_review`.
9. **Não avalie a própria feature e não escreva relatório em `reports/`.** A avaliação é feita por outra sessão.
10. Se receber um relatório reprovado, corrija só o que foi apontado (mais o que for necessário para isso), rode os gates e peça nova avaliação.
