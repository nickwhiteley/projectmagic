// Helpers for the project pages: rendered markdown with the project's ids linked, cached.
import { renderInline, renderMarkdown, type RenderOptions } from '#lib/core/render.ts';
import type { ProjectState } from '#lib/core/state.ts';

const MAX = 4000;
const cache = new Map<string, string>();

function memo(key: string, make: () => string): string {
	const hit = cache.get(key);
	if (hit !== undefined) return hit;
	const html = make();
	if (cache.size >= MAX) cache.delete(cache.keys().next().value!);
	cache.set(key, html);
	return html;
}

const linkMaps = new WeakMap<ProjectState, Map<string, string>>();

/** Item ids link to their pages; plan task numbers without an item link to the plan. */
export function projectLinks(s: ProjectState): Map<string, string> {
	let m = linkMaps.get(s);
	if (!m) {
		m = new Map();
		for (const t of s.plan?.tasks ?? [])
			if (!t.superseded) m.set(t.number, `/p/${s.repo}/plan#task-${t.number}`);
		for (const i of s.items) m.set(i.id, `/p/${s.repo}/i/${encodeURIComponent(i.id)}`);
		linkMaps.set(s, m);
	}
	return m;
}

export function md(
	s: ProjectState,
	markdown: string,
	options: Omit<RenderOptions, 'links'> = {}
): string {
	return memo(`${s.repo}|${s.lastSyncAt}|${options.docPath ?? ''}|${markdown}`, () =>
		renderMarkdown(markdown, { ...options, links: projectLinks(s) })
	);
}

export function inline(s: ProjectState, markdown: string): string {
	return memo(`${s.repo}|${s.lastSyncAt}|inline|${markdown}`, () =>
		renderInline(markdown, { links: projectLinks(s) })
	);
}
