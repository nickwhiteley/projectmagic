// Spike 0.3 (PM65), step 3: once *Yours* in sheet.md is filled in (g, a or r), how often does
// the model's majority light agree with a person's?
// Usage: node spikes/0.3-ticket-clarity/compare.ts [sheet.md]
import { readFileSync } from 'node:fs';

const LIGHT: Record<string, string> = { '🟢': 'g', '🟠': 'a', '🔴': 'r' };
const RANK = { g: 0, a: 1, r: 2 } as Record<string, number>;
const sheet = readFileSync(process.argv[2] ?? new URL('sheet.md', import.meta.url), 'utf8');

let rows = 0;
let same = 0;
let near = 0;
const off: string[] = [];
for (const line of sheet.split('\n')) {
	const cells = line.split('|').map((c) => c.trim());
	const [, id, , , model, yours] = cells;
	const mine = yours?.replace(/[()]/g, '').toLowerCase()[0];
	if (!id || !mine || !(mine in RANK)) continue;
	const lights = [...(model ?? '')].map((ch) => LIGHT[ch]).filter(Boolean);
	if (!lights.length) continue;
	const majority = lights.sort((a, b) => RANK[a] - RANK[b])[lights.length >> 1];
	rows++;
	if (majority === mine) same++;
	else if (Math.abs(RANK[majority] - RANK[mine]) === 1) near++;
	if (majority !== mine) off.push(`${id}: model ${majority}, yours ${mine}`);
}
console.log(
	`${rows} labelled; agree ${same}, one step apart ${near}, green against red ${rows - same - near}`
);
for (const o of off) console.log(`  ${o}`);
