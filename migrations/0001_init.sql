-- Esquema base do MVP (F01). Vagas ocupadas NÃO são coluna: são derivadas de tickets
-- pending + confirmed (ADR-004). Migração imutável após o merge na main.

CREATE TABLE users (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 200),
  email         TEXT NOT NULL UNIQUE CHECK (email = lower(email)),
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('participant', 'organizer')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE sessions (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX sessions_user_idx ON sessions(user_id);

CREATE TABLE events (
  id           TEXT PRIMARY KEY,
  organizer_id TEXT NOT NULL REFERENCES users(id),
  name         TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 200),
  starts_at    TIMESTAMPTZ NOT NULL,
  venue        TEXT NOT NULL CHECK (length(venue) BETWEEN 1 AND 200),
  capacity     INTEGER NOT NULL CHECK (capacity >= 1),
  price_cents  INTEGER NOT NULL CHECK (price_cents > 0),
  status       TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'cancelled')),
  published_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX events_organizer_idx ON events(organizer_id);
CREATE INDEX events_sellable_idx ON events(status, starts_at);

CREATE TABLE tickets (
  id               TEXT PRIMARY KEY,
  event_id         TEXT NOT NULL REFERENCES events(id),
  code             TEXT NOT NULL UNIQUE CHECK (code ~ '^[A-Z2-9]{8}$'),
  channel          TEXT NOT NULL CHECK (channel IN ('storefront', 'partner')),
  buyer_user_id    TEXT REFERENCES users(id),
  buyer_email      TEXT NOT NULL,
  price_paid_cents INTEGER NOT NULL CHECK (price_paid_cents > 0),
  status           TEXT NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending', 'confirmed', 'declined', 'cancelled', 'refunded')),
  checked_in_at    TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (checked_in_at IS NULL OR status IN ('confirmed', 'refunded'))
);
CREATE INDEX tickets_event_status_idx ON tickets(event_id, status);
CREATE INDEX tickets_buyer_idx ON tickets(buyer_user_id);

CREATE TABLE payment_attempts (
  ticket_id    TEXT PRIMARY KEY REFERENCES tickets(id),
  card_last4   TEXT NOT NULL CHECK (card_last4 ~ '^\d{4}$'),
  outcome      TEXT NOT NULL CHECK (outcome IN ('approved', 'declined')),
  respond_at   TIMESTAMPTZ NOT NULL,
  processed_at TIMESTAMPTZ,
  applied      BOOLEAN
);
CREATE INDEX payment_due_idx ON payment_attempts(respond_at) WHERE processed_at IS NULL;

-- Defesa em profundidade (ADR-006): só as transições de status previstas são aceitas.
CREATE FUNCTION tickets_status_transition() RETURNS trigger AS $$
BEGIN
  IF NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;
  IF (OLD.status = 'pending' AND NEW.status IN ('confirmed', 'declined', 'cancelled'))
     OR (OLD.status = 'confirmed' AND NEW.status = 'refunded') THEN
    NEW.updated_at := now();
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'transição de status inválida: % -> %', OLD.status, NEW.status;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tickets_status_transition_trg
  BEFORE UPDATE OF status ON tickets
  FOR EACH ROW EXECUTE FUNCTION tickets_status_transition();
