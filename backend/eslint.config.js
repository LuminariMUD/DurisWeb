import path from 'node:path';
import { fileURLToPath } from 'node:url';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';

const backendRoot = path.dirname(fileURLToPath(import.meta.url));
const ENTRY = {
  module: path.join(backendRoot, 'src/index'),
  message: 'Do not import the executable entry (src/index.ts); import the owning module.',
};
const APP = {
  module: path.join(backendRoot, 'src/app'),
  message: 'Features and services must not import app.ts (docs/ARCHITECTURE.md).',
};
const RUNTIME = {
  module: `${path.join(backendRoot, 'src/runtime')}/`,
  message: 'Features and services must not import runtime/ (docs/ARCHITECTURE.md).',
};

/** Report relative imports that resolve to a listed module; a trailing `/` lists a directory. */
const noForbiddenImports = {
  meta: { type: 'problem', schema: [{ type: 'array' }] },
  create(context) {
    const targets = context.options[0] ?? [];
    const check = (node) => {
      const spec = node.source?.value;
      if (typeof spec !== 'string' || !spec.startsWith('.')) return;
      const resolved = path.resolve(path.dirname(context.filename), spec).replace(/\.(js|ts)$/, '');
      // A directory specifier loads its index module.
      const candidates = [resolved, path.join(resolved, 'index')];
      const target = targets.find(({ module }) =>
        module.endsWith('/')
          ? candidates.some((candidate) => `${candidate}/`.startsWith(module))
          : candidates.includes(module),
      );
      if (target) context.report({ node: node.source, message: target.message });
    };
    return {
      ImportDeclaration: check,
      ExportNamedDeclaration: check,
      ExportAllDeclaration: check,
      ImportExpression: check,
    };
  },
};

export default [
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'coverage/**',
      'migrations/**',
      'test/**',
      '*.config.js',
      '*.config.ts',
      'knexfile.ts',
      'test-*.js',
    ],
  },
  {
    files: ['src/**/*.ts', 'scripts/**/*.ts'],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
    },
    rules: {
      // TypeScript specific rules
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off', // Allow ! operator when developer verified non-null

      // General rules
      'no-console': 'off', // Allow console in backend
      'no-debugger': 'warn',
      'prefer-const': 'error',
      'no-var': 'error',
    },
  },
  {
    // Nothing imports the executable entry, however the relative specifier is spelled.
    files: ['src/**/*.ts', 'scripts/**/*.ts'],
    plugins: { local: { rules: { 'no-forbidden-imports': noForbiddenImports } } },
    rules: { 'local/no-forbidden-imports': ['error', [ENTRY]] },
  },
  {
    // Import direction (docs/ARCHITECTURE.md): features and services sit below the app.
    // Options replace the block above for these files, so the entry stays listed.
    files: ['src/features/**/*.ts', 'src/services/**/*.ts'],
    ignores: ['**/__tests__/**'],
    rules: { 'local/no-forbidden-imports': ['error', [ENTRY, APP, RUNTIME]] },
  },
];
