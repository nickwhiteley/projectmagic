// Syncs every project from the command line, outside SvelteKit.
// Usage: node scripts/sync.ts [repo ...]   (reads .env)
import { existsSync, readFileSync } from 'node:fs';
import postgres from 'postgres';
import { appClient, installationToken, tokenClient } from '../src/lib/server/github-client.ts';
import { syncInstallations, syncProject } from '../src/lib/server/sync.ts';

if (existsSync('.env')) process.loadEnvFile('.env');
const env = process.env;
const key =
	env.GITHUB_APP_PRIVATE_KEY?.replace(/\\n/g, '\n') ??
	readFileSync(env.GITHUB_APP_PRIVATE_KEY_PATH!, 'utf8');
const appId = env.GITHUB_APP_ID!;
const sql = postgres(env.DATABASE_URL!, { prepare: false, max: 2, onnotice: () => {} });
const forInstallation = (id: number) => tokenClient(() => installationToken(appId, key, id));

try {
	console.log(
		`${await syncInstallations(appClient(appId, key), forInstallation, sql)} repositories installed`
	);
	const only = process.argv.slice(2);
	const projects = await sql<
		{ id: string; owner: string; repo: string; installation_id: string; config_json: null }[]
	>`
		select id, owner, repo, installation_id, config_json from project order by repo`;
	for (const p of projects) {
		if (only.length && !only.includes(p.repo)) continue;
		try {
			const s = await syncProject(forInstallation(Number(p.installation_id)), sql, {
				id: String(p.id),
				owner: p.owner,
				repo: p.repo,
				config: p.config_json
			});
			console.log(p.repo, JSON.stringify(s));
		} catch (e) {
			await sql`update project set last_error = ${String(e)} where id = ${p.id}`;
			console.log(p.repo, 'FAILED', e);
		}
	}
} finally {
	await sql.end();
}
