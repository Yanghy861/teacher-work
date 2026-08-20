import eslint from '@eslint/js'
import globals from 'globals'
import { builtinModules } from 'node:module'
import tseslint from 'typescript-eslint'

const nodeBuiltinModuleNames = new Set(
  builtinModules.flatMap((moduleName) => {
    const bareModuleName = moduleName.startsWith('node:') ? moduleName.slice(5) : moduleName
    return [bareModuleName, `node:${bareModuleName}`]
  }),
)

export default tseslint.config(
  {
    ignores: ['node_modules/**', 'out/**', 'dist/**', 'coverage/**', 'release/**', 'tmp/**', 'temp/**'],
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
    files: ['spikes/**/*.mjs'],
    languageOptions: {
      globals: {
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
            ...nodeBuiltinModuleNames,
            'electron',
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
