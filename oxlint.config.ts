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
    },
    {
      files: ['src/core/**/*.ts'],
      rules: {
        'no-restricted-imports': [
          'error',
          {
            patterns: [
              {
                group: [
                  'better-auth',
                  'better-auth/**',
                  '@better-auth/**',
                  'better-call',
                  'zod'
                ],
                message:
                  'The domain stays independent of the framework; reach Better Auth from plugin/.'
              },
              {
                group: [
                  '@/plugin',
                  '@/plugin/**',
                  '@/security',
                  '@/security/**'
                ],
                message: 'The domain depends on nothing but itself and types/.'
              }
            ]
          }
        ]
      }
    },
    {
      files: ['src/security/**/*.ts'],
      rules: {
        'no-restricted-imports': [
          'error',
          {
            patterns: [
              {
                group: [
                  'better-auth',
                  'better-auth/**',
                  '@better-auth/**',
                  'better-call',
                  'zod'
                ],
                message:
                  'Codes, grants and keys are computed without the framework.'
              },
              {
                group: ['@/core', '@/core/**', '@/plugin', '@/plugin/**'],
                message:
                  'security/ computes over codes, grants and keys and knows no room.'
              }
            ]
          }
        ]
      }
    },
    {
      files: ['src/types/**/*.ts'],
      rules: {
        'no-restricted-imports': [
          'error',
          {
            patterns: [
              {
                group: [
                  '@/**',
                  'better-auth',
                  'better-auth/**',
                  '@better-auth/**'
                ],
                message:
                  'types/ holds shared type definitions that depend on nothing.'
              }
            ]
          }
        ]
      }
    },
    {
      files: ['src/plugin/stores/**/*.ts'],
      rules: {
        'no-restricted-imports': [
          'error',
          {
            patterns: [
              {
                group: ['@/plugin/endpoints/**'],
                message:
                  'A store reads and writes through the adapter and knows nothing of HTTP.'
              }
            ]
          }
        ]
      }
    }
  ]
})
