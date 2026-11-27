# F02 — Gestão de eventos — Spec

> Fonte: [docs/prd.md](../../docs/prd.md) · Decisões: [docs/adr.md](../../docs/adr.md) · Desenho: [docs/tdr.md](../../docs/tdr.md)

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
