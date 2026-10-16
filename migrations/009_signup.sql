-- PM20 phase 2 (specs/tenants.md §3, §8): sign-up, installation claims, and the platform's own
-- settings. Real data, backed up.

-- Service-wide settings a platform admin changes on the Settings page; `signup` is the first.
create table platform_setting (
	key text primary key,
	value_json jsonb not null,
	updated_by bigint references app_user (id) on delete set null,
	updated_at timestamptz not null default now()
);

-- The single-use token that brings a person back from GitHub's install page to the tenant they
-- started from (§3.2). Stored hashed, bound to the person and the tenant, valid for an hour.
create table setup_state (
	token_hash text primary key,
	user_id bigint not null references app_user (id) on delete cascade,
	tenant_id bigint not null references tenant (id) on delete cascade,
	expires_at timestamptz not null,
	used_at timestamptz
);

-- Why a tenant is suspended or waiting, shown to its admins.
alter table tenant add column status_reason text;
