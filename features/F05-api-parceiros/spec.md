# F05 — API de parceiros — Spec

> Fonte: [docs/prd.md](../../docs/prd.md) · Decisões: [docs/adr.md](../../docs/adr.md) · Desenho: [docs/tdr.md](../../docs/tdr.md)

**Objetivo.** Implementar exatamente o contrato fixo do brief ([docs/tdr.md §4.2](../../docs/tdr.md)).

**Regras.** R02, R05, R06, R07.

**Detalhes.**
- Plugin Fastify com prefixo `/api/partner`; hook `onRequest` valida `X-Api-Key` (timing-safe) → 401 `{"error":"unauthorized"}` antes de qualquer parsing, inclusive em rota inexistente sob o prefixo.
- `GET /events`: `listSellableEvents()` mapeado para `{id, name, startsAt, priceCents, availableSeats}`; `startsAt` com offset `-03:00`; ordenado por `startsAt`.
- `POST /events/:eventId/purchases`: parser JSON tolerante (JSON inválido → 422, não 400); delega a `purchaseTicket({channel:'partner', buyerEmail, cardNumber})`; mapeia `invalid_request→422`, `event_not_available→404`, `sold_out→409`; sucesso 202 `{ticketId, code, status:"pending"}`.
- `GET /tickets/:ticketId`: `{ticketId, code, eventId, status, checkedIn: checked_in_at != null}`; ausente → 404 `ticket_not_found`.
- Respostas sempre `application/json`; nenhum campo extra.
