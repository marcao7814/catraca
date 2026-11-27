#!/usr/bin/env node
// Roda o Vitest no container dos gates, contra o Postgres efêmero, com argumentos livres.
// Uso: npm run test:docker -- test/integration/events.test.ts -t "C7"
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

// Projeto Compose próprio por pasta: worktrees em paralelo não compartilham o banco de teste
// e os gates não interferem no app em execução (projeto "catraca").
const project = `catraca-gates-${createHash('sha1').update(process.cwd()).digest('hex').slice(0, 8)}`;
const compose = ['compose', '-p', project, '-f', 'compose.yml', '-f', 'compose.test.yml', '--profile', 'test'];
const args = process.argv.slice(2);

const r = spawnSync('docker', [...compose, 'run', '--rm', '--build', 'gates', 'npx', 'vitest', 'run', ...args], {
  stdio: 'inherit',
});
spawnSync('docker', [...compose, 'rm', '-sf', 'db_test'], { stdio: 'ignore' });
process.exit(r.status ?? 1);
