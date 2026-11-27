# F07 — Cancelamento de evento — Spec

> Fonte: [docs/prd.md](../../docs/prd.md) · Decisões: [docs/adr.md](../../docs/adr.md) · Desenho: [docs/tdr.md](../../docs/tdr.md)

**Objetivo.** Cancelar evento publicado de forma irreversível, com transição imediata dos ingressos e imunidade a respostas tardias do gateway.

**Regra.** R11.

**Interface.**
```ts
cancelEvent(organizerId, eventId): Promise<{ refunded: number; cancelled: number }>
// erros: not_found (404), not_cancellable (status ≠ published)
```

**Comportamento.** Transação única ([docs/tdr.md §5.3](../../docs/tdr.md), ADR-007). Após cancelar:
- evento some de `listSellableEvents` (já filtra `published`); compras → `event_not_available`;
- `updateEvent` e `publishEvent` rejeitam `cancelled` (F07 adiciona a checagem em F02, se ainda não existir) com "Evento cancelado não pode ser editado";
- página de gestão mostra "Evento cancelado" e não renderiza formulário de edição nem botões de publicar/cancelar;
- slot `cancel` na página de gestão: botão "Cancelar evento" com confirmação (`onsubmit confirm()`), apenas para `published`.

**Corrida com o gateway.** Garantida por ADR-006 (update condicional) + lock do evento no worker.
