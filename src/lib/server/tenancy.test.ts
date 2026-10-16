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
		await migrate('009_signup.sql', '008_tenants.sql');
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
			archived: false
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
			await sql!`update app_user set platform_role = 'none'`;
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
});
