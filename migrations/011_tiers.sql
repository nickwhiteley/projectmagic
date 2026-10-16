-- PM20 phase 4 (specs/tenants.md §7): tiers, quotas, flags and billing. Tiers, limits and prices are
-- data set by platform admins, never named in code. Real data, backed up.

create table tier (
	id bigint generated always as identity primary key,
	name text not null,
	-- Tiers are ordered; a higher position is a higher tier.
	position integer not null,
	-- A disabled tier can't be chosen but keeps its tenants.
	enabled boolean not null default true,
	created_at timestamptz not null default now()
);

-- One row per quota a tier sets. A null value is an explicit "unlimited", which beats an inherited
-- number; no row inherits from the nearest lower tier that has one.
create table tier_quota (
	tier_id bigint not null references tier (id) on delete cascade,
	quota text not null,
	value bigint check (value >= 0),
	primary key (tier_id, quota)
);

-- A capability a tier may include. `min_tier_id` null means every tier.
create table flag (
	key text primary key,
	label text not null,
	enabled boolean not null default true,
	min_tier_id bigint references tier (id) on delete set null
);

-- A platform admin's exception for one tenant, with a reason and an optional expiry.
create table tenant_quota_override (
	tenant_id bigint not null references tenant (id) on delete cascade,
	quota text not null,
	value bigint check (value >= 0),
	reason text not null,
	expires_at timestamptz,
	set_by bigint references app_user (id) on delete set null,
	set_at timestamptz not null default now(),
	primary key (tenant_id, quota)
);
create table tenant_flag_override (
	tenant_id bigint not null references tenant (id) on delete cascade,
	flag text not null references flag (key) on delete cascade,
	on_ boolean not null,
	reason text not null,
	expires_at timestamptz,
	set_by bigint references app_user (id) on delete set null,
	set_at timestamptz not null default now(),
	primary key (tenant_id, flag)
);

alter table tenant add column tier_id bigint references tier (id);
-- A trial, a friend, or the owner's own tenant: a tier without payment.
alter table tenant add column tier_override_id bigint references tier (id);

-- Which repositories a tenant chose to keep when it has more than its plan allows (§7.2).
alter table project add column pinned boolean not null default false;

create table billing_price (
	id bigint generated always as identity primary key,
	tier_id bigint not null references tier (id) on delete cascade,
	interval text not null check (interval in ('month', 'year')),
	provider text not null,
	amount_minor integer not null check (amount_minor >= 0),
	currency text not null default 'GBP',
	active boolean not null default true,
	unique (tier_id, interval, provider)
);

create table billing_customer (
	tenant_id bigint not null references tenant (id) on delete cascade,
	provider text not null,
	provider_ref text not null,
	primary key (tenant_id, provider)
);

-- A subscription is a relationship; the provider is the authority on its state (§7.3).
create table subscription (
	id bigint generated always as identity primary key,
	tenant_id bigint not null references tenant (id) on delete cascade,
	tier_id bigint not null references tier (id),
	price_id bigint references billing_price (id) on delete set null,
	provider text not null,
	provider_ref text,
	status text not null default 'incomplete' check (status in ('incomplete', 'active', 'past_due', 'cancelled')),
	current_period_end timestamptz,
	cancel_at_period_end boolean not null default false,
	created_at timestamptz not null default now()
);
create index subscription_tenant on subscription (tenant_id);

-- A checkout is an attempt to start one.
create table checkout (
	id bigint generated always as identity primary key,
	tenant_id bigint not null references tenant (id) on delete cascade,
	subscription_id bigint not null references subscription (id) on delete cascade,
	status text not null default 'open' check (status in ('open', 'complete', 'abandoned')),
	created_by bigint references app_user (id) on delete set null,
	created_at timestamptz not null default now()
);

-- The stub provider's own record of what it was asked, standing in for a payment provider's: it
-- takes no money. Reconcile reads this, never the subscription row.
create table stub_subscription (
	ref text primary key,
	status text not null default 'incomplete',
	period_end timestamptz,
	cancel_at_period_end boolean not null default false,
	interval text not null
);

-- One tier to begin with, free and unlimited, so this deployment behaves as it did.
insert into tier (name, position) values ('Default', 1);
insert into platform_setting (key, value_json) select 'default_tier', to_jsonb(id::text) from tier;
update tenant set tier_id = (select id from tier limit 1);
insert into flag (key, label) values ('ai', 'AI: inferred statuses and Ask');
