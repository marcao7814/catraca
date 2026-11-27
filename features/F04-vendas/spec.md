# F04 — Motor de vendas e gateway — Spec

> Fonte: [docs/prd.md](../../docs/prd.md) · Decisões: [docs/adr.md](../../docs/adr.md) · Desenho: [docs/tdr.md](../../docs/tdr.md)

**Objetivo.** Núcleo de vendas compartilhado pelos dois canais: compra com garantia de lotação, gateway simulado, aplicação assíncrona do resultado.

**Regras.** R05, R06, R07, R08, R09 (código), base de R11.

**Interfaces providas.**
```ts
// src/modules/sales/index.ts
type PurchaseError = 'invalid_request' | 'event_not_available' | 'sold_out';
purchaseTicket(input: {
  eventId: string; channel: 'storefront' | 'partner';
  buyerUserId?: string; buyerEmail: string; cardNumber: string;
}): Promise<{ ok: true; ticket: Ticket } | { ok: false; error: PurchaseError }>;
getSeatStats(eventId): Promise<{ capacity; occupied; available }>;   // available=0 se cancelled
getTicket(ticketId): Promise<Ticket | null>;
findTicketByCode(eventId, code): Promise<Ticket | null>;
listTicketsByUser(userId): Promise<(Ticket & { eventName; startsAt })[]>;
applyGatewayResult(ticketId, outcome: 'approved' | 'declined'): Promise<boolean>; // false = no-op
startGatewayWorker(intervalMs?, log?): () => Promise<void>;  // retorna stop
interface PaymentGateway { authorize(card: string): { outcome; delayMs } }
```

**Algoritmo da compra.** Conforme [docs/tdr.md §5.1](../../docs/tdr.md) e ADR-004: valida → `BEGIN` → `SELECT … FOR UPDATE` no evento → status → contagem → `authorize` → `INSERT ticket` + `INSERT payment_attempt` → `COMMIT`. Ordem dos erros: `invalid_request`, `event_not_available`, `sold_out`.

**Validação.** `buyerEmail` regex simples `^[^\s@]+@[^\s@]+\.[^\s@]+$`; `cardNumber` `^\d{16}$` (espaços removidos na vitrine, não na API).

**Gateway simulado.** Tabela do [docs/tdr.md §6](../../docs/tdr.md); `delayMs × GATEWAY_DELAY_SCALE`.

**Worker.** [docs/tdr.md §5.2](../../docs/tdr.md); iniciado em `server.ts`, parado no shutdown (`lib/lifecycle`). Retoma attempts pendentes após reinício.

**Ferramenta de avaliação.** `src/tools/gateway-timing.ts` (`dist/tools/gateway-timing.js` na imagem): cria evento temporário, compra com os cartões informados e mede o tempo até a resposta aplicada pelo worker do app.

**Transições.** ADR-006: apenas `pending→confirmed|declined` aqui, condicionais.

**Código.** ADR-012, 8 caracteres, `UNIQUE`, retry em colisão.
