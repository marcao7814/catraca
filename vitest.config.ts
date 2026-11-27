import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    globalSetup: ['test/global-setup.ts'],
    fileParallelism: false,
    // Folga para os testes de carga (rajadas, corrida 50×) em máquina compartilhada por vários worktrees.
    testTimeout: 120_000,
    hookTimeout: 60_000,
  },
});
