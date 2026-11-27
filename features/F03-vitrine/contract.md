# F03 — Vitrine e área do participante — Contrato

> Fonte: [docs/prd.md](../../docs/prd.md) · Decisões: [docs/adr.md](../../docs/adr.md) · Desenho: [docs/tdr.md](../../docs/tdr.md)

Convenções, variáveis e helpers: [docs/specs.md](../../docs/specs.md#convenções-dos-contratos) e [scripts/eval-helpers.sh](../../scripts/eval-helpers.sh).

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
