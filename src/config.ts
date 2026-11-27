// Configuração centralizada. Os padrões permitem subir sem .env (modo do avaliador).
function num(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) throw new Error(`Variável ${name} inválida: ${raw}`);
  return n;
}

export const config = {
  port: num('PORT', 3000),
  databaseUrl: process.env.DATABASE_URL ?? 'postgres://catraca:catraca@localhost:5432/catraca',
  pgPoolMax: num('PG_POOL_MAX', 30),
  partnerApiKey: process.env.PARTNER_API_KEY ?? 'catraca-partner-dev-key',
  gatewayMode: process.env.GATEWAY_MODE ?? 'simulated',
  gatewayDelayScale: num('GATEWAY_DELAY_SCALE', 1),
  workerIntervalMs: num('WORKER_INTERVAL_MS', 500),
  sessionTtlHours: num('SESSION_TTL_HOURS', 24),
  isTest: process.env.NODE_ENV === 'test',
} as const;

if (config.gatewayMode !== 'simulated') {
  throw new Error(`GATEWAY_MODE "${config.gatewayMode}" não suportado: apenas "simulated" neste MVP`);
}
