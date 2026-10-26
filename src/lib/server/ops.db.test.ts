// Observability against a real Postgres (EP2): what is recorded, what the Operations tab reads, the
// alerts opening and clearing, and that all of it degrades on a database before migration 016.
// Skipped unless TEST_DATABASE_URL names a database this test may wipe, for example:
//   docker run -d -e POSTGRES_PASSWORD=pm -p 54329:5432 postgres:17
//   TEST_DATABASE_URL=postgresql://postgres:pm@localhost:54329/postgres npx vitest --run ops.db
import { readdirSync, readFileSync } from 'node:fs';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { attention } from '#lib/core/ops.ts';

const url = process.env.TEST_DATABASE_URL;
// Its own schema, so it can run beside tenancy.test.ts, which wipes `public`.
const sql = url
	? postgres(url, {
			prepare: false,
			max: 2,
			onnotice: () => {},
			connection: { search_path: 'ops_test' }
		})
	: null;
vi.mock('./db.ts', () => ({ db: () => sql }));
vi.mock('@vercel/functions', () => ({
	waitUntil: (p: Promise<unknown>) => void p.catch(() => {})
}));
vi.mock('$app/env/private', () => ({
	BOOTSTRAP_ADMIN_GITHUB_LOGIN: 'Boss',
	INFERENCE_DAILY_TOKEN_LIMIT: 50000,
	BILLING_PROVIDER: 'stub',
	BILLING_STUB: '1',
	VERCEL_ENV: undefined,
	CRON_SECRET: 'x',
	GITHUB_APP_ID: '1',
	GITHUB_APP_PRIVATE_KEY: 'k',
	GITHUB_WEBHOOK_SECRET: 's',
	TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64')
}));

const files = readdirSync('migrations').sort();
const migrate = async (upTo: string) => {
	await sql!.unsafe('drop schema if exists ops_test cascade; create schema ops_test');
	await sql!`create table schema_migration (name text primary key, applied_at timestamptz not null default now())`;
	for (const f of files)
		if (f <= upTo) {
			await sql!.unsafe(readFileSync(`migrations/${f}`, 'utf8'));
			await sql!`insert into schema_migration (name) values (${f})`;
		}
};

/** A tenant with one project in an installation, and a member. */
async function seed() {
	const [u] =
		await sql!`insert into app_user (github_id, github_login, platform_role, refresh_token_enc)
		values (1, 'sam', 'admin', 'x') returning id`;
	const [t] =
		await sql!`insert into tenant (slug, name, status) values ('acme', 'Acme', 'active') returning id`;
	await sql!`insert into installation (id, tenant_id, account_login) values (99, ${t.id}, 'acme')`;
	const [p] =
		await sql!`insert into project (github_repo_id, owner, repo, installation_id, tenant_id)
		values (10, 'acme', 'web', 99, ${t.id}) returning id`;
	return { user: String(u.id), tenant: String(t.id), project: String(p.id) };
}

describe.skipIf(!sql)('observability on a database', () => {
	afterAll(() => sql?.end());

	describe('before migration 016', () => {
		beforeAll(async () => {
			await migrate('015_slack_digest.sql');
			await seed();
		});

		it('records nothing, and never throws', async () => {
			const ops = await import('./ops.ts');
			expect(await ops.recordError({ source: 'server', route: '/x', message: 'boom' })).toMatch(
				/^[a-z2-9]{8}$/
			);
			await expect(ops.track('inference', {}, async () => 7)).resolves.toBe(7);
			await ops.failed('digest', {}, new Error('nope'));
			await ops.skipped('delivery', {}, 'no table');
		});

		it('reads a snapshot, and says the migration is missing', async () => {
			const view = await import('./ops-view.ts');
			const s = await view.snapshot();
			expect(s.migrations?.missing).toContain('016_observability.sql');
			expect(attention(s)[0]).toMatchObject({ key: 'migrations', severity: 'critical' });
			expect(await view.jobs({})).toEqual([]);
			expect(await view.errorGroups()).toEqual([]);
			const health = await view.projectSyncHealth(
				String((await sql!`select id from project`)[0].id)
			);
			expect(health).toMatchObject({ failCount: 0, runs: [], held: [] });
		});

		it('checks alerts without a table to keep them in', async () => {
			const alerts = await import('./alerts.ts');
			expect(await alerts.checkAlerts()).toEqual({ opened: 0, closed: 0, sent: 0 });
		});
	});

	describe('after migration 016', () => {
		let ids: Awaited<ReturnType<typeof seed>>;
		let ops: typeof import('./ops.ts');
		let view: typeof import('./ops-view.ts');

		beforeAll(async () => {
			await migrate(files.at(-1)!);
			ids = await seed();
			ops = await import('./ops.ts');
			view = await import('./ops-view.ts');
		});

		it('groups errors by fingerprint, and reopens a resolved one that recurs', async () => {
			const a = await ops.recordError({
				source: 'server',
				route: '/p/[repo]',
				message: 'GitHub 502 on PR 12',
				userId: ids.user
			});
			await ops.recordError({
				source: 'server',
				route: '/p/[repo]',
				message: 'GitHub 503 on PR 97'
			});
			const [g] = await view.errorGroups();
			expect(g).toMatchObject({ occurrences: 2, day: 2, resolvedAt: null });
			expect(await view.errorByRef(a)).toBe(g.fingerprint);
			await sql!`update error_group set resolved_at = now()`;
			expect(await view.errorGroups()).toEqual([]);
			await ops.recordError({
				source: 'server',
				route: '/p/[repo]',
				message: 'GitHub 500 on PR 3'
			});
			expect((await view.errorGroups())[0]).toMatchObject({ occurrences: 3, resolvedAt: null });
			const d = await view.errorDetail(g.fingerprint);
			expect(d!.occurrences.map((o) => o.user)).toContain('sam');
		});

		it('records background work, and rethrows from track', async () => {
			await expect(
				ops.track('digest', { tenantId: ids.tenant }, async () => {
					throw new Error('Slack said 404');
				})
			).rejects.toThrow('Slack said 404');
			const [j] = await view.jobs({ kind: 'digest' });
			expect(j).toMatchObject({ outcome: 'failed', error: 'Slack said 404', tenant: 'acme' });
			// Skips are recorded once a day, not every time.
			await ops.skipped('delivery', { projectId: ids.project }, 'no table');
			await ops.skipped('delivery', { projectId: ids.project }, 'no table');
			expect(await view.jobs({ kind: 'delivery' })).toHaveLength(1);
		});

		it('turns what is wrong into attention, for every tenant and for one', async () => {
			await sql!`update project set last_error = 'GitHub 401: Bad credentials', fail_count = 4,
				failing_since = now() - interval '3 hours', sync_started_at = now() - interval '20 minutes'
				where id = ${ids.project}`;
			await sql!`update installation set token_error = 'GitHub 401: A JSON web token could not be decoded' where id = 99`;
			await sql!`insert into pending_edit (project_id, user_id, item_id, op, claimed_at)
				values (${ids.project}, ${ids.user}, 'PM1', '{}', now() - interval '40 minutes')`;
			await sql!`insert into cron_run (started_at, ended_at, ok, steps_json)
				values (now() - interval '2 hours', now() - interval '2 hours', true, '[]')`;
			const keys = attention(await view.snapshot()).map((a) => a.key);
			expect(keys).toEqual(
				expect.arrayContaining([
					`token:99`,
					`stuck:${ids.project}`,
					`claimed:${ids.project}`,
					'job:digest'
				])
			);
			// Its sync fails because the installation's token is refused: listed once, there.
			expect(keys).not.toContain(`sync:${ids.project}`);
			expect(keys).not.toContain('migrations');
			const other =
				await sql!`insert into tenant (slug, name, status) values ('other', 'Other', 'active') returning id`;
			expect(attention(await view.snapshot(String(other[0].id)))).toEqual([]);
		});

		it('opens alerts once, and closes them when they clear', async () => {
			const alerts = await import('./alerts.ts');
			const first = await alerts.checkAlerts();
			expect(first.opened).toBeGreaterThan(0);
			expect((await alerts.checkAlerts()).opened).toBe(0);
			await sql!`update installation set token_error = null`;
			const after = await alerts.checkAlerts();
			expect(after.closed).toBe(1);
			expect((await alerts.openAlerts()).map((a) => a.key)).not.toContain('token:99');
		});

		it('fixes a stuck sync and releases claimed edits from the Operations tab', async () => {
			vi.doMock('./sync-runner.ts', () => ({
				syncNow: async () => 'ran',
				syncProjectList: async () => 0
			}));
			vi.resetModules();
			const actions = await import('./ops-actions.ts');
			expect(await actions.runAction('unstick', { project: ids.project }, ids.user)).toEqual({
				ok: true,
				message: 'Cleared, and synced.'
			});
			const [p] = await sql!`select sync_started_at from project where id = ${ids.project}`;
			expect(p.sync_started_at).toBeNull();
			expect(await actions.runAction('release', { project: ids.project }, ids.user)).toMatchObject({
				ok: true,
				message: 'Released 1 edit.'
			});
			expect(await actions.runAction('resolve', {}, ids.user)).toEqual({
				ok: false,
				message: 'Which error?'
			});
			// A failed job's run is kept under Background work, but leaves the attention list.
			expect(await actions.runAction('dismiss', { kind: 'digest' }, ids.user)).toEqual({
				ok: true,
				message: 'Dismissed 1 failure.'
			});
			expect(attention(await view.snapshot()).map((a) => a.key)).not.toContain('job:digest');
			expect(await view.jobs({ kind: 'digest' })).toHaveLength(1);
			const audit = await sql!`select action from audit_log order by id`;
			expect(audit.map((a) => a.action)).toEqual(
				expect.arrayContaining(['platform.ops.unstick', 'platform.ops.release'])
			);
			vi.doUnmock('./sync-runner.ts');
		});

		it('lists a person’s failed edits until they edit the item again', async () => {
			await sql!`insert into edit_log (project_id, user_id, item_id, op, error, at)
				values (${ids.project}, ${ids.user}, 'PM2', 'edit', 'GitHub said 409', now() - interval '1 hour')`;
			expect(await view.failedEdits(ids.user, [ids.project])).toMatchObject([
				{ item: 'PM2', error: 'GitHub said 409' }
			]);
			await sql!`insert into edit_log (project_id, user_id, item_id, op) values (${ids.project}, ${ids.user}, 'PM2', 'edit')`;
			expect(await view.failedEdits(ids.user, [ids.project])).toEqual([]);
		});

		it('purges records past 90 days', async () => {
			await sql!`update job_run set started_at = now() - interval '100 days' where kind = 'digest'`;
			const r = await ops.purgeOpsRecords();
			expect(r.job_run).toBe(1);
		});
	});
});
