// Project Magic's own health (EP2, spec §22): the pure part. What the server records is gathered
// into a snapshot, and the rules here decide what needs a platform admin's attention, how to fix
// it, and which of those are worth an alert. The Operations tab and the alerts read the same list,
// so a problem on the screen and a problem in Slack are the same problem.

/** A message, with the parts that differ between occurrences of the same fault taken out. */
export function normaliseMessage(message: string): string {
	return message
		.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '<id>')
		.replace(/\b[0-9a-f]{12,40}\b/gi, '<sha>')
		.replace(/"[^"]{0,200}"|'[^']{0,200}'/g, '<str>')
		.replace(/\d+/g, '<n>')
		.replace(/\s+/g, ' ')
		.trim()
		.slice(0, 300);
}

/** FNV-1a, 32 bits, as hex: short, stable and good enough to group errors. */
function fnv(text: string): string {
	let h = 0x811c9dc5;
	for (let i = 0; i < text.length; i++) {
		h ^= text.charCodeAt(i);
		h = Math.imul(h, 0x01000193);
	}
	return (h >>> 0).toString(16).padStart(8, '0');
}

/** Errors with the same source, route and normalised message are one group. */
export function fingerprint(source: string, route: string | null, message: string): string {
	return `${source}:${fnv(`${route ?? ''}|${normaliseMessage(message)}`)}`;
}

/** An error as one line of text, at most `max` characters. */
export function errorText(e: unknown, max = 2000): string {
	const s = e instanceof Error ? e.message || e.name : typeof e === 'string' ? e : String(e);
	return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

/** Browser errors that aren't ours: extensions, and the harmless ResizeObserver warning. */
export function ignorableClientError(message: string, stack: string | null | undefined): boolean {
	return (
		/ResizeObserver loop|Script error\.?$|^Load failed$|NetworkError when attempting/i.test(
			message
		) || /(chrome|moz|safari(-web)?)-extension:\/\//.test(stack ?? '')
	);
}

/** GitHub's rate-limit headers, when a response carries them. */
export interface RateLimit {
	resource: string;
	remaining: number;
	limit: number;
	resetAt: string;
}

export function parseRateLimit(get: (name: string) => string | null): RateLimit | null {
	const remaining = Number(get('x-ratelimit-remaining'));
	const limit = Number(get('x-ratelimit-limit'));
	const reset = Number(get('x-ratelimit-reset'));
	if (!get('x-ratelimit-limit') || ![remaining, limit, reset].every(Number.isFinite)) return null;
	return {
		resource: get('x-ratelimit-resource') || 'core',
		remaining,
		limit,
		resetAt: new Date(reset * 1000).toISOString()
	};
}

/** How long to wait before trying a GitHub call again, or null not to. Status 0 is a network
 * failure or a timeout. Only calls that change nothing are retried, at most twice, and never for
 * longer than ten seconds: the function's time is short. */
export function retryDelay(r: {
	status: number;
	attempt: number;
	idempotent: boolean;
	retryAfter?: string | null;
	remaining?: string | null;
}): number | null {
	if (!r.idempotent || r.attempt >= 2) return null;
	if (r.status === 0 || r.status >= 500) return 500 * 3 ** r.attempt;
	if (r.status === 429 || r.status === 403) {
		// The primary limit resets on the hour: no use waiting here.
		if (r.remaining === '0') return null;
		const s = Number(r.retryAfter);
		if (r.retryAfter && Number.isFinite(s) && s <= 10) return Math.max(1000, s * 1000);
		return r.status === 429 ? 2000 : null;
	}
	return null;
}

/** Whether a GitHub error is the rate limit, from its status and message. */
export const isRateLimited = (message: string): boolean =>
	/rate limit|secondary rate|abuse detection/i.test(message);

/** The applied migrations against the ones this build ships. */
export function migrationDrift(
	applied: string[],
	shipped: string[]
): { missing: string[]; unknown: string[] } {
	const a = new Set(applied);
	const s = new Set(shipped);
	return {
		missing: shipped.filter((m) => !a.has(m)).sort(),
		unknown: applied.filter((m) => !s.has(m)).sort()
	};
}

export interface CronStep {
	step: string;
	ok: boolean;
	ms: number;
	error?: string;
	counts?: Record<string, number>;
	detail?: Record<string, unknown>;
}

export interface OpsSnapshot {
	now: number;
	/** The last cron run, or null if none is recorded. */
	cron: { startedAt: string; endedAt: string | null; ok: boolean | null; steps: CronStep[] } | null;
	/** Null when it couldn't be read; empty lists when all is well. */
	migrations: { missing: string[]; unknown: string[] } | null;
	/** Projects with something wrong with their sync. */
	projects: {
		id: string;
		installationId?: string;
		tenant: string;
		owner: string;
		repo: string;
		lastError: string | null;
		failingSince: string | null;
		failCount: number;
		syncStartedAt: string | null;
		missedWebhooks: number;
		deferredRuns: number;
	}[];
	installations: {
		id: string;
		tenant: string | null;
		account: string;
		suspendedAt: string | null;
		tokenError: string | null;
		createdAt: string;
	}[];
	heldEdits: {
		projectId: string;
		tenant: string;
		owner: string;
		repo: string;
		count: number;
		oldest: string;
		reason: 'claimed' | 'conflict' | 'reauth';
		login?: string | null;
	}[];
	digests: { tenantId: string; tenant: string; error: string; failedAt: string }[];
	budgets: { scope: string; resource: string; remaining: number; limit: number; resetAt: string }[];
	errors: {
		fingerprint: string;
		source: string;
		route: string | null;
		message: string;
		firstSeen: string;
		lastSeen: string;
		recent: number;
	}[];
	/** Background work that failed in the last day, by kind; syncs are counted per project above. */
	jobs: { kind: string; failed: number; lastError: string | null }[];
	webhooks: { badSignatures: number; failed: number };
}

export type Severity = 'critical' | 'warning';

/** Something a platform admin can do about a problem, posted to the Operations tab's actions. */
export interface Fix {
	action: string;
	label: string;
	params: Record<string, string>;
}

export interface Attention {
	key: string;
	severity: Severity;
	title: string;
	detail: string;
	/** What to do about it, in words. */
	remedy: string;
	href: string | null;
	fixes: Fix[];
	/** Worth an alert (PM55): bad enough, or lasted long enough. */
	alert: boolean;
}

const HOUR = 3_600_000;
/** A cron that hasn't started for this long has stopped (it runs daily). */
export const CRON_LATE_MS = 26 * HOUR;
/** A sync claimed for longer than this is presumed dead (sync-runner's STUCK_MS). */
export const STUCK_MS = 5 * 60_000;
const age = (iso: string | null | undefined, now: number) =>
	iso ? now - Date.parse(iso) : Infinity;

/** What a sync error usually means, and what to do. */
export function syncRemedy(error: string | null): string {
	const e = error ?? '';
	if (isRateLimited(e))
		return 'GitHub’s rate limit: it clears when the budget resets. If it keeps happening, the cron or webhooks are syncing too often for this installation.';
	if (/\b(401|403)\b|Bad credentials|Resource not accessible/i.test(e))
		return 'GitHub refused the App. The tenant should check the installation still includes this repository (GitHub → Settings → Applications), then Sync now.';
	if (/\b404\b|Could not resolve to a Repository|NOT_FOUND/i.test(e))
		return 'GitHub can’t find the repository: it may have been renamed, deleted or removed from the installation. Sync installations, then Sync now.';
	if (/timed? ?out|abort|ETIMEDOUT|ECONNRESET|fetch failed|\b5\d\d\b/i.test(e))
		return 'GitHub was slow or down. Sync now; if it persists, check githubstatus.com.';
	return 'Sync now. If it fails again, the error below is the place to start; it is recorded under Background work.';
}

/** Everything that needs a platform admin's attention, most serious first. */
export function attention(s: OpsSnapshot): Attention[] {
	const out: Attention[] = [];
	const { now } = s;
	const proj = (p: { owner: string; repo: string; tenant: string }) =>
		`${p.owner}/${p.repo} (${p.tenant})`;

	// The cron (PM47).
	if (!s.cron)
		out.push({
			key: 'cron:never',
			severity: 'warning',
			title: 'The daily cron has never run',
			detail:
				'No cron run is recorded, so missed webhooks, billing and digests are never caught up.',
			remedy:
				'Check that vercel.json’s cron is deployed and CRON_SECRET is set in the project’s environment. Run it now to test.',
			href: '/admin/ops#cron',
			fixes: [{ action: 'cron', label: 'Run the cron now', params: {} }],
			alert: true
		});
	else {
		if (age(s.cron.startedAt, now) > CRON_LATE_MS)
			out.push({
				key: 'cron:late',
				severity: 'critical',
				title: 'The daily cron has stopped',
				detail: `It last started ${Math.round(age(s.cron.startedAt, now) / HOUR)} hours ago.`,
				remedy:
					'Check Vercel’s Cron Jobs page for the project, that CRON_SECRET is set, and that the plan still allows crons. Run it now to catch up.',
				href: '/admin/ops#cron',
				fixes: [{ action: 'cron', label: 'Run the cron now', params: {} }],
				alert: true
			});
		const failed = s.cron.steps.filter((x) => !x.ok);
		if (failed.length)
			out.push({
				key: `cron:steps:${failed.map((f) => f.step).join(',')}`,
				severity: 'warning',
				title: `The last cron run had ${failed.length === 1 ? 'a failed step' : `${failed.length} failed steps`}`,
				detail: failed.map((f) => `${f.step}: ${f.error ?? 'failed'}`).join(' · '),
				remedy: 'The other steps still ran. Fix the cause, then run the cron again.',
				href: '/admin/ops#cron',
				fixes: [{ action: 'cron', label: 'Run the cron again', params: {} }],
				alert: true
			});
	}

	// Migrations (PM56).
	if (s.migrations?.missing.length)
		out.push({
			key: 'migrations',
			severity: 'critical',
			title: 'The database is behind the code',
			detail: `Not applied: ${s.migrations.missing.join(', ')}. Features that need them are off.`,
			remedy: 'Run `make migrate` with the production DATABASE_URL.',
			href: '/admin/ops#now',
			fixes: [],
			alert: true
		});

	// Installations (PM53, PM54).
	for (const i of s.installations) {
		if (i.tokenError)
			out.push({
				key: `token:${i.id}`,
				severity: 'critical',
				title: `GitHub refuses the App’s token for ${i.account}`,
				detail: i.tokenError,
				remedy:
					'None of this installation’s projects can sync. Check the App’s private key (GITHUB_APP_PRIVATE_KEY) and that the installation still exists; Check again once fixed.',
				href: '/admin/installations',
				fixes: [{ action: 'checkToken', label: 'Check again', params: { installation: i.id } }],
				alert: true
			});
		else if (i.suspendedAt)
			out.push({
				key: `suspended:${i.id}`,
				severity: 'warning',
				title: `The installation on ${i.account} is suspended`,
				detail: `Suspended on GitHub; ${i.tenant ? `${i.tenant}’s` : 'its'} projects don’t sync.`,
				remedy: 'The account’s owner unsuspends it on GitHub. Nothing to do here unless they ask.',
				href: '/admin/installations',
				fixes: [],
				alert: false
			});
		else if (!i.tenant && age(i.createdAt, now) > 7 * 24 * HOUR)
			out.push({
				key: `unclaimed:${i.id}`,
				severity: 'warning',
				title: `The installation on ${i.account} hasn’t been claimed for a week`,
				detail: 'It syncs nothing until a tenant claims it.',
				remedy: 'Ask whoever installed it to finish setting up, or remove it on GitHub.',
				href: '/admin/installations',
				fixes: [],
				alert: false
			});
	}

	// Projects (PM50, PM52). A project whose installation's token is refused fails for that reason,
	// which is already listed once for the installation.
	const refused = new Set(s.installations.filter((i) => i.tokenError).map((i) => i.id));
	for (const p of s.projects) {
		const sync = { action: 'sync', label: 'Sync now', params: { project: p.id } };
		if (p.syncStartedAt && age(p.syncStartedAt, now) > STUCK_MS)
			out.push({
				key: `stuck:${p.id}`,
				severity: 'warning',
				title: `A sync of ${proj(p)} is stuck`,
				detail: `Claimed ${Math.round(age(p.syncStartedAt, now) / 60_000)} minutes ago and never released; the function probably timed out.`,
				remedy:
					'Clear the claim and sync again. If it recurs, the project may be too big for one function’s time.',
				href: `/admin/ops/project/${p.id}`,
				fixes: [{ action: 'unstick', label: 'Clear and sync', params: { project: p.id } }],
				alert: age(p.syncStartedAt, now) > 30 * 60_000
			});
		if (p.failCount > 0 && !(p.installationId && refused.has(p.installationId)))
			out.push({
				key: `sync:${p.id}`,
				severity: age(p.failingSince, now) > HOUR ? 'critical' : 'warning',
				title: `${proj(p)} fails to sync`,
				detail: `${p.failCount} failure${p.failCount === 1 ? '' : 's'} in a row since ${p.failingSince?.slice(0, 16).replace('T', ' ') ?? '?'}: ${p.lastError ?? 'no message'}`,
				remedy: syncRemedy(p.lastError),
				href: `/admin/ops/project/${p.id}`,
				fixes: [sync],
				alert: age(p.failingSince, now) > HOUR
			});
		if (p.missedWebhooks > 0)
			out.push({
				key: `missed:${p.id}`,
				severity: 'warning',
				title: `${proj(p)} is missing webhooks`,
				detail: `The cron found ${p.missedWebhooks} change${p.missedWebhooks === 1 ? '' : 's'} on main this week that no webhook brought.`,
				remedy:
					'Check the App’s webhook on GitHub (Settings → Developer settings → the App → Advanced): recent deliveries, the URL, and that GITHUB_WEBHOOK_SECRET matches.',
				href: `/admin/ops/project/${p.id}`,
				fixes: [],
				alert: true
			});
		if (p.deferredRuns >= 3)
			out.push({
				key: `deferred:${p.id}`,
				severity: 'warning',
				title: `The cron hasn’t reached ${proj(p)} on its last ${p.deferredRuns} runs`,
				detail: 'Its time budget runs out first.',
				remedy: 'Raise CRON_BUDGET_MS in sync-runner.ts, or sync it now by hand.',
				href: `/admin/ops/project/${p.id}`,
				fixes: [sync],
				alert: false
			});
	}

	// Edits held back (PM54).
	for (const h of s.heldEdits) {
		const where = proj(h);
		if (h.reason === 'claimed' && age(h.oldest, now) > 10 * 60_000)
			out.push({
				key: `claimed:${h.projectId}`,
				severity: 'warning',
				title: `${h.count} pending edit${h.count === 1 ? '' : 's'} in ${where} stuck while saving`,
				detail: `Claimed for saving ${Math.round(age(h.oldest, now) / 60_000)} minutes ago and never finished.`,
				remedy: 'Release them, and the next page load or webhook saves them again.',
				href: `/admin/ops/project/${h.projectId}`,
				fixes: [{ action: 'release', label: 'Release', params: { project: h.projectId } }],
				alert: age(h.oldest, now) > 30 * 60_000
			});
		else if (h.reason === 'reauth')
			out.push({
				key: `reauth:${h.projectId}:${h.login ?? ''}`,
				severity: 'warning',
				title: `${h.count} edit${h.count === 1 ? '' : 's'} in ${where} held: ${h.login ?? 'their author'} must sign in again`,
				detail:
					'Their GitHub sign-in has expired, so their batched edits can’t be committed as them.',
				remedy: `Ask ${h.login ?? 'them'} to sign in to Project Magic again; the edits then save.`,
				href: `/admin/ops/project/${h.projectId}`,
				fixes: [],
				alert: false
			});
	}

	// Digests (PM54).
	for (const d of s.digests)
		out.push({
			key: `digest:${d.tenantId}`,
			severity: 'warning',
			title: `${d.tenant}’s Slack digest is failing`,
			detail: d.error,
			remedy:
				'Usually Slack has revoked the webhook. The tenant’s admin sets a new one under Settings → Slack; the tenant sees this too.',
			href: `/admin/tenants/${d.tenantId}`,
			fixes: [{ action: 'digest', label: 'Send it again', params: { tenant: d.tenantId } }],
			alert: true
		});

	// GitHub's budget (PM53).
	for (const b of s.budgets) {
		if (!b.limit || b.remaining / b.limit >= 0.2 || Date.parse(b.resetAt) < now) continue;
		out.push({
			key: `budget:${b.scope}:${b.resource}`,
			severity: b.remaining / b.limit < 0.1 ? 'critical' : 'warning',
			title: `GitHub budget low for ${b.scope} (${b.resource})`,
			detail: `${b.remaining} of ${b.limit} left; resets ${b.resetAt.slice(11, 16)} UTC.`,
			remedy:
				'Syncs will start failing if it runs out. It resets on its own; look for a sync loop if it keeps happening.',
			href: '/admin/ops#github',
			fixes: [],
			alert: b.remaining / b.limit < 0.1
		});
	}

	// Errors (PM48).
	for (const e of s.errors) {
		if (!e.recent) continue;
		const fresh = age(e.firstSeen, now) < 24 * HOUR;
		out.push({
			key: `error:${e.fingerprint}`,
			severity: 'warning',
			title: `${fresh ? 'New error' : 'Error'}${e.route ? ` on ${e.route}` : ''}: ${e.recent} in the last day`,
			detail: e.message,
			remedy:
				'Open it for the stack and who met it. Resolve it once fixed; it reopens if it happens again.',
			href: `/admin/ops/errors/${encodeURIComponent(e.fingerprint)}`,
			fixes: [{ action: 'resolve', label: 'Resolve', params: { fingerprint: e.fingerprint } }],
			alert: fresh
		});
	}

	// Other background work (PM49). A failing digest is listed per tenant above.
	for (const j of s.jobs) {
		if (!j.failed || (j.kind === 'digest' && s.digests.length)) continue;
		out.push({
			key: `job:${j.kind}`,
			severity: 'warning',
			title: `${j.kind} failed ${j.failed === 1 ? 'once' : `${j.failed} times`} in the last day`,
			detail: j.lastError ?? '',
			remedy: JOB_REMEDY[j.kind] ?? 'Open Background work for each run and its error.',
			href: `/admin/ops/jobs?kind=${encodeURIComponent(j.kind)}`,
			fixes: [],
			alert: ALERT_JOBS.has(j.kind) || j.failed >= 5
		});
	}

	// Webhooks (PM52).
	if (s.webhooks.badSignatures >= 3)
		out.push({
			key: 'webhook:signature',
			severity: 'critical',
			title: `${s.webhooks.badSignatures} webhooks refused for a bad signature today`,
			detail:
				'GitHub’s deliveries don’t match GITHUB_WEBHOOK_SECRET, so no push reaches Project Magic.',
			remedy:
				'Set the same secret on the App’s webhook on GitHub and in the environment, then redeliver one from GitHub.',
			href: '/admin/ops/webhooks',
			fixes: [],
			alert: true
		});
	if (s.webhooks.failed > 0)
		out.push({
			key: 'webhook:failed',
			severity: 'warning',
			title: `${s.webhooks.failed} webhook${s.webhooks.failed === 1 ? '' : 's'} failed today`,
			detail: 'A delivery that fails is forgotten, so GitHub’s Redeliver can run it again.',
			remedy:
				'See the error on each, fix it, then redeliver from the App’s Advanced page on GitHub.',
			href: '/admin/ops/webhooks',
			fixes: [],
			alert: s.webhooks.failed >= 3
		});

	const rank = (a: Attention) => (a.severity === 'critical' ? 0 : 1);
	return out.sort((a, b) => rank(a) - rank(b));
}

const ALERT_JOBS = new Set(['billing', 'purge', 'project list']);
const JOB_REMEDY: Record<string, string> = {
	inference:
		'The model is down or refusing. Check INFERENCE_* in the environment and the provider’s status; statuses fall back to none meanwhile.',
	ask: 'The model is down or refusing. Check INFERENCE_* and the provider’s status.',
	billing:
		'Reconciling with the payment provider failed: check its keys and dashboard. Tiers stay as they were meanwhile.',
	purge:
		'Deleting tenants past their grace period failed. It is tried again tomorrow; see the error.',
	'project list':
		'Listing the App’s installations failed, so new repositories aren’t picked up. Check the App’s credentials.',
	'set up repository':
		'Opening the setup PR in a new repository failed. The App may lack write access to contents or pull requests.',
	'pr comment': 'A comment couldn’t be posted on a PR. It is still in the backlog.',
	'pending save':
		'Batched edits couldn’t be saved. They are kept, and tried again on the next page load or webhook.',
	delivery: 'Reading deploys, PRs or CI runs failed. Delivery figures may be stale.',
	digest: 'See the tenant’s digest entry above.',
	'github roles': 'Refreshing people’s roles from GitHub failed; they keep their current roles.'
};

/** The alert conditions that start and stop, given the ones already open (PM55). */
export function alertChanges(
	open: string[],
	current: Attention[]
): { opened: Attention[]; closed: string[] } {
	const now = new Set(current.filter((a) => a.alert).map((a) => a.key));
	return {
		opened: current.filter((a) => a.alert && !open.includes(a.key)),
		closed: open.filter((k) => !now.has(k))
	};
}

/** A Slack message for alerts that start and stop. */
export function alertMessage(
	opened: Attention[],
	closed: { key: string; title: string }[],
	origin: string
): { text: string } | null {
	if (!opened.length && !closed.length) return null;
	const lines = [
		...opened.map(
			(a) =>
				`${a.severity === 'critical' ? ':red_circle:' : ':warning:'} *${a.title}*\n${a.detail}\n_${a.remedy}_${a.href ? `\n<${origin}${a.href}|Open in Project Magic>` : ''}`
		),
		...closed.map((c) => `:white_check_mark: Cleared: ${c.title}`)
	];
	return { text: lines.join('\n\n') };
}

/** The daily summary: all is well, or what is open. */
export function summaryMessage(current: Attention[], origin: string): { text: string } {
	if (!current.length)
		return {
			text: `:white_check_mark: Project Magic: all is well. <${origin}/admin/ops|Operations>`
		};
	const crit = current.filter((a) => a.severity === 'critical').length;
	return {
		text: [
			`Project Magic: ${current.length} thing${current.length === 1 ? '' : 's'} need${current.length === 1 ? 's' : ''} attention${crit ? `, ${crit} critical` : ''}. <${origin}/admin/ops|Operations>`,
			...current.slice(0, 10).map((a) => `• ${a.title}`)
		].join('\n')
	};
}

/** The project banner's words for a failing sync (PM50). */
export function syncFailure(
	p: { lastError: string | null; failingSince: string | null; failCount: number },
	now = Date.now()
): string | null {
	if (!p.lastError) return null;
	if (p.failCount <= 1 || !p.failingSince) return `Last sync failed: ${p.lastError}`;
	const hours = (now - Date.parse(p.failingSince)) / HOUR;
	const since =
		hours < 1
			? `${Math.max(1, Math.round(hours * 60))} min`
			: hours < 48
				? `${Math.round(hours)} h`
				: `${Math.round(hours / 24)} days`;
	return `Sync has failed ${p.failCount} times in a row, for ${since}: ${p.lastError}`;
}

/** A problem a tenant can put right themselves (PM54), from their own part of the snapshot. */
export interface TenantProblem {
	key: string;
	title: string;
	detail: string | null;
	remedy: string;
	href: string | null;
}

/** What a tenant's admins see under Health: their projects, installations, digest and people. Not
 * the platform's own problems, and no fix buttons; the remedy is theirs to carry out. */
export function tenantProblems(
	s: Pick<OpsSnapshot, 'now' | 'projects' | 'installations' | 'heldEdits' | 'digests'>,
	o: { paused: number; repoParam: (owner: string, repo: string) => string }
): TenantProblem[] {
	const out: TenantProblem[] = [];
	for (const i of s.installations) {
		if (i.tokenError)
			out.push({
				key: `token:${i.id}`,
				title: `Project Magic can’t read the repositories on ${i.account}`,
				detail: i.tokenError,
				remedy:
					'GitHub refuses the App’s access. Check the Project Magic app is still installed on the account (GitHub → Settings → Applications); reinstall it if not.',
				href: '/tenant/installations'
			});
		else if (i.suspendedAt)
			out.push({
				key: `suspended:${i.id}`,
				title: `The installation on ${i.account} is suspended`,
				detail: null,
				remedy:
					'Its projects don’t sync until the account’s owner unsuspends it on GitHub (Settings → Applications).',
				href: '/tenant/installations'
			});
	}
	// A project on a refused installation fails for that reason, listed once above.
	const refused = new Set(s.installations.filter((i) => i.tokenError).map((i) => i.id));
	for (const p of s.projects) {
		if (!p.failCount || (p.installationId && refused.has(p.installationId))) continue;
		out.push({
			key: `sync:${p.id}`,
			title: `${p.owner}/${p.repo} isn’t syncing`,
			detail: p.lastError,
			remedy: /\b(401|403|404)\b|NOT_FOUND|Could not resolve/i.test(p.lastError ?? '')
				? 'GitHub won’t let the App read it: check the installation still includes this repository, then Refresh on its page.'
				: 'Try Refresh on its page. If it keeps failing, use Feedback and quote the error; the platform’s admins can see it too.',
			href: `/p/${o.repoParam(p.owner, p.repo)}`
		});
	}
	for (const h of s.heldEdits)
		if (h.reason === 'reauth')
			out.push({
				key: `reauth:${h.projectId}:${h.login ?? ''}`,
				title: `${h.count} edit${h.count === 1 ? '' : 's'} in ${h.owner}/${h.repo} held: ${h.login ?? 'their author'} must sign in again`,
				detail: null,
				remedy: `Their GitHub sign-in has expired. Once ${h.login ?? 'they'} signs in to Project Magic, the edits are saved as them.`,
				href: `/p/${o.repoParam(h.owner, h.repo)}`
			});
	for (const d of s.digests)
		out.push({
			key: `digest:${d.tenantId}`,
			title: 'The daily Slack digest is failing',
			detail: d.error,
			remedy:
				'Slack usually refuses a webhook that was removed or rotated. Set a new one under Settings.',
			href: '/tenant/settings#slack'
		});
	if (o.paused)
		out.push({
			key: 'paused',
			title: `${o.paused} project${o.paused === 1 ? ' is' : 's are'} paused by your plan`,
			detail: null,
			remedy:
				'Projects over the plan’s limit aren’t synced or shown. Pin the ones you want under Installations, or move to a larger plan.',
			href: '/tenant/billing'
		});
	return out;
}
