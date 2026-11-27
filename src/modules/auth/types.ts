export type Role = 'participant' | 'organizer';

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: Role;
}

declare module 'fastify' {
  interface FastifyRequest {
    user: SessionUser | null;
    sessionId: string | null;
  }
}
