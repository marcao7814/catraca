#!/usr/bin/env node
// Valida project-state.json: todas as features do PRD presentes, status válido e,
// para status "done", relatório mais recente existente e com veredito APPROVED.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname } from 'node:path';

const EXPECTED = ['F01', 'F02', 'F03', 'F04', 'F05', 'F06', 'F07', 'F08'];
const STATUSES = ['todo', 'in_progress', 'in_review', 'changes_requested', 'done'];
const state = JSON.parse(readFileSync('project-state.json', 'utf8'));
const errors = [];

const ids = state.features.map((f) => f.id);
for (const id of EXPECTED) if (!ids.includes(id)) errors.push(`feature ${id} ausente`);

for (const f of state.features) {
  if (!STATUSES.includes(f.status)) errors.push(`${f.id}: status inválido "${f.status}"`);
  if (f.latestReport) {
    if (!existsSync(f.latestReport)) {
      errors.push(`${f.id}: relatório ${f.latestReport} não existe`);
      continue;
    }
    // O relatório apontado precisa ser o mais recente da pasta (nomes ordenáveis por data).
    const dir = dirname(f.latestReport);
    const newest = readdirSync(dir).filter((n) => n.endsWith('.md')).sort().at(-1);
    if (!f.latestReport.endsWith(newest)) errors.push(`${f.id}: relatório mais recente é ${newest}`);
  }
  if (f.status === 'done') {
    if (!f.latestReport) errors.push(`${f.id}: done sem latestReport`);
    else if (existsSync(f.latestReport) && !/Veredito geral:\s*\**APPROVED/i.test(readFileSync(f.latestReport, 'utf8')))
      errors.push(`${f.id}: relatório mais recente não está APPROVED`);
  }
}

if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
const summary = state.features.map((f) => `${f.id}=${f.status}`).join(' ');
console.log(`check-state: OK (${summary})`);
