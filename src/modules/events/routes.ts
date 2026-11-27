import type { FastifyInstance } from 'fastify';
import { render } from '../../lib/render.js';
import { requireRole } from '../auth/guards.js';

// F01: esqueleto protegido da área de organizador, usado para validar papéis (R13).
// F02 substitui por gestão de eventos completa.
export async function eventsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/organizer/events', { preHandler: requireRole('organizer') }, async (req, reply) => {
    return render(req, reply, 'organizer/events.ejs', { title: 'Meus eventos', events: [] });
  });
}
