-- PM9: delivery and quality. Things that happened in a repository, read from GitHub and kept so the
-- charts don't ask again: production deploys, merged PRs, CI runs on main and items' status
-- changes. Keyed so a re-sync writes the same rows again (spec §16.6). All of it can be read again
-- from GitHub, so dropping this table loses nothing.
create table event (
	project_id bigint not null references project (id) on delete cascade,
	kind text not null check (kind in ('deploy', 'pr', 'run', 'status')),
	key text not null,
	at timestamptz not null,
	sha text,
	data jsonb not null default '{}',
	primary key (project_id, kind, key)
);
create index event_by_time on event (project_id, kind, at desc);

-- The history walk now records every status change, not only removals. Starting it again from the
-- first commit fills the table in; done items are written again identically.
delete from history_cursor;
