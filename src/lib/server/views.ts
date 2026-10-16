// Helpers for the project pages: rendered markdown with the project's ids linked, cached.
import { createHash } from 'node:crypto';
import {
	renderInline,
	renderMarkdown,
	type RenderOptions,
	type TocEntry
} from '#lib/core/render.ts';
import type { ProjectState } from '#lib/core/state.ts';

const MAX = 4000;
const cache = new Map<string, { html: string; toc: TocEntry[] }>();

/** The text is hashed for the key, so a large document isn't kept twice. */
const digest = (text: string) => createHash('sha1').update(text).digest('base64');

function memo(key: string, make: () => string, toc?: TocEntry[]): string {
	const hit = cache.get(key);
	if (hit !== undefined) {
		// The table of contents is an output too: a hit fills it as a render would.
		toc?.push(...hit.toc);
		return hit.html;
	}
	const start = toc?.length ?? 0;
	const html = make();
	if (cache.size >= MAX) cache.delete(cache.keys().next().value!);
	cache.set(key, { html, toc: toc?.slice(start) ?? [] });
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
	// Where links point (a branch's `?ref=`) changes the HTML, so it is part of the key.
	const hrefs = `${options.docHref?.('') ?? ''}|${options.imgHref?.('') ?? ''}`;
	return memo(
		`${s.repo}|${s.lastSyncAt}|${options.docPath ?? ''}|${hrefs}|${!!options.toc}|${digest(markdown)}`,
		() => renderMarkdown(markdown, { ...options, links: projectLinks(s) }),
		options.toc
	);
}

export function inline(s: ProjectState, markdown: string): string {
	return memo(`${s.repo}|${s.lastSyncAt}|inline|${digest(markdown)}`, () =>
		renderInline(markdown, { links: projectLinks(s) })
	);
}
