import { defineConfig } from 'oxfmt'
import ultracite from 'ultracite/oxfmt'

export default defineConfig({
  ...ultracite,
  semi: false,
  singleQuote: true,
  tabWidth: 2,
  trailingComma: 'none',
  useTabs: false,
  arrowParens: 'avoid',
  endOfLine: 'lf',
  sortImports: {
    ignoreCase: true,
    newlinesBetween: true,
    order: 'asc',
    groups: [
      'value-builtin',
      'value-external',
      ['value-internal', 'value-subpath'],
      ['value-parent', 'value-sibling', 'value-index'],
      'type-builtin',
      'type-external',
      ['type-internal', 'type-subpath'],
      ['type-parent', 'type-sibling', 'type-index'],
      'side_effect',
      'style',
      'unknown'
    ]
  },
  overrides: [
    {
      files: ['src/plugin/errors/codes.ts'],
      options: { printWidth: 100 }
    }
  ]
})
