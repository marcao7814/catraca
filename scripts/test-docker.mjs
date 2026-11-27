#!/usr/bin/env node
// Roda o Vitest no container dos gates, contra o Postgres efêmero, com argumentos livres.
// Uso: npm run test:docker -- test/integration/events.test.ts -t "C7"
import { spawnSync } from 'node:child_process';

const compose = ['compose', '-f', 'compose.yml', '-f', 'compose.test.yml', '--profile', 'test'];
const args = process.argv.slice(2);

const r = spawnSync('docker', [...compose, 'run', '--rm', '--build', 'gates', 'npx', 'vitest', 'run', ...args], {
  stdio: 'inherit',
});
spawnSync('docker', [...compose, 'rm', '-sf', 'db_test'], { stdio: 'ignore' });
process.exit(r.status ?? 1);
