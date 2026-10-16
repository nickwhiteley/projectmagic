-- PM25: the text of a backlog file by blob oid, kept so replaying pending edits needn't fetch it
-- from GitHub in every server process. A cache: safe to empty.
create table blob_text (
	oid text primary key,
	text text not null,
	fetched_at timestamptz not null default now()
);
