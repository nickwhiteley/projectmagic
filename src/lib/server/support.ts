// A platform admin looking into a tenant (specs/tenants.md §6.3): needs a reason, lasts an hour,
// is read-only, and is written to the audit log where the tenant's own admins can see it.
import { db } from './db.ts';

export const SUPPORT_MINUTES = 60;

export async function startSupport(
	userId: string,
	tenantId: string,
	reason: string
): Promise<{ ok: true } | { ok: false; reason: string }> {
	const why = reason.trim();
	if (why.length < 5)
		return { ok: false, reason: 'Say why, in a few words: the tenant’s admins can read it.' };
	const [t] = await db()`select 1 from tenant where id = ${tenantId} and status <> 'deleted'`;
	if (!t) return { ok: false, reason: 'No such tenant.' };
	await db().begin(async (tx) => {
		await tx`update support_session set ended_at = now() where user_id = ${userId} and ended_at is null`;
		await tx`insert into support_session (tenant_id, user_id, reason, expires_at)
			values (${tenantId}, ${userId}, ${why}, now() + ${`${SUPPORT_MINUTES} minutes`}::interval)`;
		await tx`insert into audit_log (tenant_id, actor_user_id, action, target, data_json)
			values (${tenantId}, ${userId}, 'support.opened', ${`tenant:${tenantId}`}, ${tx.json({ reason: why, minutes: SUPPORT_MINUTES })})`;
	});
	return { ok: true };
}

export async function endSupport(userId: string): Promise<void> {
	const ended = await db()<{ tenant_id: string }[]>`
		update support_session set ended_at = now() where user_id = ${userId} and ended_at is null and expires_at > now()
		returning tenant_id`;
	for (const s of ended)
		await db()`insert into audit_log (tenant_id, actor_user_id, action, target)
			values (${s.tenant_id}, ${userId}, 'support.ended', ${`tenant:${s.tenant_id}`})`;
}
