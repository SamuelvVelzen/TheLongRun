import js from '@eslint/js';
import eslintConfigPrettier from 'eslint-config-prettier';
import importX from 'eslint-plugin-import-x';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
	{
		ignores: [
			'dist/**',
			'.output/**',
			'node_modules/**',
			'.wrangler/**',
			'src/routeTree.gen.ts'
		]
	},
	js.configs.recommended,
	...tseslint.configs.recommended,
	react.configs.flat.recommended,
	react.configs.flat['jsx-runtime'],
	eslintConfigPrettier,
	{
		files: ['**/*.{js,mjs,cjs,ts,tsx}'],
		plugins: {
			'react-hooks': reactHooks,
			'react-refresh': reactRefresh,
			'import-x': importX
		},
		languageOptions: {
			ecmaVersion: 2022,
			sourceType: 'module',
			globals: {
				...globals.browser,
				...globals.node
			},
			parserOptions: {
				ecmaFeatures: { jsx: true }
			}
		},
		settings: {
			react: { version: 'detect' },
			'import-x/resolver': {
				typescript: {
					project: './tsconfig.json',
					alwaysTryTypes: true
				},
				node: true
			}
		},
		rules: {
			'react-hooks/rules-of-hooks': 'error',
			'react-hooks/exhaustive-deps': 'warn',
			'react/prop-types': 'off',
			'react/no-children-prop': 'off',
			'react/no-unescaped-entities': 'off',
			'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
			'import-x/first': 'error',
			'import-x/no-duplicates': 'error',
			'@typescript-eslint/no-unused-vars': [
				'warn',
				{
					argsIgnorePattern: '^_',
					varsIgnorePattern: '^_',
					caughtErrorsIgnorePattern: '^_'
				}
			],
			'@typescript-eslint/consistent-type-imports': [
				'warn',
				{ prefer: 'type-imports', fixStyle: 'inline-type-imports' }
			],
			'no-restricted-imports': [
				'error',
				{
					paths: [
						{
							name: '../components/Dialog',
							message: 'Import Dialog from ../components/ui (or ./ui under components).'
						},
						{
							name: '../components/Snackbar',
							message: 'Import snackbar helpers from ../components/ui.'
						},
						{
							name: '../components/PageHero',
							message: 'Import PageHero from ../components/ui.'
						}
					],
					patterns: [
						{
							group: ['**/components/Dialog', '!**/components/ui/**'],
							message: 'Use the ui barrel instead of legacy component shims.'
						},
						{
							group: ['**/components/Snackbar', '!**/components/ui/**'],
							message: 'Use the ui barrel instead of legacy component shims.'
						},
						{
							group: ['**/components/PageHero', '!**/components/ui/**'],
							message: 'Use the ui barrel instead of legacy component shims.'
						}
					]
				}
			]
		}
	},
	{
		files: ['src/components/**/*.{ts,tsx}'],
		rules: {
			'no-restricted-imports': [
				'error',
				{
					paths: [
						{
							name: './Dialog',
							message: 'Import from ./ui instead of the Dialog shim.'
						},
						{
							name: './Snackbar',
							message: 'Import from ./ui instead of the Snackbar shim.'
						},
						{
							name: './PageHero',
							message: 'Import from ./ui instead of the PageHero shim.'
						}
					]
				}
			]
		}
	},
	{
		files: ['src/components/ui/**/*.{ts,tsx}'],
		rules: {
			'no-restricted-imports': 'off'
		}
	},
	{
		files: ['src/components/Dialog.tsx', 'src/components/Snackbar.tsx', 'src/components/PageHero.tsx'],
		rules: {
			'no-restricted-imports': 'off'
		}
	},
	{
		files: ['src/routes/**/*.{ts,tsx}'],
		rules: {
			'react-refresh/only-export-components': 'off'
		}
	},
	{
		files: ['src/lib/server/**/*.{ts,tsx}'],
		rules: {
			// TanStack Start `useSession` is server session API, not a React hook.
			'react-hooks/rules-of-hooks': 'off'
		}
	}
);
