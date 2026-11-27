// Fronteiras entre módulos seguem o grafo de dependências do PRD (docs/prd.md §4).
// Um módulo só importa os módulos das features das quais depende.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

const ALL = ['auth', 'events', 'sales', 'storefront', 'partner-api', 'cancellation', 'checkin', 'dashboard'];
const ALLOWED = {
  auth: [],
  events: ['auth'],
  sales: ['events'],
  storefront: ['auth', 'events', 'sales'],
  'partner-api': ['events', 'sales'],
  cancellation: ['auth', 'events', 'sales'],
  checkin: ['auth', 'events', 'sales', 'cancellation'],
  dashboard: ['auth', 'events', 'sales', 'checkin', 'cancellation'],
};

const boundaries = ALL.map((mod) => {
  const forbidden = ALL.filter((m) => m !== mod && !ALLOWED[mod].includes(m));
  return {
    files: [`src/modules/${mod}/**/*.ts`],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: forbidden.map((m) => ({
            group: [`**/modules/${m}/**`, `../${m}/**`, `../${m}`],
            message: `O módulo "${mod}" não pode importar "${m}" (grafo de dependências do PRD).`,
          })),
        },
      ],
    },
  };
});

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**', 'coverage/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { process: 'readonly', console: 'readonly', URL: 'readonly' } },
    rules: { '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }] },
  },
  ...boundaries,
);
