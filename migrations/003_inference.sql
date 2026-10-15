-- PM3: a model's proposed status for an item with no meta line, shown as "inferred".
-- item_inference and inference_usage are caches and counters; user_pref is real data.

-- One proposal per item, valid while the item's text is what it was when the model read it.
create table item_inference (
	project_id bigint not null references project (id) on delete cascade,
	item_id text not null,
	source text not null,
	status text not null,
	waiting text,
	model text not null,
	created_at timestamptz not null default now(),
	primary key (project_id, item_id)
);

-- Tokens spent a day, by scope: 'project:<id>' today, 'tenant:<id>' when PM20 adds tenants.
create table inference_usage (
	scope text not null,
	day date not null,
	tokens bigint not null default 0,
	primary key (scope, day)
);

-- A person's choice to see no model-inferred statuses.
create table user_pref (
	user_id bigint primary key references app_user (id) on delete cascade,
	ai_opt_out boolean not null default false
);
