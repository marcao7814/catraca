# F03 — Vitrine e área do participante — Spec

> Fonte: [docs/prd.md](../../docs/prd.md) · Decisões: [docs/adr.md](../../docs/adr.md) · Desenho: [docs/tdr.md](../../docs/tdr.md)

**Objetivo.** Visitante vê a vitrine; participante se cadastra, entra, sai, compra e vê seus ingressos.

**Regras.** R02, R06, R07, R09.

**Rotas.** [docs/tdr.md §4.1](../../docs/tdr.md): `/`, `/events/:id`, `/events/:id/purchase`, `/signup`, `/me/tickets`.

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
