#!/usr/bin/env node
// Cada relatório de avaliação (features/*/reports/*.md) é imutável:
// aparece em exatamente um commit e não tem alteração pendente na árvore de trabalho.
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { posix } from 'node:path';

const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
const errors = [];
let checked = 0;

if (existsSync('features')) {
  for (const feature of readdirSync('features')) {
    const dir = posix.join('features', feature, 'reports');
    if (!existsSync(dir)) continue;
    for (const file of readdirSync(dir).filter((f) => f.endsWith('.md'))) {
      const path = posix.join(dir, file);
      const commits = git('log', '--format=%H', '--', path).split('\n').filter(Boolean);
      const dirty = git('status', '--porcelain', '--', path);
      checked++;
      if (commits.length === 0) {
        console.warn(`aviso: ${path} ainda não foi commitado`);
      } else if (commits.length > 1) {
        errors.push(`${path} foi alterado depois de commitado (${commits.length} commits)`);
      } else if (dirty) {
        errors.push(`${path} tem alteração não commitada (relatórios são imutáveis)`);
      }
    }
  }
}

if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log(`check-reports: ${checked} relatório(s) verificados, nenhum alterado`);
