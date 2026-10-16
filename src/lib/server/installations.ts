// Connecting GitHub accounts to a tenant (specs/tenants.md §3.2): the single-use state that brings
// a person back from GitHub, and the checks that make a claim safe. The GitHub calls are passed
// in, so the checks run against a plain database in tests.
import { createHash } from 'node:crypto';
import { randomToken } from './crypto.ts';
import { db } from './db.ts';

const hash = (token: string) => createHash('sha256').update(token).digest('hex');

/** An hour to go to GitHub, choose the account and come back. */
const STATE_TTL = '1 hour';

export interface GitHubAccess {
	/** `GET /user/installations`: the installations the person's own token can see. */
	visibleInstallationIds(): Promise<number[]>;
	/** `GET /user/memberships/orgs/{org}`: their role in the organisation, or null. */
	orgRole(org: string): Promise<string | null>;
	/** `GET /app/installations/{id}` as the App, for an installation no webhook has announced yet. */
	fetchInstallation(id: number): Promise<InstallationInfo | null>;
}

export interface InstallationInfo {
	id: number;
	account: { login: string; id: number; type: 'User' | 'Organization' } | null;
	repository_selection: 'all' | 'selected';
	suspended_at: string | null;
}

export interface InstallationRow {
	id: string;
	accountLogin: string;
	accountType: 'User' | 'Organization' | null;
	repositorySelection: 'all' | 'selected' | null;
	createdAt: string;
	claimedAt: string | null;
	suspendedAt: string | null;
	removedAt: string | null;
	tenantId: string | null;
	tenantName: string | null;
	projects: number;
}

/** A state token for `installations/new?state=`: only its hash is stored. */
export async function newSetupState(userId: string, tenantId: string): Promise<string> {
	const token = randomToken(32);
	await db()`
		insert into setup_state (token_hash, user_id, tenant_id, expires_at)
		values (${hash(token)}, ${userId}, ${tenantId}, now() + ${STATE_TTL}::interval)`;
	await db()`delete from setup_state where expires_at < now() - interval '1 day'`;
	return token;
}

/** Spends a state token. Null if it is unknown, used, expired, or someone else's. */
export async function consumeSetupState(
	token: string,
	userId: string
): Promise<{ tenantId: string } | null> {
	const [r] = await db()<{ tenant_id: string }[]>`
		update setup_state set used_at = now()
		where token_hash = ${hash(token)} and used_at is null and expires_at > now() and user_id = ${userId}
		returning tenant_id`;
	return r ? { tenantId: String(r.tenant_id) } : null;
}

export type ClaimResult =
	{ ok: true; installationId: string; accountLogin: string } | { ok: false; reason: string };

/** The installation is recorded when GitHub announces it, but the redirect can arrive first. */
async function ensureRecorded(id: number, gh: GitHubAccess): Promise<boolean> {
	const [have] = await db()`select 1 from installation where id = ${id}`;
	if (have) return true;
	const info = await gh.fetchInstallation(id);
	if (!info) return false;
	await db()`
		insert into installation (id, account_login, account_type, account_id, repository_selection, suspended_at)
		values (${info.id}, ${info.account?.login ?? ''}, ${info.account?.type ?? null}, ${info.account?.id ?? null},
			${info.repository_selection ?? null}, ${info.suspended_at})
		on conflict (id) do nothing`;
	return true;
}

/** Whether the person controls the GitHub account an installation is on: it is their own
 * account, they administer the organisation, or they are the one who installed it. */
async function controls(
	user: { githubId: string },
	inst: {
		account_type: string | null;
		account_login: string;
		account_id: string | null;
		sender_github_id: string | null;
	},
	gh: GitHubAccess
): Promise<boolean> {
	if (inst.sender_github_id && inst.sender_github_id === user.githubId) return true;
	if (inst.account_type === 'User') return inst.account_id === user.githubId;
	if (inst.account_type === 'Organization')
		return (await gh.orgRole(inst.account_login)) === 'admin';
	return false;
}

/** Connects an installation to a tenant if every check passes (§3.2 step 4). The reason a claim
 * fails is said, and an installation held by another tenant names no one. */
export async function claimInstallation(
	user: { id: string; githubId: string },
	tenantId: string,
	installationId: number,
	gh: GitHubAccess
): Promise<ClaimResult> {
	if (!(await gh.visibleInstallationIds()).includes(installationId))
		return { ok: false, reason: 'Your GitHub sign-in cannot see that installation.' };
	if (!(await ensureRecorded(installationId, gh)))
		return { ok: false, reason: 'GitHub does not know that installation.' };

	const [inst] = await db()<
		{
			account_type: string | null;
			account_login: string;
			account_id: string | null;
			sender_github_id: string | null;
			tenant_id: string | null;
			removed_at: Date | null;
		}[]
	>`select account_type, account_login, account_id, sender_github_id, tenant_id, removed_at
		from installation where id = ${installationId}`;
	if (inst.removed_at)
		return { ok: false, reason: 'That installation has been removed from GitHub.' };
	if (inst.tenant_id && String(inst.tenant_id) !== tenantId)
		return {
			ok: false,
			reason:
				'This GitHub account is already connected to another Project Magic tenant. Ask its admin.'
		};
	if (!(await controls({ githubId: user.githubId }, inst, gh)))
		return {
			ok: false,
			reason: `You are not an admin of ${inst.account_login} on GitHub, so you cannot connect it. Ask an owner to do it.`
		};

	// One statement, so two people claiming at once can't both win.
	const [won] = await db()<{ id: string }[]>`
		update installation set tenant_id = ${tenantId}, claimed_by = ${user.id}, claimed_at = coalesce(claimed_at, now())
		where id = ${installationId} and (tenant_id is null or tenant_id = ${tenantId})
		returning id`;
	if (!won)
		return {
			ok: false,
			reason:
				'This GitHub account is already connected to another Project Magic tenant. Ask its admin.'
		};
	return { ok: true, installationId: String(installationId), accountLogin: inst.account_login };
}

/** Installations nobody has claimed that this person could: for the "connect one that exists" list. */
export async function claimable(
	user: { githubId: string },
	gh: GitHubAccess
): Promise<{ id: string; accountLogin: string }[]> {
	const visible = await gh.visibleInstallationIds();
	if (!visible.length) return [];
	const rows = await db()<
		{
			id: string;
			account_type: string | null;
			account_login: string;
			account_id: string | null;
			sender_github_id: string | null;
		}[]
	>`select id, account_type, account_login, account_id, sender_github_id from installation
		where tenant_id is null and removed_at is null and id in ${db()(visible)} order by lower(account_login)`;
	const out = [];
	for (const r of rows)
		if (await controls(user, r, gh)) out.push({ id: String(r.id), accountLogin: r.account_login });
	return out;
}

const toRow = (r: {
	id: string;
	account_login: string;
	account_type: InstallationRow['accountType'];
	repository_selection: InstallationRow['repositorySelection'];
	created_at: Date;
	claimed_at: Date | null;
	suspended_at: Date | null;
	removed_at: Date | null;
	tenant_id: string | null;
	tenant_name: string | null;
	projects: number;
}): InstallationRow => ({
	id: String(r.id),
	accountLogin: r.account_login,
	accountType: r.account_type,
	repositorySelection: r.repository_selection,
	createdAt: r.created_at.toISOString(),
	claimedAt: r.claimed_at?.toISOString() ?? null,
	suspendedAt: r.suspended_at?.toISOString() ?? null,
	removedAt: r.removed_at?.toISOString() ?? null,
	tenantId: r.tenant_id ? String(r.tenant_id) : null,
	tenantName: r.tenant_name,
	projects: r.projects
});

const SELECT = `i.id, i.account_login, i.account_type, i.repository_selection, i.created_at, i.claimed_at,
	i.suspended_at, i.removed_at, i.tenant_id, t.name as tenant_name,
	(select count(*)::int from project p where p.installation_id = i.id and p.uninstalled_at is null) as projects`;

/** A tenant's connected installations (the platform sees every tenant's through `allInstallations`). */
export async function tenantInstallations(tenantId: string): Promise<InstallationRow[]> {
	const rows = await db()<Parameters<typeof toRow>[0][]>`
		select ${db().unsafe(SELECT)} from installation i left join tenant t on t.id = i.tenant_id
		where i.tenant_id = ${tenantId} and i.removed_at is null order by lower(i.account_login)`;
	return rows.map(toRow);
}

/** Every installation, for platform admins: claimed ones with their tenant, then unclaimed. */
export async function allInstallations(): Promise<InstallationRow[]> {
	const rows = await db()<Parameters<typeof toRow>[0][]>`
		select ${db().unsafe(SELECT)} from installation i left join tenant t on t.id = i.tenant_id
		where i.removed_at is null order by (i.tenant_id is null) desc, i.created_at`;
	return rows.map(toRow);
}

/** Detaches an installation from its tenant and marks its projects uninstalled. Members, edit logs
 * and pending edits stay with the projects, so reconnecting brings them back (§3.2). */
export async function disconnect(tenantId: string, installationId: number): Promise<boolean> {
	return db().begin(async (tx) => {
		const [r] = await tx`
			update installation set tenant_id = null, claimed_by = null, claimed_at = null
			where id = ${installationId} and tenant_id = ${tenantId} returning id`;
		if (!r) return false;
		await tx`update project set uninstalled_at = coalesce(uninstalled_at, now()) where installation_id = ${installationId}`;
		return true;
	});
}

interface InstallationEvent {
	action: string;
	installation: InstallationInfo;
	sender?: { id: number };
}

/** The `installation` webhook arrives before anyone is redirected back, so every installation is
 * recorded when GitHub announces it, with the account that installed it, unclaimed (§3.2). */
export async function recordInstallationEvent(p: InstallationEvent): Promise<void> {
	const i = p.installation;
	if (!i?.id) return;
	if (p.action === 'deleted') {
		await db()`update installation set removed_at = coalesce(removed_at, now()) where id = ${i.id}`;
		await db()`update project set uninstalled_at = coalesce(uninstalled_at, now()) where installation_id = ${i.id}`;
		return;
	}
	await db()`
		insert into installation (id, account_login, account_type, account_id, sender_github_id, repository_selection, suspended_at)
		values (${i.id}, ${i.account?.login ?? ''}, ${i.account?.type ?? null}, ${i.account?.id ?? null},
			${p.action === 'created' ? (p.sender?.id ?? null) : null}, ${i.repository_selection ?? null}, ${i.suspended_at ?? null})
		on conflict (id) do update set account_login = excluded.account_login, account_type = excluded.account_type,
			account_id = excluded.account_id, repository_selection = excluded.repository_selection,
			suspended_at = ${p.action === 'suspend' ? db()`now()` : p.action === 'unsuspend' ? null : db()`installation.suspended_at`},
			sender_github_id = coalesce(installation.sender_github_id, excluded.sender_github_id), removed_at = null`;
}
