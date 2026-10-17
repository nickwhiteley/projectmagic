// Tenancy against a real Postgres (specs/tenants.md §12): migration 008 on today's data, and that a
// query for one tenant never reaches another's. Skipped unless TEST_DATABASE_URL names a database
// this test may wipe, for example:
//   docker run -d -e POSTGRES_PASSWORD=pm -p 54329:5432 postgres:17
//   TEST_DATABASE_URL=postgresql://postgres:pm@localhost:54329/postgres npx vitest --run tenancy
import { readdirSync, readFileSync } from 'node:fs';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { GitHubClient } from './github-client.ts';

const url = process.env.TEST_DATABASE_URL;
const sql = url ? postgres(url, { prepare: false, max: 2, onnotice: () => {} }) : null;
vi.mock('./db.ts', () => ({ db: () => sql }));
vi.mock('$app/env/private', () => ({
	BOOTSTRAP_ADMIN_GITHUB_LOGIN: 'Boss',
	INFERENCE_DAILY_TOKEN_LIMIT: 50000,
	BILLING_PROVIDER: 'stub',
	BILLING_STUB: '1',
	VERCEL_ENV: undefined,
	TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64')
}));

const migrate = async (upTo: string, from = '') => {
	for (const f of readdirSync('migrations').sort())
		if (f > from && f <= upTo) await sql!.unsafe(readFileSync(`migrations/${f}`, 'utf8'));
};

describe.skipIf(!sql)('tenancy', () => {
	let projects: typeof import('./projects.ts');
	let tenants: typeof import('./tenants.ts');
	let sync: typeof import('./sync.ts');
	let ids: { t1: string; t2: string; web1: string; web2: string };

	beforeAll(async () => {
		projects = await import('./projects.ts');
		tenants = await import('./tenants.ts');
		sync = await import('./sync.ts');
		await sql!.unsafe('drop schema public cascade; create schema public');
		// Today's deployment: two users, two repositories in one installation, a role, and some usage.
		await migrate('007_uninstalled.sql');
		await sql!`insert into app_user (github_id, github_login, system_role) values (1, 'nick', 'admin'), (2, 'sam', 'member')`;
		await sql!`insert into project (github_repo_id, owner, repo, installation_id) values (10, 'nick', 'orchard', 99), (11, 'nick', 'lantern', 99)`;
		await sql!`insert into membership (user_id, project_id, role) values (2, 1, 'viewer')`;
		await sql!`insert into inference_usage values ('project:1', current_date, 100), ('project:2', current_date, 50)`;
		await migrate('008_tenants.sql', '007_uninstalled.sql');
		await migrate('013_project_initialised.sql', '008_tenants.sql');
	});
	afterAll(() => sql?.end());

	describe('migration 008 on a copy of today’s data', () => {
		it('makes the deployment one tenant, with everyone and everything in it', async () => {
			const [t] = await sql!`select * from tenant`;
			expect(t).toMatchObject({ slug: 'default', name: 'nick', status: 'active' });
			expect(await sql!`select user_id::text, role from tenant_member order by user_id`).toEqual([
				{ user_id: '1', role: 'admin' },
				{ user_id: '2', role: 'member' }
			]);
			expect(await sql!`select platform_role from app_user order by id`).toEqual([
				{ platform_role: 'admin' },
				{ platform_role: 'none' }
			]);
			expect(await sql!`select tenant_id from project where tenant_id <> ${t.id}`).toEqual([]);
			expect(await sql!`select id::text, tenant_id::text from installation`).toEqual([
				{ id: '99', tenant_id: String(t.id) }
			]);
			expect(await sql!`select access from tenant_setting`).toEqual([{ access: 'managed' }]);
		});

		it('keeps project roles as manual, and folds today’s usage into the tenant', async () => {
			expect(await sql!`select user_id::text, role, source from membership`).toEqual([
				{ user_id: '2', role: 'viewer', source: 'manual' }
			]);
			expect(await sql!`select scope, tokens::int from inference_usage`).toEqual([
				{ scope: 'tenant:1', tokens: 150 }
			]);
		});

		it('shows Nick what he saw before, at the same addresses', async () => {
			const t = await tenants.tenantsOf('1');
			expect(t.map((x) => [x.slug, x.role])).toEqual([['default', 'admin']]);
			expect((await projects.allProjects(t[0].id)).map((p) => p.param)).toEqual([
				'lantern',
				'orchard'
			]);
			expect((await projects.projectByRepo(t[0].id, 'Orchard'))?.owner).toBe('nick');
		});
	});

	describe('isolation', () => {
		beforeAll(async () => {
			// Two tenants with a project named `web` each, in different GitHub accounts.
			const [{ id: t1 }] =
				await sql!`insert into tenant (slug, name) values ('acme', 'Acme') returning id::text`;
			const [{ id: t2 }] =
				await sql!`insert into tenant (slug, name) values ('globex', 'Globex') returning id::text`;
			await sql!`insert into installation (id, tenant_id, account_login) values (1, ${t1}, 'acme'), (2, ${t2}, 'globex')`;
			const [{ id: web1 }] =
				await sql!`insert into project (github_repo_id, owner, repo, installation_id, tenant_id) values (20, 'acme', 'web', 1, ${t1}) returning id::text`;
			const [{ id: web2 }] =
				await sql!`insert into project (github_repo_id, owner, repo, installation_id, tenant_id) values (21, 'globex', 'web', 2, ${t2}) returning id::text`;
			await sql!`insert into project (github_repo_id, owner, repo, installation_id, tenant_id) values (22, 'globex', 'secret', 2, ${t2})`;
			ids = { t1, t2, web1, web2 };
		});

		it('lists only a tenant’s own projects', async () => {
			expect((await projects.allProjects(ids.t1)).map((p) => `${p.owner}/${p.repo}`)).toEqual([
				'acme/web'
			]);
			expect((await projects.allProjects(ids.t2)).map((p) => `${p.owner}/${p.repo}`)).toEqual([
				'globex/secret',
				'globex/web'
			]);
		});

		it('resolves the same address to each tenant’s own project', async () => {
			expect((await projects.projectByRepo(ids.t1, 'web'))?.id).toBe(ids.web1);
			expect((await projects.projectByRepo(ids.t2, 'web'))?.id).toBe(ids.web2);
		});

		it('never finds another tenant’s project, by name or by owner--repo', async () => {
			expect(await projects.projectByRepo(ids.t1, 'secret')).toBeNull();
			expect(await projects.projectByRepo(ids.t1, 'globex--secret')).toBeNull();
			expect(await projects.projectByRepo(ids.t1, 'globex--web')).toBeNull();
			expect(await projects.projectByRepo(ids.t2, 'orchard')).toBeNull();
		});

		it('finds which of your tenants has a project, for a link from another', async () => {
			expect(await projects.tenantsWithRepo([ids.t1, ids.t2], 'secret')).toEqual([ids.t2]);
			expect(await projects.tenantsWithRepo([ids.t1, ids.t2], 'web')).toEqual([ids.t1, ids.t2]);
			expect(await projects.tenantsWithRepo([ids.t1], 'secret')).toEqual([]);
		});

		it('addresses two repositories of one name in a tenant as owner--repo', async () => {
			await sql!`insert into project (github_repo_id, owner, repo, installation_id, tenant_id) values (23, 'acme-labs', 'web', 1, ${ids.t1})`;
			const all = await projects.allProjects(ids.t1);
			expect(all.map((p) => p.param)).toEqual(['acme--web', 'acme-labs--web']);
			expect(await projects.projectByRepo(ids.t1, 'web')).toBeNull();
			expect((await projects.projectByRepo(ids.t1, 'acme-labs--web'))?.owner).toBe('acme-labs');
			expect((await projects.projectByRepo(ids.t1, 'ACME--web'))?.owner).toBe('acme');
		});

		it('leaves a suspended tenant out of the cron', async () => {
			expect((await projects.activeProjects()).some((p) => p.tenantId === ids.t2)).toBe(true);
			await sql!`update tenant set status = 'suspended' where id = ${ids.t2}`;
			expect((await projects.activeProjects()).some((p) => p.tenantId === ids.t2)).toBe(false);
			await sql!`update tenant set status = 'active' where id = ${ids.t2}`;
		});
	});

	describe('the current tenant', () => {
		it('is the one used last, and only a tenant you belong to', async () => {
			await sql!`insert into tenant_member (tenant_id, user_id, role) values (${ids.t1}, 2, 'member'), (${ids.t2}, 2, 'admin')`;
			expect((await tenants.tenantsOf('2')).map((t) => t.slug)).toEqual([
				'acme',
				'globex',
				'default'
			]);
			expect(await tenants.switchTenant('2', ids.t2)).toBe(true);
			const mine = await tenants.tenantsOf('2');
			expect(tenants.currentTenant(mine)).toMatchObject({ slug: 'globex', role: 'admin' });
			expect(await tenants.switchTenant('1', ids.t2)).toBe(false);
			expect(tenants.currentTenant(await tenants.tenantsOf('1'))?.slug).toBe('default');
		});

		it('leaves out a deleted tenant', async () => {
			await sql!`update tenant set status = 'deleted' where id = ${ids.t1}`;
			expect((await tenants.tenantsOf('2')).map((t) => t.slug)).not.toContain('acme');
			await sql!`update tenant set status = 'active' where id = ${ids.t1}`;
		});
	});

	describe('syncing installations', () => {
		const repo = (id: number, owner: string, name: string) => ({
			id,
			name,
			owner: { login: owner },
			archived: false,
			default_branch: 'main'
		});
		const app = (installs: object[]): GitHubClient =>
			({ rest: async () => ({ body: installs, next: null }) }) as unknown as GitHubClient;
		const forInstall = (byId: Record<number, ReturnType<typeof repo>[]>) => (id: number) =>
			({
				rest: async () => ({ body: { repositories: byId[id] ?? [] }, next: null })
			}) as unknown as GitHubClient;
		const inst = (id: number, login: string) => ({
			id,
			account: { login, id: id * 10, type: 'Organization' },
			repository_selection: 'all',
			suspended_at: null
		});

		it('records an unclaimed installation and syncs none of it while there are several tenants', async () => {
			const n = await sync.syncInstallations(
				app([inst(1, 'acme'), inst(2, 'globex'), inst(3, 'newcomer')]),
				forInstall({
					1: [repo(20, 'acme', 'web'), repo(23, 'acme-labs', 'web')],
					2: [repo(21, 'globex', 'web'), repo(22, 'globex', 'secret')],
					3: [repo(30, 'newcomer', 'app')]
				}),
				sql!
			);
			expect(n).toBe(4);
			expect(await sql!`select tenant_id from installation where id = 3`).toEqual([
				{ tenant_id: null }
			]);
			expect(await sql!`select 1 from project where github_repo_id = 30`).toEqual([]);
		});

		it('keeps each repository in its installation’s tenant', async () => {
			expect(await sql!`select tenant_id::text from project where github_repo_id = 21`).toEqual([
				{ tenant_id: ids.t2 }
			]);
		});

		it('sets up a new repository once, skips an archived one, and retries a deferred one (PM33)', async () => {
			const calls: string[] = [];
			let answer: 'done' | 'deferred' = 'deferred';
			const initialise = async (_gh: GitHubClient, r: { repo: string }) => {
				calls.push(r.repo);
				return answer;
			};
			const list = [
				repo(20, 'acme', 'web'),
				repo(23, 'acme-labs', 'web'),
				repo(24, 'acme', 'fresh'),
				{ ...repo(25, 'acme', 'old'), archived: true }
			];
			const run = () =>
				sync.syncInstallations(app([inst(1, 'acme')]), forInstall({ 1: list }), sql!, initialise);
			// Projects that already existed were marked by the migration; the archived one is left alone.
			await sql!`update project set initialised_at = now()`;
			await run();
			expect(calls).toEqual(['fresh']);
			await run();
			expect(calls).toEqual(['fresh', 'fresh']);
			answer = 'done';
			await run();
			await run();
			expect(calls).toEqual(['fresh', 'fresh', 'fresh']);
		});

		it('marks an installation GitHub no longer lists as removed, and its projects uninstalled', async () => {
			await sql!`insert into installation (id, tenant_id, account_login) values (5, ${ids.t1}, 'gone')`;
			await sql!`insert into project (github_repo_id, owner, repo, installation_id, tenant_id) values (50, 'gone', 'old', 5, ${ids.t1})`;
			await sync.syncInstallations(
				app([inst(1, 'acme'), inst(2, 'globex')]),
				forInstall({
					1: [repo(20, 'acme', 'web'), repo(23, 'acme-labs', 'web')],
					2: [repo(21, 'globex', 'web'), repo(22, 'globex', 'secret')]
				}),
				sql!
			);
			expect(
				await sql!`select removed_at is not null as removed from installation where id = 5`
			).toEqual([{ removed: true }]);
			expect(
				await sql!`select uninstalled_at is not null as gone from project where github_repo_id = 50`
			).toEqual([{ gone: true }]);
		});

		it('does not touch the projects of a suspended tenant', async () => {
			await sql!`update tenant set status = 'suspended' where id = ${ids.t2}`;
			await sync.syncInstallations(
				app([inst(1, 'acme'), inst(2, 'globex')]),
				forInstall({ 1: [repo(20, 'acme', 'web'), repo(23, 'acme-labs', 'web')] }),
				sql!
			);
			expect(
				await sql!`select count(*)::int as n from project where tenant_id = ${ids.t2} and uninstalled_at is null`
			).toEqual([{ n: 2 }]);
			await sql!`update tenant set status = 'active' where id = ${ids.t2}`;
		});

		it('does not give a new installation to the only tenant: it waits to be claimed', async () => {
			await sql!`update tenant set status = 'deleted' where slug <> 'default'`;
			await sync.syncInstallations(
				app([inst(3, 'newcomer')]),
				forInstall({ 3: [repo(30, 'newcomer', 'app')] }),
				sql!
			);
			expect(await sql!`select tenant_id from installation where id = 3`).toEqual([
				{ tenant_id: null }
			]);
			await sql!`update tenant set status = 'active' where slug <> 'default'`;
		});
	});

	describe('claiming an installation (§3.2)', () => {
		let inst: typeof import('./installations.ts');
		const me = { id: '1', githubId: '1001' };
		const info = (id: number, login: string, type: 'User' | 'Organization', accountId: number) => ({
			id,
			account: { login, id: accountId, type },
			repository_selection: 'all' as const,
			suspended_at: null
		});
		const gh = (
			over: Partial<import('./installations.ts').GitHubAccess> = {}
		): import('./installations.ts').GitHubAccess => ({
			visibleInstallationIds: async () => [70, 71, 72],
			orgRole: async () => null,
			fetchInstallation: async (id) =>
				id === 71
					? info(71, 'someorg', 'Organization', 710)
					: id === 72
						? info(72, 'nick', 'User', 1001)
						: null,
			...over
		});
		beforeAll(async () => {
			inst = await import('./installations.ts');
			await sql!`insert into installation (id, account_login, account_type, account_id) values (70, 'strangers', 'Organization', 700)`;
		});

		it('refuses an installation the person’s token cannot see', async () => {
			const r = await inst.claimInstallation(me, ids.t1, 99, gh());
			expect(r).toMatchObject({ ok: false, reason: expect.stringContaining('cannot see') });
		});

		it('refuses a person who is not an admin of the organisation, and says so', async () => {
			const r = await inst.claimInstallation(me, ids.t1, 70, gh({ orgRole: async () => 'member' }));
			expect(r).toMatchObject({ ok: false, reason: expect.stringContaining('not an admin') });
			expect(await sql!`select tenant_id from installation where id = 70`).toEqual([
				{ tenant_id: null }
			]);
		});

		it('connects an organisation to an admin of it', async () => {
			const r = await inst.claimInstallation(me, ids.t1, 70, gh({ orgRole: async () => 'admin' }));
			expect(r).toMatchObject({ ok: true, accountLogin: 'strangers' });
			expect(
				await sql!`select tenant_id::text, claimed_by::text from installation where id = 70`
			).toEqual([{ tenant_id: ids.t1, claimed_by: '1' }]);
		});

		it('says an installation held by another tenant is, naming no one', async () => {
			const r = await inst.claimInstallation(me, ids.t2, 70, gh({ orgRole: async () => 'admin' }));
			expect(r).toEqual({
				ok: false,
				reason:
					'This GitHub account is already connected to another Project Magic tenant. Ask its admin.'
			});
			expect(await sql!`select tenant_id::text from installation where id = 70`).toEqual([
				{ tenant_id: ids.t1 }
			]);
		});

		it('lets a person connect their own account, recording an installation no webhook announced', async () => {
			expect(await sql!`select 1 from installation where id = 72`).toEqual([]);
			const r = await inst.claimInstallation(me, ids.t1, 72, gh());
			expect(r).toMatchObject({ ok: true, accountLogin: 'nick' });
		});

		it('refuses someone else’s personal account', async () => {
			const r = await inst.claimInstallation({ id: '2', githubId: '2002' }, ids.t2, 72, gh());
			expect(r).toMatchObject({ ok: false });
			expect(await sql!`select tenant_id::text from installation where id = 72`).toEqual([
				{ tenant_id: ids.t1 }
			]);
		});

		it('accepts the person who installed it, whatever the account', async () => {
			await sql!`update installation set sender_github_id = 1001 where id = 71`.catch(() => {});
			await sql!`insert into installation (id, account_login, account_type, account_id, sender_github_id) values (71, 'someorg', 'Organization', 710, 1001) on conflict (id) do update set sender_github_id = 1001`;
			const r = await inst.claimInstallation(me, ids.t2, 71, gh());
			expect(r).toMatchObject({ ok: true });
		});

		it('lists what a person could connect: unclaimed, visible, theirs', async () => {
			await sql!`insert into installation (id, account_login, account_type, account_id) values (73, 'theirs', 'User', 1001), (74, 'notmine', 'User', 5)`;
			const list = await inst.claimable(me, gh({ visibleInstallationIds: async () => [73, 74] }));
			expect(list).toEqual([{ id: '73', accountLogin: 'theirs' }]);
		});

		it('spends a state once, only for its person, and not after it expires', async () => {
			const token = await inst.newSetupState('1', ids.t1);
			expect(await sql!`select token_hash from setup_state where token_hash = ${token}`).toEqual(
				[]
			);
			expect(await inst.consumeSetupState(token, '2')).toBeNull();
			expect(await inst.consumeSetupState(token, '1')).toEqual({ tenantId: ids.t1 });
			expect(await inst.consumeSetupState(token, '1')).toBeNull();
			const old = await inst.newSetupState('1', ids.t1);
			await sql!`update setup_state set expires_at = now() - interval '1 minute'`;
			expect(await inst.consumeSetupState(old, '1')).toBeNull();
			expect(await inst.consumeSetupState('nonsense', '1')).toBeNull();
		});

		it('disconnects: detaches the installation and marks its projects, keeping them', async () => {
			expect(await inst.disconnect(ids.t2, 70)).toBe(false);
			expect(await inst.disconnect(ids.t1, 70)).toBe(true);
			expect(await sql!`select tenant_id from installation where id = 70`).toEqual([
				{ tenant_id: null }
			]);
			await sql!`insert into project (github_repo_id, owner, repo, installation_id, tenant_id) values (80, 'strangers', 'kept', 71, ${ids.t2})`;
			expect(await inst.disconnect(ids.t2, 71)).toBe(true);
			expect(
				await sql!`select uninstalled_at is not null as gone from project where github_repo_id = 80`
			).toEqual([{ gone: true }]);
		});

		it('records the installation webhook with the account that installed it', async () => {
			await inst.recordInstallationEvent({
				action: 'created',
				installation: info(90, 'fresh', 'Organization', 900),
				sender: { id: 1001 }
			});
			expect(
				await sql!`select tenant_id, sender_github_id::text from installation where id = 90`
			).toEqual([{ tenant_id: null, sender_github_id: '1001' }]);
			await inst.recordInstallationEvent({
				action: 'deleted',
				installation: info(90, 'fresh', 'Organization', 900)
			});
			expect(
				await sql!`select removed_at is not null as gone from installation where id = 90`
			).toEqual([{ gone: true }]);
		});
	});

	describe('creating a tenant', () => {
		it('makes the person its admin and its current tenant, with an audit row', async () => {
			const r = await tenants.createTenant('2', 'Initech', 'initech', 'active');
			expect(r).toMatchObject({ ok: true, tenant: { slug: 'initech', role: 'admin' } });
			if (!r.ok) return;
			expect(
				await sql!`select role from tenant_member where tenant_id = ${r.tenant.id} and user_id = 2`
			).toEqual([{ role: 'admin' }]);
			expect(tenants.currentTenant(await tenants.tenantsOf('2'))?.slug).toBe('initech');
			expect(await sql!`select action from audit_log where tenant_id = ${r.tenant.id}`).toEqual([
				{ action: 'tenant.created' }
			]);
			expect(
				await sql!`select 1 from tenant_setting where tenant_id = ${r.tenant.id}`
			).toHaveLength(1);
		});

		it('refuses a slug that is taken', async () => {
			expect(await tenants.createTenant('2', 'Initech again', 'initech', 'active')).toMatchObject({
				ok: false
			});
		});

		it('can wait for approval', async () => {
			const r = await tenants.createTenant('1', 'Waiting', 'waiting', 'pending');
			expect(r).toMatchObject({ ok: true, tenant: { status: 'pending' } });
		});
	});

	describe('running the service', () => {
		let platform: typeof import('./platform.ts');
		let waiting: string;
		beforeAll(async () => {
			platform = await import('./platform.ts');
			waiting = String((await sql!`select id from tenant where slug = 'waiting'`)[0].id);
		});

		it('is closed to sign-up until a platform admin says otherwise, and keeps the change in the audit log', async () => {
			expect(await platform.getSignup()).toBe('closed');
			await platform.setSignup('approval', '1');
			expect(await platform.getSignup()).toBe('approval');
			expect(
				(await platform.auditLog(null, 5)).find((a) => a.action === 'platform.signup')?.data
			).toEqual({ before: 'closed', after: 'approval' });
		});

		it('approves a pending tenant, and only a pending one', async () => {
			expect(await platform.moveTenant(waiting, 'restore', '1')).toMatchObject({ ok: false });
			expect(await platform.moveTenant(waiting, 'approve', '1')).toMatchObject({ ok: true });
			expect(await platform.moveTenant(waiting, 'approve', '1')).toMatchObject({ ok: false });
		});

		it('suspends with a reason, and restores', async () => {
			expect(await platform.moveTenant(waiting, 'suspend', '1', '  ')).toMatchObject({ ok: false });
			expect(await platform.moveTenant(waiting, 'suspend', '1', 'unpaid')).toMatchObject({
				ok: true
			});
			expect((await platform.tenantSummary(waiting))?.statusReason).toBe('unpaid');
			expect(await platform.moveTenant(waiting, 'restore', '1')).toMatchObject({ ok: true });
			expect((await platform.tenantSummary(waiting))?.statusReason).toBeNull();
		});

		it('deletes: detaches installations, marks projects, and can undo it until the purge', async () => {
			await sql!`insert into installation (id, tenant_id, account_login) values (95, ${waiting}, 'waitco')`;
			await sql!`insert into project (github_repo_id, owner, repo, installation_id, tenant_id) values (96, 'waitco', 'thing', 95, ${waiting})`;
			const r = await platform.moveTenant(waiting, 'delete', '1');
			expect(r).toEqual({ ok: true, detached: [95] });
			expect(await sql!`select tenant_id from installation where id = 95`).toEqual([
				{ tenant_id: null }
			]);
			expect(
				await sql!`select uninstalled_at is not null as gone from project where github_repo_id = 96`
			).toEqual([{ gone: true }]);
			expect((await platform.listTenants('waiting'))[0].status).toBe('deleted');
			expect(await platform.moveTenant(waiting, 'undelete', '1')).toMatchObject({ ok: true });
			await platform.moveTenant(waiting, 'delete', '1');
		});

		it('purges a tenant deleted over 30 days ago, with its projects and audit log, and nobody else', async () => {
			expect(await platform.purgeDeletedTenants()).toBe(0);
			await sql!`update tenant set deleted_at = now() - interval '31 days' where id = ${waiting}`;
			expect(await platform.purgeDeletedTenants()).toBe(1);
			expect(await sql!`select 1 from tenant where id = ${waiting}`).toEqual([]);
			expect(await sql!`select 1 from project where tenant_id = ${waiting}`).toEqual([]);
			expect(await sql!`select 1 from audit_log where tenant_id = ${waiting}`).toEqual([]);
			expect(await sql!`select 1 from tenant where slug = 'default'`).toHaveLength(1);
		});

		it('lists tenants by search and counts without content', async () => {
			expect((await platform.listTenants('INIT')).map((t) => t.slug)).toEqual(['initech']);
			expect((await platform.platformOverview()).deleted).toBe(0);
		});
	});

	describe('who can sign in (§3.1)', () => {
		let users: typeof import('./users.ts');
		const tokens = {
			accessToken: 't',
			accessExpiresAt: null,
			refreshToken: null,
			refreshExpiresAt: null
		};
		const gh = (id: number, login: string) => ({ id, login, name: null });
		beforeAll(async () => {
			users = await import('./users.ts');
		});

		it('refuses a stranger while sign-up is closed', async () => {
			expect(await users.signIn(gh(500, 'stranger'), tokens, 'closed')).toEqual({
				ok: false,
				reason: 'not-invited'
			});
			expect(await sql!`select 1 from app_user where github_id = 500`).toEqual([]);
		});

		it.each(['open', 'approval'] as const)(
			'lets a stranger in when sign-up is %s, as no one special',
			async (mode) => {
				const id = mode === 'open' ? 501 : 502;
				const r = await users.signIn(gh(id, `new-${mode}`), tokens, mode);
				expect(r).toMatchObject({ ok: true, user: { platformRole: 'none', githubId: String(id) } });
			}
		);

		it('always lets in someone who already has an account', async () => {
			expect(await users.signIn(gh(2, 'sam'), tokens, 'closed')).toMatchObject({ ok: true });
		});

		it('refuses a disabled account whatever the mode', async () => {
			await sql!`update app_user set disabled_at = now() where github_id = 501`;
			expect(await users.signIn(gh(501, 'new-open'), tokens, 'open')).toEqual({
				ok: false,
				reason: 'disabled'
			});
		});

		it('makes the bootstrap login the first platform admin even when closed, and only while there is none', async () => {
			expect(await users.signIn(gh(600, 'boss'), tokens, 'closed')).toEqual({
				ok: false,
				reason: 'not-invited'
			});
			await sql!`alter table app_user disable trigger app_user_keeps_platform_admin`;
			await sql!`update app_user set platform_role = 'none'`;
			await sql!`alter table app_user enable trigger app_user_keeps_platform_admin`;
			expect(await users.signIn(gh(600, 'boss'), tokens, 'closed')).toMatchObject({
				ok: true,
				user: { platformRole: 'admin' }
			});
			expect(
				await sql!`select count(*)::int as n from tenant_member where user_id = (select id from app_user where github_id = 600)`
			).toEqual([{ n: 0 }]);
			await sql!`update app_user set platform_role = 'admin' where github_id in (1, 600)`;
		});
	});

	describe('members and roles (§3.3, §6.4)', () => {
		let members: typeof import('./members.ts');
		let team: string;
		let teamWeb: string;
		const user = async (gid: number, login: string) =>
			String(
				(
					await sql!`insert into app_user (github_id, github_login) values (${gid}, ${login}) returning id`
				)[0].id
			);
		let boss: string, dev: string, other: string;
		beforeAll(async () => {
			members = await import('./members.ts');
			boss = await user(1100, 'boss1');
			dev = await user(1101, 'dev1');
			other = await user(1102, 'other1');
			team = String(
				(await sql!`insert into tenant (slug, name) values ('team', 'Team') returning id`)[0].id
			);
			await sql!`insert into tenant_setting (tenant_id, access) values (${team}, 'managed')`;
			await sql!`insert into tenant_member (tenant_id, user_id, role) values (${team}, ${boss}, 'admin'), (${team}, ${dev}, 'member')`;
			await sql!`insert into installation (id, tenant_id, account_login, account_type, account_id) values (200, ${team}, 'teamorg', 'Organization', 2000)`;
			teamWeb = String(
				(
					await sql!`insert into project (github_repo_id, owner, repo, installation_id, tenant_id) values (300, 'teamorg', 'web', 200, ${team}) returning id`
				)[0].id
			);
		});

		it('keeps an active admin: the service says why, and the database refuses every other path', async () => {
			expect(await members.setMemberRole(team, boss, boss, 'member')).toMatchObject({
				ok: false,
				reason: expect.stringContaining('at least one active admin')
			});
			expect(await members.removeMember(team, boss, boss)).toMatchObject({ ok: false });
			await expect(
				sql!`delete from tenant_member where tenant_id = ${team} and user_id = ${boss}`
			).rejects.toMatchObject({ code: '23514' });
			await expect(
				sql!`update tenant_member set role = 'member' where tenant_id = ${team} and user_id = ${boss}`
			).rejects.toMatchObject({ code: '23514' });
			await expect(
				sql!`update app_user set disabled_at = now() where id = ${boss}`
			).rejects.toMatchObject({ code: '23514' });
		});

		it('allows swapping one admin for another in a transaction, and demoting one of two', async () => {
			await sql!.begin(async (tx) => {
				await tx`update tenant_member set role = 'admin' where tenant_id = ${team} and user_id = ${dev}`;
				await tx`update tenant_member set role = 'member' where tenant_id = ${team} and user_id = ${boss}`;
			});
			expect(await members.setMemberRole(team, dev, boss, 'admin')).toEqual({ ok: true });
			expect(await members.setMemberRole(team, dev, dev, 'member')).toEqual({ ok: true });
			expect(
				(await members.listMembers(team)).map((m) => [m.userId === boss ? 'boss' : 'dev', m.role])
			).toEqual([
				['boss', 'admin'],
				['dev', 'member']
			]);
		});

		it('does not count a disabled admin as one', async () => {
			await sql!`update tenant_member set role = 'admin' where tenant_id = ${team} and user_id = ${dev}`;
			await sql!`update app_user set disabled_at = now() where id = ${dev}`;
			expect(await members.setMemberRole(team, boss, boss, 'member')).toMatchObject({ ok: false });
			await sql!`update app_user set disabled_at = null where id = ${dev}`;
			await sql!`update tenant_member set role = 'member' where tenant_id = ${team} and user_id = ${dev}`;
		});

		it('lets a tenant be deleted and purged although it has admins', async () => {
			const t = String(
				(await sql!`insert into tenant (slug, name) values ('doomed', 'Doomed') returning id`)[0].id
			);
			await sql!`insert into tenant_member (tenant_id, user_id, role) values (${t}, ${boss}, 'admin')`;
			await sql!`update tenant set status = 'deleted' where id = ${t}`;
			await sql!`delete from tenant where id = ${t}`;
			expect(await sql!`select 1 from tenant_member where tenant_id = ${t}`).toEqual([]);
		});

		it('removes a member: roles go, pending edits pass to another author or are discarded with a note', async () => {
			await sql!`insert into membership (user_id, project_id, role) values (${other}, ${teamWeb}, 'editor')`;
			await sql!`insert into tenant_member (tenant_id, user_id, role) values (${team}, ${other}, 'member')`;
			await sql!`insert into pending_edit (project_id, user_id, item_id, op) values (${teamWeb}, ${other}, 'A1', '{}'), (${teamWeb}, ${dev}, 'B1', '{}')`;
			expect(await members.removeMember(team, boss, other)).toEqual({ ok: true });
			expect(await sql!`select 1 from membership where user_id = ${other}`).toEqual([]);
			expect(await sql!`select user_id::text from pending_edit where item_id = 'A1'`).toEqual([
				{ user_id: dev }
			]);
			expect(
				(
					await sql!`select action from audit_log where tenant_id = ${team} order by id desc limit 1`
				)[0].action
			).toBe('member.removed');
			// Alone in the batch, it is discarded with a note.
			await sql!`delete from pending_edit`;
			await sql!`insert into tenant_member (tenant_id, user_id, role) values (${team}, ${other}, 'member')`;
			await sql!`insert into pending_edit (project_id, user_id, item_id, op) values (${teamWeb}, ${other}, 'A2', '{}')`;
			expect(await members.removeMember(team, other, other)).toEqual({ ok: true });
			expect(await sql!`select 1 from pending_edit`).toEqual([]);
			expect(await sql!`select op, error from edit_log where item_id = 'A2'`).toEqual([
				{ op: 'discarded', error: expect.stringContaining('left the tenant') }
			]);
		});

		describe('invitations', () => {
			it('are held against the numeric id, replace an earlier one, and are refused for a member', async () => {
				expect(
					await members.createInvitation(team, boss, { id: 1101, login: 'dev1' }, 'member')
				).toMatchObject({ ok: false });
				const a = await members.createInvitation(
					team,
					boss,
					{ id: 1102, login: 'other1' },
					'member'
				);
				const b = await members.createInvitation(
					team,
					boss,
					{ id: 1102, login: 'Other1' },
					'admin',
					{ [teamWeb]: 'editor' }
				);
				expect(a.ok && b.ok).toBe(true);
				expect((await members.tenantInvitations(team)).map((i) => [i.githubLogin, i.role])).toEqual(
					[['Other1', 'admin']]
				);
				if (a.ok) expect(await members.invitationByToken(a.token)).toBeNull();
				if (b.ok)
					expect(await members.invitationByToken(b.token)).toMatchObject({
						githubId: '1102',
						tenantName: 'Team'
					});
			});

			it('are accepted only by the account they name, once, and give the roles they carry', async () => {
				const [inv] = await members.invitationsFor('1102');
				expect(inv.tenantName).toBe('Team');
				expect(await members.acceptInvitation({ id: dev, githubId: '1101' }, inv.id)).toMatchObject(
					{ ok: false, reason: expect.stringContaining('different GitHub account') }
				);
				expect(
					await members.acceptInvitation({ id: other, githubId: '1102' }, inv.id)
				).toMatchObject({ ok: true, tenantId: team });
				expect(
					await sql!`select role, source from tenant_member where tenant_id = ${team} and user_id = ${other}`
				).toEqual([{ role: 'admin', source: 'invited' }]);
				expect(
					await sql!`select role, source from membership where user_id = ${other} and project_id = ${teamWeb}`
				).toEqual([{ role: 'editor', source: 'manual' }]);
				expect(
					await members.acceptInvitation({ id: other, githubId: '1102' }, inv.id)
				).toMatchObject({ ok: false });
				expect(await members.invitationsFor('1102')).toEqual([]);
			});

			it('can be withdrawn, and expire', async () => {
				const r = await members.createInvitation(team, boss, { id: 1200, login: 'late' }, 'member');
				const [inv] = await members.tenantInvitations(team);
				expect(await members.revokeInvitation(ids.t1, boss, inv.id)).toBe(false);
				expect(await members.revokeInvitation(team, boss, inv.id)).toBe(true);
				expect(await members.invitationsFor('1200')).toEqual([]);
				await members.createInvitation(team, boss, { id: 1200, login: 'late' }, 'member');
				await sql!`update invitation set expires_at = now() - interval '1 minute' where github_id = 1200`;
				expect(await members.invitationsFor('1200')).toEqual([]);
				expect(r.ok).toBe(true);
				await members.removeMember(team, boss, other);
			});
		});

		describe('joining by GitHub access', () => {
			const access = (ids: number[]) => ({
				visibleInstallationIds: async () => ids,
				orgRole: async () => null,
				fetchInstallation: async () => null
			});

			it('admits a person who can see the tenant’s organisation, and says so in the audit log', async () => {
				const stranger = await user(1300, 'stranger1');
				expect(await members.admitsStranger('1300', access([200]))).toBe(true);
				expect(await members.joinByGithub(stranger, access([200]))).toEqual({
					joined: [team],
					full: []
				});
				expect(
					await sql!`select role, source from tenant_member where tenant_id = ${team} and user_id = ${stranger}`
				).toEqual([{ role: 'member', source: 'github' }]);
				expect(await members.joinByGithub(stranger, access([200]))).toEqual({
					joined: [],
					full: []
				});
				await members.removeMember(team, boss, stranger);
			});

			it('does not admit anyone for a personal account, an unrelated installation, or when switched off', async () => {
				await sql!`insert into installation (id, tenant_id, account_login, account_type, account_id) values (201, ${team}, 'someone', 'User', 77)`;
				expect(await members.admitsStranger('9999', access([201]))).toBe(false);
				expect(await members.admitsStranger('9999', access([777]))).toBe(false);
				await members.setJoinByGithub(team, boss, false);
				expect(await members.admitsStranger('9999', access([200]))).toBe(false);
				await members.setJoinByGithub(team, boss, true);
				await sql!`update tenant set status = 'suspended' where id = ${team}`;
				expect(await members.admitsStranger('9999', access([200]))).toBe(false);
				await sql!`update tenant set status = 'active' where id = ${team}`;
			});

			it('admits a stranger who holds an invitation, whatever GitHub shows', async () => {
				await members.createInvitation(team, boss, { id: 1400, login: 'invitee' }, 'member');
				expect(await members.admitsStranger('1400', access([]))).toBe(true);
			});
		});

		describe('project roles from GitHub (§6.1)', () => {
			let roles: typeof import('./github-roles.ts');
			let pa: typeof import('./project-access.ts');
			let web2: string;
			const gh = (repos: Record<string, object[]>) =>
				({
					rest: async (path: string) => {
						const id = /installations\/(\d+)\//.exec(path)![1];
						if (!(id in repos))
							throw new (await import('./github-client.ts')).GitHubError(404, 'no');
						return { body: { repositories: repos[id] }, next: null };
					}
				}) as unknown as import('./github-client.ts').GitHubClient;
			beforeAll(async () => {
				roles = await import('./github-roles.ts');
				pa = await import('./project-access.ts');
				web2 = String(
					(
						await sql!`insert into project (github_repo_id, owner, repo, installation_id, tenant_id) values (301, 'teamorg', 'api', 200, ${team}) returning id`
					)[0].id
				);
			});

			it('derives a role per repository from the person’s permission, and removes what GitHub no longer reports', async () => {
				const n = await roles.refreshGithubRoles(
					gh({
						200: [
							{ id: 300, permissions: { push: true, pull: true } },
							{ id: 301, permissions: { pull: true } }
						]
					}),
					dev,
					team
				);
				expect(n).toBe(2);
				expect(
					await sql!`select project_id::text, role, source from membership where user_id = ${dev} order by project_id`
				).toEqual([
					{ project_id: teamWeb, role: 'editor', source: 'github' },
					{ project_id: web2, role: 'viewer', source: 'github' }
				]);
				await roles.refreshGithubRoles(
					gh({ 200: [{ id: 300, permissions: { admin: true } }] }),
					dev,
					team
				);
				expect(
					await sql!`select project_id::text, role from membership where user_id = ${dev}`
				).toEqual([{ project_id: teamWeb, role: 'maintainer' }]);
				// An installation they can no longer reach gives nothing.
				await roles.refreshGithubRoles(gh({}), dev, team);
				expect(await sql!`select 1 from membership where user_id = ${dev}`).toEqual([]);
				expect(
					(
						await sql!`select github_synced_at from tenant_member where user_id = ${dev} and tenant_id = ${team}`
					)[0].github_synced_at
				).not.toBeNull();
			});

			it('never overwrites or removes an admin’s manual override', async () => {
				expect(await pa.setProjectRole(team, boss, teamWeb, dev, 'none')).toEqual({ ok: true });
				await roles.refreshGithubRoles(
					gh({
						200: [
							{ id: 300, permissions: { admin: true } },
							{ id: 301, permissions: { push: true } }
						]
					}),
					dev,
					team
				);
				expect(
					await sql!`select project_id::text, role, source from membership where user_id = ${dev} order by project_id`
				).toEqual([
					{ project_id: teamWeb, role: 'none', source: 'manual' },
					{ project_id: web2, role: 'editor', source: 'github' }
				]);
				await roles.refreshGithubRoles(gh({}), dev, team);
				expect(await sql!`select role from membership where user_id = ${dev}`).toEqual([
					{ role: 'none' }
				]);
				expect(await pa.setProjectRole(team, boss, teamWeb, dev, 'inherit')).toEqual({ ok: true });
				expect(await sql!`select 1 from membership where user_id = ${dev}`).toEqual([]);
			});

			it('claims a refresh once an hour', async () => {
				await sql!`update tenant_member set github_synced_at = null where user_id = ${dev}`;
				expect(await roles.claimGithubRefresh(dev, team)).toBe(true);
				expect(await roles.claimGithubRefresh(dev, team)).toBe(false);
				expect(roles.githubRolesDue(null)).toBe(true);
				expect(roles.githubRolesDue(new Date().toISOString())).toBe(false);
				expect(roles.githubRolesDue(new Date(Date.now() - 2 * 3_600_000).toISOString())).toBe(true);
			});

			it('shows who has what on a project, with where it comes from', async () => {
				await pa.setProjectRole(team, boss, teamWeb, dev, 'viewer');
				const rows = await pa.projectAccess(team, teamWeb, 'managed', 'editor');
				expect(rows.map((r) => [r.login, r.role, r.source])).toEqual([
					['boss1', 'maintainer', 'admin'],
					['dev1', 'viewer', 'manual']
				]);
				expect((await pa.projectAccess(team, teamWeb, 'github', 'none')).length).toBe(2);
				expect(await pa.setProjectRole(team, boss, teamWeb, '1', 'viewer')).toMatchObject({
					ok: false
				});
				expect(await pa.setProjectRole(ids.t1, boss, teamWeb, dev, 'viewer')).toMatchObject({
					ok: false
				});
			});

			it('drops derived roles when a tenant moves to managed access, and makes them due when it moves back', async () => {
				await sql!`insert into membership (user_id, project_id, role, source) values (${dev}, ${web2}, 'viewer', 'github')`;
				await pa.setAccessMode(team, boss, 'managed', 'viewer');
				expect(
					await sql!`select source from membership where user_id = ${dev} and project_id = ${web2}`
				).toEqual([]);
				expect(
					await sql!`select source from membership where user_id = ${dev} and project_id = ${teamWeb}`
				).toEqual([{ source: 'manual' }]);
				await pa.setAccessMode(team, boss, 'github', 'none');
				expect(
					(
						await sql!`select github_synced_at from tenant_member where tenant_id = ${team} and user_id = ${dev}`
					)[0].github_synced_at
				).toBeNull();
				expect(
					await sql!`select access, default_project_role from tenant_setting where tenant_id = ${team}`
				).toEqual([{ access: 'github', default_project_role: 'none' }]);
				await pa.setAccessMode(team, boss, 'managed', 'none');
			});
		});

		describe('support sessions (§6.3)', () => {
			let support: typeof import('./support.ts');
			beforeAll(async () => {
				support = await import('./support.ts');
			});

			it('need a reason, last an hour, appear in the tenant’s audit log, and can be ended', async () => {
				expect(await support.startSupport('1', team, ' ok ')).toMatchObject({ ok: false });
				expect(await support.startSupport('1', team, 'Looking into a sync problem')).toEqual({
					ok: true
				});
				const t = await tenants.supportTenant('1');
				expect(t).toMatchObject({ slug: 'team', support: true, role: null });
				expect(Date.parse(t!.until!) - Date.now()).toBeGreaterThan(55 * 60_000);
				const audit = await (await import('./platform.ts')).auditLog(team, 5);
				expect(audit.find((a) => a.action === 'support.opened')?.data).toMatchObject({
					reason: 'Looking into a sync problem'
				});
				await support.endSupport('1');
				expect(await tenants.supportTenant('1')).toBeNull();
				expect(
					(await (await import('./platform.ts')).auditLog(team, 5)).some(
						(a) => a.action === 'support.ended'
					)
				).toBe(true);
			});

			it('lapse after an hour', async () => {
				await support.startSupport('1', team, 'Another look');
				await sql!`update support_session set expires_at = now() - interval '1 second' where ended_at is null`;
				expect(await tenants.supportTenant('1')).toBeNull();
			});
		});

		describe('users and accounts', () => {
			let users: typeof import('./users.ts');
			beforeAll(async () => {
				users = await import('./users.ts');
			});

			it('lists users with their tenants, by search', async () => {
				const found = await users.listUsers('boss1');
				expect(found.map((u) => [u.login, u.tenants.map((t) => t.name)])).toEqual([
					['boss1', ['Team']]
				]);
			});

			it('will not disable the only admin of a tenant, and says which', async () => {
				await sql!`update tenant_member set role = 'member' where tenant_id = ${team} and user_id = ${dev}`.catch(
					() => {}
				);
				expect(await users.setUserDisabled(boss, '1', true)).toMatchObject({
					ok: false,
					reason: expect.stringContaining('Team')
				});
				expect(await users.lastAdminProblem(boss)).toContain('Team');
			});

			it('disables and enables someone who is not the last admin', async () => {
				expect(await users.setUserDisabled(dev, '1', true)).toEqual({ ok: true });
				expect((await users.listUsers('dev1'))[0].disabled).toBe(true);
				expect(await users.setUserDisabled(dev, '1', false)).toEqual({ ok: true });
			});

			it('deletes an account that is not a last admin, and keeps what they edited', async () => {
				await sql!`insert into edit_log (project_id, user_id, item_id, op) values (${teamWeb}, ${dev}, 'Z1', 'edit')`;
				expect(await members.deleteAccount(dev, await users.lastAdminProblem(dev))).toEqual({
					ok: true
				});
				expect(await sql!`select 1 from app_user where id = ${dev}`).toEqual([]);
				expect(await sql!`select user_id from edit_log where item_id = 'Z1'`).toEqual([
					{ user_id: null }
				]);
			});

			it('refuses to delete the last admin', async () => {
				expect(await members.deleteAccount(boss, await users.lastAdminProblem(boss))).toMatchObject(
					{ ok: false }
				);
				expect(await sql!`select 1 from app_user where id = ${boss}`).toHaveLength(1);
			});
		});
	});

	describe('tiers, quotas and billing (§7)', () => {
		let tiers: typeof import('./tiers.ts');
		let planQ: typeof import('./plan-queries.ts');
		let plans: typeof import('./plans.ts');
		let billing: typeof import('./billing.ts');
		let members: typeof import('./members.ts');
		let pt: string; // a tenant for this block
		let free: string, team: string, biz: string;
		const admin = '1';
		beforeAll(async () => {
			tiers = await import('./tiers.ts');
			planQ = await import('./plan-queries.ts');
			plans = await import('./plans.ts');
			billing = await import('./billing.ts');
			members = await import('./members.ts');
			free = String((await sql!`select id from tier order by position limit 1`)[0].id);
			await tiers.createTier(admin, 'Team');
			await tiers.createTier(admin, 'Business');
			[team, biz] = (
				await sql!`select id::text from tier where name in ('Team', 'Business') order by position`
			).map((r) => r.id as string);
			pt = String(
				(
					await sql!`insert into tenant (slug, name, tier_id) values ('plantest', 'Plan Test', ${free}) returning id`
				)[0].id
			);
			await sql!`insert into tenant_setting (tenant_id) values (${pt})`;
			await sql!`insert into tenant_member (tenant_id, user_id, role) values (${pt}, 1, 'admin')`;
		});

		it('starts with one free, unlimited tier whose AI allowance is the deployment’s own', async () => {
			const plan = await plans.planOf(pt);
			expect(plan.tier?.name).toBe('Default');
			expect(plan.limits).toEqual({ members: null, projects: null, ai_tokens_daily: 50_000 });
			expect(plan.flags.ai).toBe(true);
		});

		it('orders tiers, and refuses to disable the default', async () => {
			expect((await tiers.tiersView()).tiers.map((t) => t.name)).toEqual([
				'Default',
				'Team',
				'Business'
			]);
			await tiers.moveTier(admin, biz, 'up');
			expect((await tiers.tiersView()).tiers.map((t) => t.name)).toEqual([
				'Default',
				'Business',
				'Team'
			]);
			await tiers.moveTier(admin, biz, 'down');
			expect(await tiers.updateTier(admin, free, 'Default', false)).toMatchObject({ ok: false });
		});

		it('sets limits per tier, inheriting from below, with an explicit unlimited that beats a number', async () => {
			await tiers.setTierQuota(admin, free, 'members', '3');
			await tiers.setTierQuota(admin, team, 'members', '20');
			await tiers.setTierQuota(admin, biz, 'members', 'unlimited');
			await tiers.setTierQuota(admin, free, 'projects', '2');
			expect(await tiers.setTierQuota(admin, free, 'members', 'lots')).toMatchObject({ ok: false });
			const at = async (tier: string) => {
				await sql!`update tenant set tier_id = ${tier} where id = ${pt}`;
				return (await plans.planOf(pt)).limits;
			};
			expect(await at(free)).toMatchObject({ members: 3, projects: 2 });
			expect(await at(team)).toMatchObject({ members: 20, projects: 2 });
			expect(await at(biz)).toMatchObject({ members: null, projects: 2 });
			await sql!`update tenant set tier_id = ${free} where id = ${pt}`;
		});

		it('puts the AI flag on from a tier, off below it', async () => {
			await tiers.setFlag(admin, 'ai', true, team);
			expect(await plans.aiAllowed(pt)).toBe(false);
			await sql!`update tenant set tier_id = ${team} where id = ${pt}`;
			expect(await plans.aiAllowed(pt)).toBe(true);
			await sql!`update tenant_setting set ai_enabled = false where tenant_id = ${pt}`;
			expect(await plans.aiAllowed(pt)).toBe(false);
			await sql!`update tenant_setting set ai_enabled = true where tenant_id = ${pt}`;
			await sql!`update tenant set tier_id = ${free} where id = ${pt}`;
			await tiers.setFlagOverride(admin, pt, 'ai', 'on', 'a trial', '');
			expect(await plans.aiAllowed(pt)).toBe(true);
			await tiers.setFlagOverride(admin, pt, 'ai', 'remove', '', '');
			expect(await plans.aiAllowed(pt)).toBe(false);
			await tiers.setFlag(admin, 'ai', true, null);
		});

		it('overrides one limit with a reason and an expiry, and one tier without payment', async () => {
			expect(await tiers.setQuotaOverride(admin, pt, 'members', '50', '', '')).toMatchObject({
				ok: false
			});
			await tiers.setQuotaOverride(admin, pt, 'members', '50', 'a friend', '');
			expect((await plans.planOf(pt)).limits.members).toBe(50);
			await tiers.setQuotaOverride(admin, pt, 'members', '50', 'a friend', '2020-01-01');
			expect((await plans.planOf(pt)).limits.members).toBe(3);
			await tiers.setQuotaOverride(admin, pt, 'members', 'remove', '', '');
			await tiers.setTierOverride(admin, pt, biz);
			expect((await plans.planOf(pt)).limits.members).toBeNull();
			expect((await plans.planOf(pt)).overridden).toBe(true);
			await tiers.setTierOverride(admin, pt, null);
			expect((await tiers.tenantOverrides(pt)).quotas).toEqual([]);
		});

		it('writes every change to the audit log with before and after', async () => {
			const log = await (await import('./platform.ts')).auditLog(null, 60);
			const q = log.find(
				(a) => a.action === 'tier.quota' && (a.data as { after?: string }).after === 'unlimited'
			);
			expect(q?.data).toMatchObject({ quota: 'members', after: 'unlimited' });
			expect(log.some((a) => a.action === 'tier.created')).toBe(true);
		});

		describe('limits', () => {
			beforeAll(async () => {
				await sql!`insert into installation (id, tenant_id, account_login, account_type, account_id) values (400, ${pt}, 'planorg', 'Organization', 4000)`;
				for (const n of [1, 2, 3, 4])
					await sql!`insert into project (github_repo_id, owner, repo, installation_id, tenant_id) values (${500 + n}, 'planorg', ${`r${n}`}, 400, ${pt})`;
			});

			it('keeps the oldest projects within the project limit and lists the rest as over the plan', async () => {
				expect(await planQ.applyProjectLimit(sql!, pt)).toHaveLength(2);
				expect(
					await sql!`select repo from project where tenant_id = ${pt} and over_limit order by id`
				).toEqual([{ repo: 'r3' }, { repo: 'r4' }]);
				const shown = await (await import('./projects.ts')).allProjects(pt);
				expect(shown.map((p) => p.repo)).toEqual(['r1', 'r2']);
				expect(
					(await (await import('./projects.ts')).activeProjects()).some((p) => p.repo === 'r3')
				).toBe(false);
				expect((await plans.usageOf(pt)).projects).toBe(2);
			});

			it('lets an admin choose which stay, and takes nothing away', async () => {
				await sql!`update project set pinned = true where repo = 'r4'`;
				await planQ.applyProjectLimit(sql!, pt);
				expect(
					await sql!`select repo from project where tenant_id = ${pt} and over_limit order by id`
				).toEqual([{ repo: 'r2' }, { repo: 'r3' }]);
				expect(await sql!`select count(*)::int as n from project where tenant_id = ${pt}`).toEqual([
					{ n: 4 }
				]);
			});

			it('applies a raised limit at once', async () => {
				await tiers.setTierQuota(admin, free, 'projects', '10');
				await tiers.reapplyAll();
				expect(await sql!`select 1 from project where tenant_id = ${pt} and over_limit`).toEqual(
					[]
				);
				await tiers.setTierQuota(admin, free, 'projects', '2');
				await tiers.reapplyAll();
				expect(
					await sql!`select count(*)::int as n from project where tenant_id = ${pt} and over_limit`
				).toEqual([{ n: 2 }]);
			});

			it('refuses new members and invitations at the member limit, and nobody is removed', async () => {
				await tiers.setTierQuota(admin, free, 'members', '2');
				await sql!`insert into app_user (github_id, github_login) values (2001, 'm2'), (2002, 'm3') on conflict do nothing`;
				const [m2, m3] = (
					await sql!`select id::text from app_user where github_id in (2001, 2002) order by github_id`
				).map((r) => r.id as string);
				await sql!`insert into tenant_member (tenant_id, user_id, role) values (${pt}, ${m2}, 'member')`;
				expect(
					await members.createInvitation(pt, admin, { id: 2002, login: 'm3' }, 'member')
				).toMatchObject({ ok: false, reason: expect.stringContaining('allows 2 members') });
				await sql!`delete from invitation where tenant_id = ${pt}`;
				const g = {
					visibleInstallationIds: async () => [400],
					orgRole: async () => null,
					fetchInstallation: async () => null
				};
				await expect(members.joinByGithub(m3, g)).resolves.toEqual({
					joined: [],
					full: ['Plan Test']
				});
				expect(
					await sql!`select count(*)::int as n from tenant_member where tenant_id = ${pt}`
				).toEqual([{ n: 2 }]);
				await tiers.setTierQuota(admin, free, 'members', '5');
				await expect(members.joinByGithub(m3, g)).resolves.toEqual({ joined: [pt], full: [] });
			});

			it('reports what is over or close, for the banner', async () => {
				await tiers.setTierQuota(admin, free, 'members', '3');
				const r = await plans.planReport(pt);
				expect(r.levels.members).toBe('over');
				expect(r.notices.join(' ')).toContain('limit of 3 members');
				await tiers.setTierQuota(admin, free, 'members', 'inherit');
			});

			it('stops AI for the day at the tenant’s allowance, counting questions asked by its members', async () => {
				await tiers.setTierQuota(admin, free, 'ai_tokens_daily', '1000');
				expect(await plans.aiTokensLeft(pt)).toBe(1000);
				await sql!`insert into inference_usage (scope, day, tokens) values (${`tenant:${pt}`}, current_date, 600)`;
				const [{ id: member }] =
					await sql!`select user_id as id from tenant_member where tenant_id = ${pt} and role = 'member' limit 1`;
				await sql!`insert into inference_usage (scope, day, tokens) values (${`ask:${member}`}, current_date, 500)`;
				expect(await plans.aiTokensLeft(pt)).toBe(0);
				await tiers.setTierQuota(admin, free, 'ai_tokens_daily', 'unlimited');
				expect(await plans.aiTokensLeft(pt)).toBeNull();
				await tiers.setTierQuota(admin, free, 'ai_tokens_daily', 'inherit');
			});
		});

		describe('billing with the stub provider', () => {
			it('sells only what has an active price', async () => {
				expect(await billing.startCheckout(pt, admin, team, 'month')).toMatchObject({
					ok: false,
					reason: 'That plan is not on sale.'
				});
				await tiers.setPrice(admin, team, 'month', '1200');
				await tiers.setPrice(admin, team, 'year', '12000');
				expect(
					(await tiers.tiersView()).tiers
						.find((t) => t.id === team)!
						.prices.map((p) => [p.interval, p.amountMinor])
				).toEqual([
					['month', 1200],
					['year', 12000]
				]);
			});

			it('makes a customer, a subscription and a checkout, and moves nobody until it is paid', async () => {
				const r = await billing.startCheckout(pt, admin, team, 'month');
				expect(r).toMatchObject({ ok: true, url: expect.stringMatching(/^\/billing\/stub\/\d+$/) });
				expect(
					await sql!`select provider_ref from billing_customer where tenant_id = ${pt}`
				).toHaveLength(1);
				const [co] = await sql!`select id::text, status from checkout where tenant_id = ${pt}`;
				expect(co.status).toBe('open');
				await billing.reconcile(pt);
				expect((await sql!`select tier_id::text from tenant where id = ${pt}`)[0].tier_id).toBe(
					free
				);
			});

			it('abandons: nothing changes, and the checkout says so', async () => {
				const [co] =
					await sql!`select id::text, (select provider_ref from subscription s where s.id = c.subscription_id) as ref from checkout c where tenant_id = ${pt}`;
				await billing.stubAbandon(co.ref);
				expect(await billing.finishCheckout(pt, co.id)).toBe('abandoned');
				expect((await sql!`select tier_id::text from tenant where id = ${pt}`)[0].tier_id).toBe(
					free
				);
			});

			it('completes: reconcile reads the provider and moves the tenant to the paid tier', async () => {
				await billing.startCheckout(pt, admin, team, 'month');
				const [co] =
					await sql!`select c.id::text, s.provider_ref as ref from checkout c join subscription s on s.id = c.subscription_id where c.tenant_id = ${pt} and c.status = 'open'`;
				await billing.stubComplete(co.ref);
				expect(await billing.finishCheckout(pt, co.id)).toBe('complete');
				expect((await sql!`select tier_id::text from tenant where id = ${pt}`)[0].tier_id).toBe(
					team
				);
				const subs = await billing.subscriptionsOf(pt);
				expect(subs[0]).toMatchObject({
					tierName: 'Team',
					status: 'active',
					interval: 'month',
					amountMinor: 1200
				});
				expect(new Date(subs[0].currentPeriodEnd!).getTime()).toBeGreaterThan(
					Date.now() + 25 * 86_400_000
				);
			});

			it('cancel keeps the tier until the period ends, then reconcile drops to the default', async () => {
				expect(await billing.cancelSubscription(pt, admin)).toBe(true);
				expect((await billing.subscriptionsOf(pt))[0]).toMatchObject({
					status: 'active',
					cancelAtPeriodEnd: true
				});
				expect((await sql!`select tier_id::text from tenant where id = ${pt}`)[0].tier_id).toBe(
					team
				);
				await sql!`update stub_subscription set period_end = now() - interval '1 hour' where status = 'active'`;
				await billing.reconcile(pt);
				expect((await billing.subscriptionsOf(pt))[0].status).toBe('cancelled');
				expect((await sql!`select tier_id::text from tenant where id = ${pt}`)[0].tier_id).toBe(
					free
				);
				expect(await billing.cancelSubscription(pt, admin)).toBe(false);
			});

			it('keeps a cancelled subscription’s tier while the paid period still runs', async () => {
				await billing.startCheckout(pt, admin, team, 'year');
				const [co] =
					await sql!`select c.id::text, s.provider_ref as ref from checkout c join subscription s on s.id = c.subscription_id where c.tenant_id = ${pt} and c.status = 'open'`;
				await billing.stubComplete(co.ref);
				await billing.finishCheckout(pt, co.id);
				await billing.cancelSubscription(pt, admin);
				await billing.reconcileAll();
				expect((await sql!`select tier_id::text from tenant where id = ${pt}`)[0].tier_id).toBe(
					team
				);
			});

			it('renews on its own, as a card would', async () => {
				await sql!`update stub_subscription set period_end = now() - interval '1 day', cancel_at_period_end = false where status = 'active'`;
				await billing.reconcile(pt);
				const sub = (await billing.subscriptionsOf(pt)).find((s) => s.status === 'active');
				expect(new Date(sub!.currentPeriodEnd!).getTime()).toBeGreaterThan(Date.now());
			});

			it('writes the audit trail', async () => {
				const log = await (await import('./platform.ts')).auditLog(pt, 40);
				expect(log.map((a) => a.action)).toEqual(
					expect.arrayContaining(['billing.checkout', 'billing.tier', 'billing.cancelled'])
				);
			});
		});

		it('gives a new tenant the default tier', async () => {
			const made = await tenants.createTenant('2', 'Tiered', 'tiered', 'active');
			expect(made.ok).toBe(true);
			expect((await sql!`select tier_id::text from tenant where slug = 'tiered'`)[0].tier_id).toBe(
				free
			);
			await tiers.setDefaultTier(admin, team);
			const m2 = await tenants.createTenant('2', 'Tiered 2', 'tiered-2', 'active');
			expect(m2.ok).toBe(true);
			expect(
				(await sql!`select tier_id::text from tenant where slug = 'tiered-2'`)[0].tier_id
			).toBe(team);
			expect(await tiers.setDefaultTier(admin, '999999')).toMatchObject({ ok: false });
		});
	});
});
