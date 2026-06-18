import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    ignores: ['dist/**', 'node_modules/**', 'release/**', 'out/**', 'scripts/**', '_reference/**'],
  },
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'no-console': 'off',
    },
  },
  {
    files: ['electron/**/*.ts'],
    ignores: ['electron/preload.ts'],
    languageOptions: {
      parserOptions: {
        project: './tsconfig.json',
        tsconfigRootDir: __dirname,
      },
    },
  },
  {
    files: ['electron/preload.ts'],
    languageOptions: {
      parserOptions: {
        project: './electron/tsconfig.preload.json',
        tsconfigRootDir: __dirname,
      },
    },
  },
  {
    files: ['src/**/*.js'],
    ...tseslint.configs.disableTypeChecked,
    rules: {
      'no-undef': 'off',
    },
  },
);
