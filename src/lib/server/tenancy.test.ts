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

		it('gives a deployment with one tenant its new installations, as today', async () => {
			await sql!`update tenant set status = 'deleted' where id in (${ids.t1}, ${ids.t2}) or slug = 'acme'`;
			await sync.syncInstallations(
				app([inst(3, 'newcomer')]),
				forInstall({ 3: [repo(30, 'newcomer', 'app')] }),
				sql!
			);
			const [i] =
				await sql!`select tenant_id::text, claimed_at is not null as claimed from installation where id = 3`;
			expect(i.claimed).toBe(true);
			expect(i.tenant_id).toBe(
				String((await sql!`select id from tenant where slug = 'default'`)[0].id)
			);
		});
	});
});
