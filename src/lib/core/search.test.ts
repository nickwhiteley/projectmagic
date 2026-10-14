import { describe, expect, it } from 'vitest';
import { search, type Searchable } from './search.ts';

const items: Searchable[] = [
	{
		repo: 'bp',
		project: 'Orchard',
		id: 'NW9',
		title: 'DXF export',
		body: 'Opens in AutoCAD LT.',
		status: 'built'
	},
	{
		repo: 'bp',
		project: 'Orchard',
		id: 'NW90',
		title: 'Something else',
		body: 'mentions dxf export once',
		status: 'todo'
	},
	{
		repo: 'fm',
		project: 'Lantern',
		id: '5.8',
		title: 'New sketch piece',
		body: 'Café-style tables.',
		status: 'todo'
	}
];

describe('search', () => {
	it('puts an exact id first, then titles, then bodies with a snippet', () => {
		expect(search(items, 'nw9').map((h) => [h.id, h.rank])).toEqual([['NW9', 0]]);
		const dxf = search(items, 'dxf export');
		expect(dxf.map((h) => [h.id, h.rank])).toEqual([
			['NW9', 1],
			['NW90', 2]
		]);
		expect(dxf[1].snippet).toMatch(/dxf export/);
	});

	it('ignores case and accents, and needs every word', () => {
		expect(search(items, 'cafe').map((h) => h.id)).toEqual(['5.8']);
		expect(search(items, 'sketch zebra')).toEqual([]);
		expect(search(items, '  ')).toEqual([]);
	});
});
