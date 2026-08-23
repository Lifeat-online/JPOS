// @ts-check
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'coverage/**',
      'android/**',
      'desktop/**',
      'public/**',
      'playwright-report/**',
      'test-results/**',
      '*.config.ts',
      'eslint.config.js',
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.tsx', '**/*.jsx'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-empty-object-type': 'off',
      // TypeScript's compiler already catches undefined identifiers;
      // no-undef misfires on ambient/globals under ESM+TS.
      'no-undef': 'off',
      'no-empty': ['error', { allowEmptyCatch: true }],
      // Ambient `declare global namespace Express` augmentations are
      // idiomatic TypeScript, not legacy namespaces.
      '@typescript-eslint/no-namespace': 'off',
    },
  },
);

