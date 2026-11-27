# F06 — Check-in — Spec

> Fonte: [docs/prd.md](../../docs/prd.md) · Decisões: [docs/adr.md](../../docs/adr.md) · Desenho: [docs/tdr.md](../../docs/tdr.md)

**Objetivo.** Check-in por código na página de gestão, com a primeira situação verdadeira de R10 definindo a mensagem.

**Regra.** R10.

**Interface.**
```ts
type CheckinResult =
  | 'Ingresso inválido para este evento' | 'Evento cancelado'
  | 'Ingresso não confirmado' | 'Ingresso já utilizado' | 'Entrada liberada';
checkIn(organizerId, eventId, rawCode): Promise<CheckinResult>
```

**Algoritmo.** [docs/tdr.md §5.4](../../docs/tdr.md). Código normalizado (`trim`, maiúsculas). Busca sempre filtrada por `event_id` (código de outro evento = inexistente). Marcação atômica condicional; em corrida, reavalia.

**UI.** Slot `checkin` na página de gestão: campo "Código do ingresso" + botão; após POST, a página de gestão é renderizada com a mensagem exata em `<p id="checkin-result">`. Em evento cancelado, o slot mostra **Evento cancelado** no lugar do campo; o endpoint POST continua aplicando a lista.

**Acesso.** Rota sob `loadOwnedEvent` → 404 para outro organizador.
