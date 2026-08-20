import eslint from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  {
    ignores: ['node_modules/**', 'out/**', 'dist/**', 'coverage/**', 'release/**'],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
  },
  {
    files: ['src/renderer/**/*.{ts,tsx}'],
    languageOptions: {
      globals: {
        process: 'off',
        Buffer: 'off',
        require: 'off',
        module: 'off',
        exports: 'off',
        global: 'off',
        __dirname: 'off',
        __filename: 'off',
        setImmediate: 'off',
        clearImmediate: 'off',
        NodeJS: 'off',
      },
    },
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            'electron',
            'fs',
            'path',
            'os',
            'crypto',
            'child_process',
            'better-sqlite3',
            'sqlite3',
          ],
          patterns: [
            {
              group: ['node:*', '**/main/**'],
              message: 'Renderer must use the typed Preload API instead of Main or Node APIs.',
            },
          ],
        },
      ],
      'no-restricted-globals': [
        'error',
        'process',
        'Buffer',
        'require',
        'module',
        'exports',
        'global',
        '__dirname',
        '__filename',
        'setImmediate',
        'clearImmediate',
        'NodeJS',
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: 'ImportExpression',
          message: 'Renderer dynamic imports must not load process, Main, or database modules.',
        },
        {
          selector: "CallExpression[callee.name='require']",
          message: 'Renderer must not use require.',
        },
      ],
    },
  },
)
