// The database: Neon Postgres through its pooled endpoint (spec §8). One client per instance.
import { DATABASE_URL } from '$app/env/private';
import postgres from 'postgres';

let client: postgres.Sql | null = null;

export function connect(url: string): postgres.Sql {
	// The pooler (PgBouncer, transaction mode) doesn't keep prepared statements between queries.
	return postgres(url, { prepare: false, max: 5, idle_timeout: 20 });
}

export function db(): postgres.Sql {
	client ??= connect(DATABASE_URL);
	return client;
}
