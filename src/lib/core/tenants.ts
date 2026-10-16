// Tenant names, slugs and the sign-up modes (specs/tenants.md §3.2, §8.1). Pure.

export const SIGNUP_MODES = ['open', 'approval', 'closed'] as const;
export type SignupMode = (typeof SIGNUP_MODES)[number];

/** `closed` unless a platform admin chose otherwise, so a self-hosted copy behaves as today. */
export const parseSignup = (v: unknown): SignupMode =>
	(SIGNUP_MODES as readonly unknown[]).includes(v) ? (v as SignupMode) : 'closed';

/** A slug suggested from a name: lower case, `a-z0-9-`, at most 40 characters. */
export function slugify(name: string): string {
	return name
		.normalize('NFKD')
		.replace(/[̀-ͯ]/g, '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 40)
		.replace(/-+$/, '');
}

const SLUG = /^[a-z0-9-]{3,40}$/;
/** Slugs that would collide with the app's own addresses or read as the service itself. */
const RESERVED = new Set([
	'admin',
	'api',
	'app',
	'auth',
	'default-tenant',
	'platform',
	'support',
	'www'
]);

/** Why a slug can't be used, or null. */
export function slugProblem(slug: string): string | null {
	if (!SLUG.test(slug)) return 'Use 3 to 40 lower-case letters, numbers and hyphens.';
	if (slug.startsWith('-') || slug.endsWith('-'))
		return 'A slug cannot start or end with a hyphen.';
	if (RESERVED.has(slug)) return 'That name is reserved.';
	return null;
}

/** Why a tenant name can't be used, or null. */
export function nameProblem(name: string): string | null {
	const n = name.trim();
	if (n.length < 2) return 'Give the tenant a name.';
	if (n.length > 80) return 'Keep the name under 80 characters.';
	return null;
}

/** What a tenant's status means to the people in it. */
export const STATUS_NOTICE: Record<string, string> = {
	pending:
		'This tenant is waiting for approval. You will be able to connect GitHub once it is approved.',
	suspended:
		'This tenant has been suspended. Nothing is deleted. Contact the people who run this service.',
	deleted: 'This tenant has been deleted.'
};

/** Days a deleted tenant's data is kept before the cron purges it (§8.4). */
export const PURGE_AFTER_DAYS = 30;
/** Days an installation can stay unclaimed before platform admins are shown it as stale (§3.2). */
export const UNCLAIMED_STALE_DAYS = 7;
