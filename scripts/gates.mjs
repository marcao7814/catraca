#!/usr/bin/env node
// Gates do projeto. Só exige Docker, Git e Node no host.
// 1) lint + typecheck + testes (unidade, integração, e2e) em container contra um Postgres efêmero
// 2) relatórios de avaliação imutáveis (scripts/check-reports.mjs)
// 3) project-state.json coerente (scripts/check-state.mjs)
import { spawnSync } from 'node:child_process';

const compose = ['compose', '-f', 'compose.yml', '-f', 'compose.test.yml', '--profile', 'test'];

function run(cmd, args, label) {
  console.log(`\n=== gate: ${label} ===`);
  const r = spawnSync(cmd, args, { stdio: 'inherit' });
  return r.status ?? 1;
}

let code = run('docker', [...compose, 'run', '--rm', '--build', 'gates'], 'lint + typecheck + testes');
// Derruba o banco efêmero mesmo se os testes falharem.
spawnSync('docker', [...compose, 'rm', '-sf', 'db_test'], { stdio: 'ignore' });

if (code === 0) code = run(process.execPath, ['scripts/check-reports.mjs'], 'relatórios imutáveis');
if (code === 0) code = run(process.execPath, ['scripts/check-state.mjs'], 'estado do projeto');

console.log(code === 0 ? '\nGATES: OK' : `\nGATES: FALHOU (código ${code})`);
process.exit(code);
