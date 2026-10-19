// References to another repository's items (PM36): `<repo>:<id>`, where the repo is the project's
// address in this tenant (`bloomprint`, or `owner--repo` where two share a name, as in `/p/{repo}`)
// and the id a backlog item's or an epic's. They appear in `Epic:`, `Waiting:` and a PR body's
// `Backlog:` line. A repo is compared in lower case, an id in upper case.
import { LETTER_ID } from './meta.ts';

export interface CrossRef {
	/** The project's address, lower case. */
	repo: string;
	id: string;
}

const REPO = /^[a-z0-9._-]+$/i;

/** One word as a reference: `bloomprint:BP40` (backticks and bold dropped; a repo may have `_`), or null. */
export function parseRef(word: string): CrossRef | null {
	const w = word.replace(/[`*]/g, '').trim();
	const i = w.lastIndexOf(':');
	if (i <= 0) return null;
	const repo = w.slice(0, i);
	const id = normaliseId(w.slice(i + 1));
	return REPO.test(repo) && LETTER_ID.test(id) ? { repo: repo.toLowerCase(), id } : null;
}

/** An id as written in a backlog: capitals and a number, with a lower-case suffix (`A1a`). */
function normaliseId(raw: string): string {
	const m = raw.match(/^([A-Za-z]{1,4})([0-9]+)([A-Za-z]?)$/);
	return m ? `${m[1].toUpperCase()}${m[2]}${m[3].toLowerCase()}` : raw;
}

/** Every reference in free text, such as a `Waiting:` reason: "plinth:PL4 being released". */
export function findRefs(text: string): CrossRef[] {
	const out: CrossRef[] = [];
	const seen = new Set<string>();
	for (const m of text.matchAll(
		/(?<![\w./:-])([A-Za-z0-9][A-Za-z0-9._-]*:[A-Za-z]{1,4}[0-9]+[a-z]?)(?![\w])/g
	)) {
		const r = parseRef(m[1]);
		const k = r && `${r.repo}:${r.id}`;
		if (r && k && !seen.has(k)) {
			seen.add(k);
			out.push(r);
		}
	}
	return out;
}

export const refString = (r: CrossRef): string => `${r.repo}:${r.id}`;

/** Whether a reference's repo is this project: its name, or `owner--repo`. */
export function isHere(repo: string, here: { owner: string; repo: string }): boolean {
	const r = repo.toLowerCase();
	return r === here.repo.toLowerCase() || r === `${here.owner}--${here.repo}`.toLowerCase();
}
