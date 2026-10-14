import { expect, test } from '@playwright/test';
import { createHmac } from 'node:crypto';
import { existsSync } from 'node:fs';

// Signed in against the configured database, so it runs where .env is set up, and is skipped
// elsewhere. It guards PM13's bug: moving between projects in the browser kept the first one's page.
test.skip(!existsSync('.env'), 'needs .env and a synced database');

test('moving from one project to another shows the other project', async ({ page, context }) => {
	process.loadEnvFile('.env');
	const v = `1:${Math.floor(Date.now() / 1000)}`;
	const value = `${v}.${createHmac('sha256', process.env.SESSION_SECRET!).update(v).digest('base64url')}`;
	await context.addCookies([
		{ name: 'pm_session', value, domain: 'localhost', path: '/', httpOnly: true }
	]);

	await page.goto('/');
	const links = page.locator('aside nav[aria-label="Projects"] a');
	test.skip((await links.count()) < 2, 'needs two projects');
	const [first, second] = [links.nth(0), links.nth(1)];
	const names = [(await first.textContent())!.trim(), (await second.textContent())!.trim()];

	await first.click();
	await expect(page.locator('main .head h1')).toHaveText(names[0]);
	await second.click();
	await expect(page.locator('main .head h1')).toHaveText(names[1]);
	await page.locator('nav.tabs a', { hasText: 'Board' }).click();
	await first.click();
	await expect(page.locator('main .head h1')).toHaveText(names[0]);
});
