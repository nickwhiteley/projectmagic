import { createHmac } from 'node:crypto';
process.loadEnvFile('.env');
const v = `1:${Math.floor(Date.now() / 1000)}`;
const cookie = `pm_session=${v}.${createHmac('sha256', process.env.SESSION_SECRET).update(v).digest('base64url')}`;
const base = process.argv[2];
for (const path of ['/', '/p/orchard', '/p/orchard', '/p/lantern', '/p/orchard/board', '/p/orchard/plan', '/p/orchard/__data.json', '/p/lantern/__data.json', '/signin']) {
	const t = performance.now();
	const r = await fetch(base + path, { headers: { cookie }, redirect: 'manual' });
	const body = await r.text();
	console.log(String(Math.round(performance.now() - t)).padStart(6), 'ms', r.status, String(body.length).padStart(8), 'bytes', path, r.headers.get('x-vercel-cache') ?? '');
}
