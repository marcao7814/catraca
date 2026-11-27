export type EventStatus = 'draft' | 'published' | 'cancelled';

export interface Event {
  id: string;
  organizerId: string;
  name: string;
  startsAt: Date;
  venue: string;
  capacity: number;
  priceCents: number;
  status: EventStatus;
  publishedAt: Date | null;
  cancelledAt: Date | null;
}

/** Dados já validados de criação/edição. */
export interface EventInput {
  name: string;
  startsAt: Date;
  venue: string;
  capacity: number;
  priceCents: number;
}

/** Valores crus do formulário, para reexibir após erro. */
export interface EventFormValues {
  name: string;
  startsAt: string;
  venue: string;
  capacity: string;
  price: string;
}

export const STATUS_LABEL: Record<EventStatus, string> = {
  draft: 'Rascunho',
  published: 'Publicado',
  cancelled: 'Cancelado',
};

export type EventErrorCode =
  | 'not_found'
  | 'capacity_below_occupied'
  | 'not_editable'
  | 'not_publishable'
  | 'starts_in_past';

export class EventError extends Error {
  constructor(
    public readonly code: EventErrorCode,
    message: string,
  ) {
    super(message);
  }
}
