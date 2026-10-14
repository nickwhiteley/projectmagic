import { expect, test } from '@playwright/test';

test('signed out, the home page sends you to sign in', async ({ page }) => {
	await page.goto('/');
	await expect(page).toHaveURL(/\/signin\?next=%2F$/);
	await expect(page.getByRole('link', { name: 'Sign in with GitHub' })).toHaveAttribute(
		'href',
		'/auth/github?next=%2F'
	);
});

test('an unknown route is a 404', async ({ page }) => {
	const res = await page.goto('/no/such/page');
	expect(res?.status()).toBe(404);
});
