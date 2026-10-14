// Applies migrations/*.sql in name order, each once and in its own transaction.
// Usage: node scripts/migrate.ts   (reads DATABASE_URL from the environment or .env)
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import postgres from 'postgres';

if (!process.env.DATABASE_URL && existsSync('.env')) process.loadEnvFile('.env');
const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is not set');

const sql = postgres(url, { prepare: false, max: 1, onnotice: () => {} });
try {
	await sql`create table if not exists schema_migration (name text primary key, applied_at timestamptz not null default now())`;
	const done = new Set((await sql`select name from schema_migration`).map((r) => r.name));
	const files = readdirSync('migrations')
		.filter((f) => f.endsWith('.sql'))
		.sort();
	for (const file of files) {
		if (done.has(file)) continue;
		await sql.begin(async (tx) => {
			await tx.unsafe(readFileSync(`migrations/${file}`, 'utf8'));
			await tx`insert into schema_migration (name) values (${file})`;
		});
		console.log(`applied ${file}`);
	}
	console.log(`${files.length} migrations, ${files.length - done.size} applied now`);
} finally {
	await sql.end();
}
