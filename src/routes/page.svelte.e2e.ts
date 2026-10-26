import { expect, test } from '@playwright/test';

test('signed out, the home page explains Project Magic', async ({ page }) => {
	await page.goto('/');
	await expect(page.locator('h1')).toHaveText(
		'See every project your agents are building, without asking each one.'
	);
	await expect(page.getByRole('link', { name: 'Sign in', exact: true })).toHaveAttribute('href', '/signin');
});

test('the sign-in page starts the GitHub sign-in, and project pages need it', async ({ page }) => {
	await page.goto('/p/anything');
	await expect(page).toHaveURL(/\/signin\?next=%2Fp%2Fanything$/);
	await expect(page.getByRole('link', { name: 'Sign in with GitHub' })).toHaveAttribute(
		'href',
		'/auth/github?next=%2Fp%2Fanything'
	);
});

test('an unknown route is a 404', async ({ page }) => {
	const res = await page.goto('/no/such/page');
	expect(res?.status()).toBe(404);
});
