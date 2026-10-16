-- PM25: batch edits. A pending edit is an item edit (the operation, and the item as the person saw
-- it) held until the batch is saved as one commit. Real data until saved or discarded.
create table pending_edit (
	id bigserial primary key,
	project_id bigint not null references project (id) on delete cascade,
	user_id bigint not null references app_user (id),
	-- The item's file when it isn't the main backlog (PM29: bugs.md); null for the backlog.
	file text,
	item_id text not null,
	op jsonb not null,
	-- The item's source as the person saw it, for the conflict check; null for an add.
	base text,
	created_at timestamptz not null default now(),
	-- Set while a save is working on it; a claim older than a few minutes is stale.
	claimed_at timestamptz,
	-- Why it was left pending when the batch was saved: the item changed on main.
	conflict text
);
create index pending_edit_project on pending_edit (project_id, created_at);

-- A person's choice, off by default, next to the inference opt-out.
alter table user_pref add column batch_edits boolean not null default false;
