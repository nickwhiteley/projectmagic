// A tenant's plan inside the app (specs/tenants.md §7): the pure resolution of plan-queries.ts with
// this deployment's own limits as the declared defaults.
import { INFERENCE_DAILY_TOKEN_LIMIT } from '$app/env/private';
import { hasRoom, usageLevel, type Quota, type UsageLevel } from '#lib/core/plans.ts';
import { db } from './db.ts';
import { tenantPlan, tenantUsage, type TenantPlan, type Usage } from './plan-queries.ts';

/** Where no tier or override sets a quota, the deployment's own limit applies. Today that is the
 * daily AI token limit from the environment, so a self-hosted copy behaves as before. */
export const declared = { ai_tokens_daily: INFERENCE_DAILY_TOKEN_LIMIT ?? 50_000 };

export const planOf = (tenantId: string): Promise<TenantPlan> =>
	tenantPlan(db(), tenantId, declared);
export const usageOf = (tenantId: string): Promise<Usage> => tenantUsage(db(), tenantId);

/** Whether AI features are on for the tenant: its tier includes them (or an override does), and its
 * own admins have not turned them off. A person's and a project's opt-outs apply besides. */
export async function aiAllowed(tenantId: string): Promise<boolean> {
	const plan = await planOf(tenantId);
	if (!plan.flags.ai) return false;
	const [s] = await db()<
		{ ai_enabled: boolean }[]
	>`select ai_enabled from tenant_setting where tenant_id = ${tenantId}`;
	return s?.ai_enabled ?? true;
}

/** Tokens the tenant has left today, or null if unlimited. Inference and Ask stop at zero. */
export async function aiTokensLeft(tenantId: string): Promise<number | null> {
	const [plan, usage] = await Promise.all([planOf(tenantId), usageOf(tenantId)]);
	const limit = plan.limits.ai_tokens_daily;
	return limit === null ? null : Math.max(0, limit - usage.aiTokensToday);
}

/** Room for one more of a counted quota (members, projects). */
export async function hasRoomFor(
	tenantId: string,
	quota: 'members' | 'projects',
	extra = 0
): Promise<boolean> {
	const [plan, usage] = await Promise.all([planOf(tenantId), usageOf(tenantId)]);
	const used = quota === 'members' ? usage.members : usage.projects;
	return hasRoom(used + extra, plan.limits[quota]);
}

export interface PlanReport {
	plan: TenantPlan;
	usage: Usage;
	levels: Record<Quota, UsageLevel>;
	/** What is over or close to its limit, for the banner on a tenant's admin pages. */
	notices: string[];
}

const NOUN: Record<Quota, string> = {
	members: 'members',
	projects: 'projects',
	ai_tokens_daily: 'AI tokens today'
};

export async function planReport(tenantId: string): Promise<PlanReport> {
	const [plan, usage] = await Promise.all([planOf(tenantId), usageOf(tenantId)]);
	const used: Record<Quota, number> = {
		members: usage.members,
		projects: usage.projects,
		ai_tokens_daily: usage.aiTokensToday
	};
	const levels = {} as Record<Quota, UsageLevel>;
	const notices: string[] = [];
	for (const q of ['members', 'projects', 'ai_tokens_daily'] as const) {
		levels[q] = usageLevel(used[q], plan.limits[q]);
		const limit = plan.limits[q];
		if (levels[q] === 'over')
			notices.push(
				q === 'ai_tokens_daily'
					? `AI has stopped for today: ${used[q].toLocaleString()} of ${limit!.toLocaleString()} tokens used. It resumes at midnight UTC.`
					: `You are at your plan’s limit of ${limit} ${NOUN[q]}${q === 'members' ? ': no new members can join or be invited.' : ': further repositories are not synced.'}`
			);
		else if (levels[q] === 'warn')
			notices.push(
				`You have used ${used[q].toLocaleString()} of ${limit!.toLocaleString()} ${NOUN[q]}.`
			);
	}
	return { plan, usage, levels, notices };
}

const aiCache = new Map<string, { at: number; on: boolean }>();
/** `aiAllowed`, remembered for half a minute: every page load of a project asks. */
export async function aiAllowedCached(tenantId: string): Promise<boolean> {
	const hit = aiCache.get(tenantId);
	if (hit && Date.now() - hit.at < 30_000) return hit.on;
	const on = await aiAllowed(tenantId);
	aiCache.set(tenantId, { at: Date.now(), on });
	return on;
}
export const forgetAiCache = (tenantId?: string) =>
	tenantId ? aiCache.delete(tenantId) : aiCache.clear();
