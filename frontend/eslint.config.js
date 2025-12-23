import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores([
    'dist',
    'node_modules',
    'src/routeTree.gen.ts',
    '*.tsbuildinfo',
    '.vite',
    'coverage',
  ]),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    rules: {
      // Allow shadcn components to export variants alongside components
      'react-refresh/only-export-components': [
        'warn',
        { allowExportNames: ['badgeVariants', 'buttonVariants'] },
      ],
      // Allow setState in useEffect for syncing state with props/external data
      // This is a common and legitimate pattern
      'react-hooks/set-state-in-effect': 'off',
      // Allow unused variables prefixed with _
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  {
    // Disable react-refresh for UI components (shadcn generated)
    files: ['src/components/ui/**/*.{ts,tsx}'],
    rules: {
      'react-refresh/only-export-components': 'off',
    },
  },
])
