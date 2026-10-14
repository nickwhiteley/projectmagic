// Search (spec §9): ids, titles and bodies across every project the user can see, on main.

export interface Searchable {
	repo: string;
	project: string;
	id: string;
	title: string;
	body: string;
	status: string;
}

export interface Hit extends Searchable {
	/** 0: the id, 1: the title, 2: the body. Lower is better. */
	rank: number;
	/** Body text around the first match. */
	snippet: string | null;
}

// Lower case without accents. Removing combining marks after NFKD keeps the length for ordinary
// accented letters, so an index in the folded text is (nearly always) the same in the original.
const fold = (s: string) => s.toLowerCase().normalize('NFKD').replace(/\p{M}/gu, '');

export function search(items: Searchable[], query: string, limit = 100): Hit[] {
	const q = fold(query.trim());
	if (!q) return [];
	const words = q.split(/\s+/);
	const hits: Hit[] = [];
	for (const it of items) {
		const id = fold(it.id);
		const title = fold(it.title);
		const body = fold(it.body);
		let rank: number;
		if (id === q) rank = 0;
		else if (words.every((w) => title.includes(w) || id === w)) rank = 1;
		else if (words.every((w) => title.includes(w) || body.includes(w) || id === w)) rank = 2;
		else continue;
		let snippet: string | null = null;
		if (rank === 2) {
			const at = body.indexOf(words.find((w) => body.includes(w)) ?? words[0]);
			if (at >= 0) {
				const start = Math.max(0, at - 60);
				snippet =
					(start ? '…' : '') +
					it.body
						.slice(start, at + 120)
						.replace(/\*\*|`/g, '')
						.replace(/\s+/g, ' ')
						.trim() +
					'…';
			}
		}
		hits.push({ ...it, rank, snippet });
	}
	return hits.sort((a, b) => a.rank - b.rank).slice(0, limit);
}
