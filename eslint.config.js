import prettier from 'eslint-config-prettier';
import path from 'node:path';
import js from '@eslint/js';
import svelte from 'eslint-plugin-svelte';
import { defineConfig, includeIgnoreFile } from 'eslint/config';
import globals from 'globals';
import ts from 'typescript-eslint';

const gitignorePath = path.resolve(import.meta.dirname, '.gitignore');

export default defineConfig(
	includeIgnoreFile(gitignorePath),
	{ ignores: ['spikes/', 'design/stitch/', 'test/fixtures/'] },
	js.configs.recommended,
	ts.configs.recommended,
	svelte.configs.recommended,
	prettier,
	svelte.configs.prettier,
	{
		languageOptions: { globals: { ...globals.browser, ...globals.node } },
		rules: {
			// typescript-eslint strongly recommend that you do not use the no-undef lint rule on TypeScript projects.
			// see: https://typescript-eslint.io/troubleshooting/faqs/eslint/#i-get-errors-from-the-no-undef-rule-about-global-variables-not-being-defined-even-though-there-are-no-typescript-errors
			'no-undef': 'off',
			// Every {@html} is markdown rendered on the server through rehype-sanitize (render.ts,
			// spec §11.3), never raw text from a branch.
			'svelte/no-at-html-tags': 'off',
			// The app has no base path, so its absolute hrefs need no resolve().
			'svelte/no-navigation-without-resolve': 'off'
		}
	},
	{
		files: ['**/*.svelte', '**/*.svelte.ts', '**/*.svelte.js'],
		languageOptions: {
			parserOptions: {
				projectService: true,
				extraFileExtensions: ['.svelte'],
				parser: ts.parser
			}
		}
	},
	{
		// The core is pure: no I/O and nothing from the server shell (spec §12).
		files: ['src/lib/core/**/*.ts'],
		ignores: ['src/lib/core/**/*.test.ts', 'src/lib/core/fixtures.ts'],
		rules: {
			'no-restricted-imports': [
				'error',
				{
					patterns: [
						{ group: ['node:*', 'fs', 'path', 'http', 'https'], message: 'The core does no I/O.' },
						{
							group: ['#lib/server/*', '$lib/server/*', '../server/*'],
							message: 'The core is pure.'
						}
					]
				}
			]
		}
	}
);
