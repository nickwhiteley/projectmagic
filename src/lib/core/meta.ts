// An item's meta line (spec §5.1): the first line after its heading, beginning `**Status:**`,
// a run of `**Key:** value` pairs separated by ` · `.

export const STATUSES = ['todo', 'in progress', 'blocked', 'in review', 'built', 'done'] as const;
export type Status = (typeof STATUSES)[number];

export const LETTER_ID = /^[A-Z]{1,4}[0-9]+[a-z]?$/;
export const TASK_ID = /^[0-9]+(\.[0-9]+)*[a-z]?$/;

export type IdKind = 'letter' | 'task';

export function idKind(token: string): IdKind | null {
	if (LETTER_ID.test(token)) return 'letter';
	if (TASK_ID.test(token)) return 'task';
	return null;
}

type KnownKey =
	'status' | 'size' | 'job' | 'branch' | 'plan' | 'waiting' | 'type' | 'found' | 'raised' | 'epic';

export interface MetaEntry {
	/** The key as written, for showing unknown keys as-is. */
	key: string;
	/** The value as written: markdown, trimmed. */
	value: string;
}

export interface Meta {
	entries: MetaEntry[];
	/** null when the Status value isn't one of STATUSES; `statusRaw` keeps what was written. */
	status: Status | null;
	statusRaw: string;
	size?: string;
	job?: string;
	/** Branch names, backticks removed. Usually one. */
	branches: string[];
	/** Plan task numbers. */
	plan: string[];
	waiting?: string;
	type?: string;
	found?: string;
	raised?: string;
	epic?: string;
	/** Entries whose key isn't a known one, kept and shown as-is. */
	unknown: MetaEntry[];
}

const PAIR = /^\*\*([A-Za-z][A-Za-z ]*?):\*\*\s*(.*)$/s;

const unquote = (s: string) => s.trim().replace(/^`(.*)`$/, '$1');

/** `built*` (Orchard's spelling, sometimes escaped as `built\*`) is `built`. */
export function normaliseStatus(raw: string): Status | null {
	const s = raw
		.trim()
		.toLowerCase()
		.replace(/\\?\*$/, '')
		.replace(/\s+/g, ' ');
	return (STATUSES as readonly string[]).includes(s) ? (s as Status) : null;
}

/**
 * Parses one line. Returns null unless it begins with `**Status:**`: a paragraph that opens with
 * another bold key, such as `**Specced:**`, is prose (spike 0.2). A part without a key of its own
 * continues the previous value, so a `Waiting:` reason may itself contain ` · `.
 */
export function parseMeta(line: string): Meta | null {
	if (!/^\*\*Status:\*\*/i.test(line)) return null;
	const entries: MetaEntry[] = [];
	for (const part of line.trim().split(/\s+·\s+/)) {
		const m = part.match(PAIR);
		if (m) entries.push({ key: m[1], value: m[2].trim() });
		else entries[entries.length - 1].value += ` · ${part}`;
	}

	const meta: Meta = {
		entries,
		status: null,
		statusRaw: '',
		branches: [],
		plan: [],
		unknown: []
	};
	for (const e of entries) {
		const key = e.key.toLowerCase() as KnownKey;
		switch (key) {
			case 'status':
				meta.statusRaw = e.value;
				meta.status = normaliseStatus(e.value);
				break;
			case 'branch':
				meta.branches = e.value.split(',').map(unquote).filter(Boolean);
				break;
			case 'plan':
				meta.plan = e.value.split(',').map(unquote).filter(Boolean);
				break;
			case 'size':
			case 'job':
			case 'waiting':
			case 'type':
			case 'found':
			case 'raised':
			case 'epic':
				meta[key] = e.value;
				break;
			default:
				meta.unknown.push(e);
		}
	}
	return meta;
}

/** The inverse of parseMeta, for edits: the entries in their order, keys as written. */
export function formatMeta(entries: MetaEntry[]): string {
	return entries.map((e) => `**${e.key}:** ${e.value}`).join(' · ');
}

/** The meta fields an edit form sets. Undefined leaves a key alone; '' or [] removes it. */
export interface MetaFields {
	status?: Status;
	size?: string;
	job?: string;
	branch?: string;
	plan?: string[];
	waiting?: string;
}

const FIELD_KEYS: [keyof MetaFields, string][] = [
	['status', 'Status'],
	['size', 'Size'],
	['job', 'Job'],
	['branch', 'Branch'],
	['plan', 'Plan'],
	['waiting', 'Waiting']
];

/**
 * A new meta line from the old one and the form's fields. Existing keys keep their place and
 * spelling, so an edit changes as little of the line as it can; new keys are added in the usual
 * order; unknown keys are kept.
 */
export function updateMeta(entries: MetaEntry[], fields: MetaFields): MetaEntry[] {
	const out = entries.map((e) => ({ ...e }));
	for (const [field, key] of FIELD_KEYS) {
		const v = fields[field];
		if (v === undefined) continue;
		const value =
			field === 'branch' && typeof v === 'string' && v.trim()
				? `\`${v.trim().replace(/^`|`$/g, '')}\``
				: Array.isArray(v)
					? v
							.map((x) => x.trim())
							.filter(Boolean)
							.join(', ')
					: String(v).trim();
		const i = out.findIndex((e) => e.key.toLowerCase() === field);
		if (!value) {
			if (i >= 0 && field !== 'status') out.splice(i, 1);
		} else if (i >= 0) out[i].value = value;
		else {
			// After the last known key that comes before this one in the usual order.
			const order = FIELD_KEYS.map(([f]) => f);
			let at = 0;
			out.forEach((e, j) => {
				const k = order.indexOf(e.key.toLowerCase() as keyof MetaFields);
				if (k >= 0 && k < order.indexOf(field)) at = j + 1;
			});
			out.splice(at, 0, { key, value });
		}
	}
	return out;
}
