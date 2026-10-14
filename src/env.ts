// The app's environment (spec §11.3), checked when it starts. Each is server-only, read from
// `$app/env/private`. `.env.example` says where each value comes from.
import { defineEnvVars } from '@sveltejs/kit/env';

const required = (name: string) => (value: string | undefined) => {
	if (!value?.trim()) throw new Error(`${name} is not set (see .env.example)`);
	return value.trim();
};
const optional = (value: string | undefined) => value?.trim() || undefined;

export const variables = defineEnvVars({
	DATABASE_URL: { schema: required('DATABASE_URL'), description: 'Neon Postgres, pooled' },
	GITHUB_APP_ID: { schema: required('GITHUB_APP_ID') },
	GITHUB_CLIENT_ID: { schema: required('GITHUB_CLIENT_ID') },
	GITHUB_CLIENT_SECRET: { schema: required('GITHUB_CLIENT_SECRET') },
	GITHUB_APP_PRIVATE_KEY: {
		schema: optional,
		description: "The App's private key, as text (on Vercel)"
	},
	GITHUB_APP_PRIVATE_KEY_PATH: {
		schema: optional,
		description: "Or a path to the App's .pem (locally)"
	},
	GITHUB_WEBHOOK_SECRET: { schema: required('GITHUB_WEBHOOK_SECRET') },
	SESSION_SECRET: { schema: required('SESSION_SECRET') },
	TOKEN_ENCRYPTION_KEY: {
		schema: (value) => {
			const v = required('TOKEN_ENCRYPTION_KEY')(value);
			if (Buffer.from(v, 'base64').length !== 32)
				throw new Error('TOKEN_ENCRYPTION_KEY must be 32 bytes, base64 (openssl rand -base64 32)');
			return v;
		}
	},
	BOOTSTRAP_ADMIN_GITHUB_LOGIN: { schema: optional },
	CRON_SECRET: { schema: optional, description: 'Set by Vercel for the daily cron' }
});
