// Small formatting helpers shared by server and browser.

/** "just now", "12 min ago", "3 h ago", "4 days ago", or a date. */
export function ago(iso: string | null | undefined, now = Date.now()): string {
	if (!iso) return 'never';
	const s = Math.max(0, (now - Date.parse(iso)) / 1000);
	if (s < 60) return 'just now';
	if (s < 3600) return `${Math.floor(s / 60)} min ago`;
	if (s < 86_400) return `${Math.floor(s / 3600)} h ago`;
	if (s < 30 * 86_400) return `${Math.floor(s / 86_400)} day${s < 2 * 86_400 ? '' : 's'} ago`;
	return iso.slice(0, 10);
}

export function plural(n: number, one: string, many = `${one}s`): string {
	return `${n} ${n === 1 ? one : many}`;
}

export const STATUS_ORDER = [
	'in progress',
	'in review',
	'blocked',
	'built',
	'todo',
	'done'
] as const;

/** A span in hours as "40 min", "14 h" or "3.5 days". */
export function duration(hours: number | null | undefined): string {
	if (hours === null || hours === undefined || Number.isNaN(hours)) return '—';
	if (hours < 1) return `${Math.max(1, Math.round(hours * 60))} min`;
	if (hours < 48) return `${Math.round(hours)} h`;
	return `${Math.round((hours / 24) * 10) / 10} days`;
}
