import { readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ROUTES } from './routes';

const ROOT = 'src/routes';
const ENTRY = /^\+(page(\.server)?\.(ts|js|svelte)|server\.(ts|js))$/;

/** Every route id under src/routes: a directory holding a page or an endpoint. */
function routeIds(dir = ROOT): string[] {
	const here = readdirSync(dir, { withFileTypes: true });
	const ids = here.some((e) => e.isFile() && ENTRY.test(e.name))
		? ['/' + relative(ROOT, dir).split(sep).join('/')].map((id) =>
				id === '/' ? id : id.replace(/\/$/, '')
			)
		: [];
	for (const e of here) if (e.isDirectory()) ids.push(...routeIds(join(dir, e.name)));
	return ids;
}

describe('every route has an access rule (spec §11.2)', () => {
	const ids = routeIds().sort();

	it('finds the routes', () => expect(ids).toContain('/'));

	it('has a rule for each route, and none for routes that are gone', () => {
		expect(Object.keys(ROUTES).sort()).toEqual(ids);
	});

	it('lists what each route checks', () => {
		expect(
			Object.fromEntries(
				ids.map((id) => {
					const r = ROUTES[id];
					return [id, 'action' in r ? `${r.kind}: ${r.action}` : r.kind];
				})
			)
		).toMatchSnapshot();
	});
});
