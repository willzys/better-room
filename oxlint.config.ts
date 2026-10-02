import { defineConfig } from 'oxlint'
import core from 'ultracite/oxlint/core'

export default defineConfig({
  categories: {
    correctness: 'error',
    suspicious: 'error',
    perf: 'warn'
  },
  ...(core.ignorePatterns && { ignorePatterns: core.ignorePatterns }),
  ...(core.plugins && {
    plugins: core.plugins.filter(
      plugin => !['jsdoc', 'node', 'promise'].includes(plugin)
    )
  }),
  rules: {
    'no-debugger': 'error',
    'no-unused-vars': 'error',
    'no-unreachable': 'error',
    'no-duplicate-case': 'error',
    'prefer-const': 'error',
    'no-var': 'error',
    eqeqeq: 'error',
    'typescript/no-explicit-any': 'warn',
    complexity: ['warn', { max: 10 }],
    'max-depth': ['warn', { max: 3 }],
    'max-params': ['warn', { max: 4 }],
    'max-lines-per-function': [
      'warn',
      {
        max: 60,
        skipBlankLines: true,
        skipComments: true
      }
    ],
    'unicorn/max-nested-calls': ['warn', { max: 3 }],
    'unicorn/no-new-array': 'off',
    'unicorn/no-thenable': 'off',
    'unicorn/no-useless-fallback-in-spread': 'off'
  },
  overrides: [
    {
      files: ['src/**/*.ts'],
      rules: {
        'import/no-nodejs-modules': 'error'
      }
    }
  ]
})
