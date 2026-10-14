// The `docs:` and `docs_exclude:` patterns in .projectmagic.yml (spec §4): `*` matches within a
// path segment, `**` across segments, anything else literally.

export function globToRegExp(glob: string): RegExp {
	let re = '';
	for (let i = 0; i < glob.length; i++) {
		const c = glob[i];
		if (c === '*' && glob[i + 1] === '*') {
			// `**/` matches zero or more directories; a trailing `**` matches the rest.
			if (glob[i + 2] === '/') {
				re += '(?:.*/)?';
				i += 2;
			} else {
				re += '.*';
				i++;
			}
		} else if (c === '*') re += '[^/]*';
		else if (c === '?') re += '[^/]';
		else re += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
	}
	return new RegExp(`^${re}$`);
}

export function matchesAny(path: string, globs: string[]): boolean {
	return globs.some((g) => globToRegExp(g).test(path));
}

/** The documents to show: those matching `docs` and not `docs_exclude`, markdown only, sorted. */
export function selectDocs(paths: string[], docs: string[], exclude: string[]): string[] {
	return paths
		.filter(
			(p) => p.toLowerCase().endsWith('.md') && matchesAny(p, docs) && !matchesAny(p, exclude)
		)
		.sort((a, b) => {
			const da = a.split('/').length;
			const db = b.split('/').length;
			return da - db || a.localeCompare(b);
		});
}
