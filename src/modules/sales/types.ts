export type TicketStatus = 'pending' | 'confirmed' | 'declined' | 'cancelled' | 'refunded';
export type SalesChannel = 'storefront' | 'partner';

/** Rótulos da interface (brief: "Status do ingresso"). */
export const TICKET_STATUS_LABEL: Record<TicketStatus, string> = {
  pending: 'pendente',
  confirmed: 'confirmado',
  declined: 'recusado',
  cancelled: 'cancelado',
  refunded: 'estornado',
};

export interface Ticket {
  id: string;
  eventId: string;
  code: string;
  channel: SalesChannel;
  buyerUserId: string | null;
  buyerEmail: string;
  pricePaidCents: number;
  status: TicketStatus;
  checkedInAt: Date | null;
  createdAt: Date;
}

export interface PurchaseInput {
  eventId: string;
  channel: SalesChannel;
  buyerUserId?: string | null;
  buyerEmail: string;
  cardNumber: string;
}

/** Erros da compra, na ordem em que são verificados (contrato da API de parceiros). */
export type PurchaseError = 'invalid_request' | 'event_not_available' | 'sold_out';

export type PurchaseResult = { ok: true; ticket: Ticket } | { ok: false; error: PurchaseError };

export interface SeatStats {
  capacity: number;
  occupied: number;
  available: number;
}

export type GatewayOutcome = 'approved' | 'declined';
