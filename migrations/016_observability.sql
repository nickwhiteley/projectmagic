-- EP2 Observability (PM47–PM56): what Project Magic records about its own health, so a platform
-- admin sees a problem on a screen, or in an alert, rather than in Vercel's logs. None of it holds a
-- tenant's content: ids, counts, timings and error messages only (specs/tenants.md §6.3). Kept for
-- 90 days by the cron.

-- PM48: an unexpected error in a request or in the browser. Each occurrence is a row with its
-- reference; occurrences with the same fingerprint are one group, which an admin can resolve.
create table error_group (
	fingerprint text primary key,
	source text not null check (source in ('server', 'client')),
	route text,
	message text not null,
	first_seen timestamptz not null default now(),
	last_seen timestamptz not null default now(),
	occurrences integer not null default 1,
	resolved_at timestamptz,
	resolved_by bigint references app_user (id) on delete set null
);
create index error_group_last_seen on error_group (last_seen desc);

create table app_error (
	id bigint generated always as identity primary key,
	ref text not null unique,
	fingerprint text not null references error_group (fingerprint) on delete cascade,
	source text not null check (source in ('server', 'client')),
	route text,
	method text,
	status integer,
	message text not null,
	stack text,
	user_id bigint references app_user (id) on delete set null,
	tenant_id bigint references tenant (id) on delete set null,
	project_id bigint references project (id) on delete set null,
	version text,
	at timestamptz not null default now()
);
create index app_error_at on app_error (at desc);
create index app_error_fingerprint on app_error (fingerprint, at desc);

-- PM49, PM50: each piece of background work (a sync, inference, the digest, a delivery step…), what
-- started it, how long it took, and how it ended.
create table job_run (
	id bigint generated always as identity primary key,
	kind text not null,
	trigger text,
	project_id bigint references project (id) on delete cascade,
	tenant_id bigint references tenant (id) on delete cascade,
	started_at timestamptz not null default now(),
	ended_at timestamptz,
	outcome text not null default 'running'
		check (outcome in ('running', 'ok', 'failed', 'skipped', 'capped', 'stuck', 'rate limited')),
	error text,
	detail_json jsonb,
	version text
);
create index job_run_started on job_run (started_at desc);
create index job_run_project on job_run (project_id, started_at desc);
create index job_run_kind on job_run (kind, started_at desc);

-- PM50: how long a project has been failing, not only its last message.
alter table project
	add column failing_since timestamptz,
	add column fail_count integer not null default 0;

-- PM47: each daily cron run, step by step.
create table cron_run (
	id bigint generated always as identity primary key,
	started_at timestamptz not null default now(),
	ended_at timestamptz,
	ok boolean,
	steps_json jsonb not null default '[]',
	version text
);
create index cron_run_started on cron_run (started_at desc);

-- PM52: what came of each webhook delivery.
alter table webhook_delivery
	add column outcome text,
	add column detail text,
	add column ms integer;

-- PM53: GitHub's rate-limit budget as last seen, per installation or user token and resource.
create table github_budget (
	scope text not null,
	resource text not null,
	remaining integer not null,
	"limit" integer not null,
	reset_at timestamptz not null,
	updated_at timestamptz not null default now(),
	primary key (scope, resource)
);
-- PM53: an installation token GitHub refused, which no sync of its projects can get past.
alter table installation
	add column token_error text,
	add column token_error_at timestamptz;

-- PM54: why a person's GitHub sign-in can't be refreshed, when it isn't simply expired.
alter table app_user
	add column refresh_error text,
	add column refresh_error_at timestamptz;

-- PM54: a digest Slack refused.
alter table tenant_setting
	add column digest_last_error text,
	add column digest_failed_at timestamptz;

-- PM55: the alert conditions that are open, so each sends one message when it starts and one when it
-- clears.
create table ops_alert (
	key text primary key,
	title text not null,
	detail text,
	href text,
	opened_at timestamptz not null default now(),
	notified_at timestamptz,
	closed_at timestamptz
);
