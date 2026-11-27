# F08 — Painel do evento — Spec

> Fonte: [docs/prd.md](../../docs/prd.md) · Decisões: [docs/adr.md](../../docs/adr.md) · Desenho: [docs/tdr.md](../../docs/tdr.md)

**Objetivo.** Seis indicadores na página de gestão, consistentes entre si e com o estado dos ingressos.

**Regra.** R12 (e R05, R03).

**Interface.**
```ts
getDashboard(eventId): Promise<{
  confirmed: number; pending: number; checkins: number;
  available: number; revenueCents: number; refunded: number;
}>
```

**Cálculo.** Uma consulta agregada ([docs/tdr.md §5.6](../../docs/tdr.md)); `available` = 0 se cancelado, senão `capacity − occupied`. Canal não importa (vitrine e API somam igual).

**UI.** Slot `dashboard`: `<dl id="dashboard">` com rótulos exatos **Confirmados**, **Pendentes**, **Check-ins**, **Vagas disponíveis**, **Receita** (`R$ 350,00`), **Estornados**; cada valor com `data-metric="confirmed|pending|checkins|available|revenue|refunded"` para facilitar evidência por `grep`.

**Acesso.** Só renderizado após `loadOwnedEvent` (B não vê números).
