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
  module: `${path.join(backendRoot, 'src/runtime')}${path.sep}`,
  message: 'Features and services must not import runtime/ (docs/ARCHITECTURE.md).',
};

/** A trailing native path separator marks a directory of forbidden modules. */
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
        module.endsWith(path.sep)
          ? candidates.some((candidate) => `${candidate}${path.sep}`.startsWith(module))
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

/** Cover direct caught-error properties while preserving explicit public-error branches. */
const noRawErrorResponse = {
  meta: { type: 'problem', schema: [] },
  create(context) {
    const publicGuard = (test, name) => {
      if (test?.type === 'LogicalExpression') {
        const left = publicGuard(test.left, name);
        const right = publicGuard(test.right, name);
        return test.operator === '&&' ? left || right : left && right;
      }
      return (
        (test?.type === 'CallExpression' &&
          test.callee.name === 'isPublicError' &&
          test.arguments[0]?.name === name) ||
        (test?.type === 'BinaryExpression' &&
          test.operator === 'instanceof' &&
          test.left.name === name &&
          test.right.type === 'Identifier' &&
          ![
            'Error',
            'TypeError',
            'RangeError',
            'SyntaxError',
            'ReferenceError',
            'URIError',
            'EvalError',
            'AggregateError',
          ].includes(test.right.name))
      );
    };
    const unsafeProperty = (node) => {
      if (
        node.type !== 'MemberExpression' ||
        !['message', 'stack'].includes(node.computed ? node.property.value : node.property.name)
      )
        return false;
      let object = node.object;
      while (['TSAsExpression', 'TSNonNullExpression', 'TSTypeAssertion'].includes(object.type))
        object = object.expression;
      if (object.type !== 'Identifier') return false;
      let caught = false;
      let child = node;
      for (let parent = node.parent; parent; child = parent, parent = parent.parent) {
        if (
          (parent.type === 'IfStatement' || parent.type === 'ConditionalExpression') &&
          child === parent.consequent &&
          publicGuard(parent.test, object.name)
        )
          return false;
        if (parent.type === 'CatchClause' && parent.param?.name === object.name) {
          caught = true;
          break;
        }
      }
      return caught;
    };
    const rawProperty = (node) => {
      if (!node || typeof node.type !== 'string') return undefined;
      if (unsafeProperty(node)) return node;
      for (const key of context.sourceCode.visitorKeys[node.type] ?? []) {
        for (const child of Array.isArray(node[key]) ? node[key] : [node[key]]) {
          const found = rawProperty(child);
          if (found) return found;
        }
      }
      return undefined;
    };
    return {
      CallExpression(node) {
        if (
          node.callee.type !== 'MemberExpression' ||
          !['json', 'send', 'write', 'end'].includes(node.callee.property.name)
        )
          return;
        for (const arg of node.arguments) {
          const found = rawProperty(arg);
          if (found)
            context.report({
              node: found,
              message:
                'Do not send caught error properties; use a typed public error or sendRouteError.',
            });
        }
      },
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
    plugins: {
      local: {
        rules: {
          'no-forbidden-imports': noForbiddenImports,
          'no-raw-error-response': noRawErrorResponse,
        },
      },
    },
    rules: { 'local/no-forbidden-imports': ['error', [ENTRY]] },
  },
  {
    // Import direction (docs/ARCHITECTURE.md): features and services sit below the app.
    // Options replace the block above for these files, so the entry stays listed.
    files: ['src/features/**/*.ts', 'src/services/**/*.ts'],
    ignores: ['**/__tests__/**'],
    rules: { 'local/no-forbidden-imports': ['error', [ENTRY, APP, RUNTIME]] },
  },
  {
    // Responses never carry the text of an unexpected error (#176). Throw AppError for
    // messages meant for users and send everything else through utils/routeError.ts.
    files: ['src/routes/**/*.ts', 'src/features/**/*.ts', 'src/realtime/**/*.ts'],
    ignores: ['**/__tests__/**'],
    rules: {
      'local/no-raw-error-response': 'error',
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "CallExpression[callee.property.name=/^(json|send|write|end)$/] CallExpression[callee.name='getErrorMessage']",
          message: 'Do not send error text to clients; use sendRouteError or AppError.',
        },
        {
          selector:
            "ConditionalExpression[test.operator='instanceof'][test.right.name='Error'] > MemberExpression.consequent[property.name='message']",
          message:
            'Route code must not pick raw error text; use allowlisted log codes and sendRouteError.',
        },
      ],
    },
  },
];
