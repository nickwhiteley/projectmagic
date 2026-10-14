-- spec.md §8. Two kinds of table: app_user, membership, project.hidden and edit_log are real data
-- and are backed up; everything else is a cache that can be truncated and rebuilt.

create table app_user (
	id bigint generated always as identity primary key,
	github_id bigint not null unique,
	github_login text not null,
	name text,
	system_role text not null default 'member' check (system_role in ('admin', 'member')),
	disabled_at timestamptz,
	-- Encrypted with TOKEN_ENCRYPTION_KEY (§11.1); used only for this user's writes.
	refresh_token_enc text,
	refresh_token_expires_at timestamptz,
	created_at timestamptz not null default now()
);

create table project (
	id bigint generated always as identity primary key,
	github_repo_id bigint not null unique,
	owner text not null,
	repo text not null,
	installation_id bigint not null,
	hidden boolean not null default false,
	config_json jsonb,
	last_sync_at timestamptz,
	last_error text,
	-- A sync in progress, and whether another was asked for meanwhile (§7.4: bursts coalesce).
	sync_started_at timestamptz,
	sync_again boolean not null default false,
	last_webhook_at timestamptz,
	unique (owner, repo)
);

create table membership (
	user_id bigint not null references app_user (id) on delete cascade,
	project_id bigint not null references project (id) on delete cascade,
	role text not null check (role in ('viewer', 'editor', 'maintainer')),
	granted_by bigint references app_user (id) on delete set null,
	granted_at timestamptz not null default now(),
	primary key (user_id, project_id)
);

create table ref (
	project_id bigint not null references project (id) on delete cascade,
	name text not null,
	head_oid text not null,
	committed_at timestamptz,
	ahead integer,
	behind integer,
	active boolean not null default false,
	pr_json jsonb,
	primary key (project_id, name)
);

-- Parses keyed by blob oid (§7.1): sixty branches with one backlog.md are one parse.
create table blob_parse (
	oid text not null,
	kind text not null check (kind in ('backlog', 'progress', 'config')),
	parsed_json jsonb not null,
	parser_version integer not null,
	primary key (oid, kind)
);

create table ref_file (
	project_id bigint not null references project (id) on delete cascade,
	ref_name text not null,
	path text not null,
	oid text not null,
	primary key (project_id, ref_name, path)
);

create table done_item (
	project_id bigint not null references project (id) on delete cascade,
	item_id text not null,
	title text not null,
	last_body text not null,
	removed_oid text not null,
	removed_at timestamptz not null,
	pr_number integer,
	primary key (project_id, item_id)
);

-- Where the history walk (§7.3) stopped, and the items present then, so it can continue.
create table history_cursor (
	project_id bigint primary key references project (id) on delete cascade,
	last_commit_oid text,
	present_json jsonb not null default '{}'
);

create table doc_blob (
	oid text primary key,
	text text not null
);

create table edit_log (
	id bigint generated always as identity primary key,
	project_id bigint not null references project (id) on delete cascade,
	user_id bigint references app_user (id) on delete set null,
	item_id text not null,
	op text not null,
	base_oid text,
	commit_oid text,
	pr_number integer,
	at timestamptz not null default now(),
	error text
);

create table webhook_delivery (
	delivery_id text primary key,
	project_id bigint references project (id) on delete cascade,
	event text not null,
	received_at timestamptz not null default now()
);

create index edit_log_project_at on edit_log (project_id, at desc);
create index webhook_delivery_received_at on webhook_delivery (received_at);
