import type { FastifyInstance } from 'fastify';
import { render } from '../../lib/render.js';
import { listSellableEvents } from '../events/index.js';
import { getSeatStats } from '../sales/index.js';

/** Rotas da vitrine e da área do participante (F03). */
export async function storefrontRoutes(app: FastifyInstance): Promise<void> {
  // Vitrine (R02): só eventos publicados e não cancelados.
  app.get('/', async (req, reply) => {
    const events = await listSellableEvents();
    const items = await Promise.all(
      events.map(async (event) => ({ event, available: (await getSeatStats(event.id))?.available ?? 0 })),
    );
    return render(req, reply, 'storefront/home.ejs', { title: 'Eventos', items });
  });
}
