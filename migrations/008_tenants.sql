-- PM20 phase 1 (specs/tenants.md §4, §11): tenants, their members and installations, and every
-- project in a tenant. Tenants, members, installations, settings and the audit log are real data;
-- everything already marked as cache stays cache.
--
-- Additive on purpose: app_user.system_role stays until a later migration drops it, so the
-- running version keeps working between this migration and the deploy.

create table tenant (
	id bigint generated always as identity primary key,
	slug text not null unique check (slug ~ '^[a-z0-9-]{3,40}$'),
	name text not null,
	status text not null default 'active' check (status in ('pending', 'active', 'suspended', 'deleted')),
	created_by bigint references app_user (id) on delete set null,
	created_at timestamptz not null default now(),
	deleted_at timestamptz
);

create table tenant_member (
	tenant_id bigint not null references tenant (id) on delete cascade,
	user_id bigint not null references app_user (id) on delete cascade,
	role text not null check (role in ('admin', 'member')),
	source text not null default 'signup' check (source in ('signup', 'invited', 'github')),
	joined_at timestamptz not null default now(),
	invited_by bigint references app_user (id) on delete set null,
	primary key (tenant_id, user_id)
);
create index tenant_member_user on tenant_member (user_id);

create table tenant_setting (
	tenant_id bigint primary key references tenant (id) on delete cascade,
	join_by_github boolean not null default true,
	access text not null default 'github' check (access in ('github', 'managed')),
	default_project_role text not null default 'none' check (default_project_role in ('none', 'viewer', 'editor')),
	ai_enabled boolean not null default true,
	batch_edits_default boolean not null default true
);

-- One installation of the GitHub App on one account. At most one tenant, because its webhooks
-- must go to one place; null until somebody claims it.
create table installation (
	id bigint primary key,
	tenant_id bigint references tenant (id) on delete set null,
	account_login text not null,
	account_type text check (account_type in ('User', 'Organization')),
	account_id bigint,
	sender_github_id bigint,
	repository_selection text check (repository_selection in ('all', 'selected')),
	created_at timestamptz not null default now(),
	claimed_by bigint references app_user (id) on delete set null,
	claimed_at timestamptz,
	suspended_at timestamptz,
	removed_at timestamptz
);
create index installation_tenant on installation (tenant_id);

create table audit_log (
	id bigint generated always as identity primary key,
	tenant_id bigint references tenant (id) on delete set null,
	actor_user_id bigint references app_user (id) on delete set null,
	action text not null,
	target text,
	data_json jsonb,
	at timestamptz not null default now()
);
create index audit_log_tenant_at on audit_log (tenant_id, at desc);

alter table project add column tenant_id bigint references tenant (id);
alter table project add column over_limit boolean not null default false;
create index project_tenant on project (tenant_id);

alter table membership add column source text not null default 'manual' check (source in ('manual', 'github'));
alter table membership add column synced_at timestamptz;

alter table app_user add column platform_role text not null default 'none' check (platform_role in ('admin', 'none'));
alter table user_pref add column current_tenant_id bigint references tenant (id) on delete set null;

-- Today's deployment becomes one tenant, with nothing visible changing (§11). A fresh database,
-- with no users and no projects, gets none: its first sign-in creates one.
do $$
declare
	t bigint;
	owner_login text;
begin
	if not exists (select 1 from app_user) and not exists (select 1 from project) then
		return;
	end if;

	select github_login into owner_login from app_user where system_role = 'admin' order by id limit 1;
	insert into tenant (slug, name, created_by)
		values ('default', coalesce(owner_login, 'Default'),
			(select id from app_user where system_role = 'admin' order by id limit 1))
		returning id into t;
	-- Managed access is exactly today's rule: roles are what an administrator set.
	insert into tenant_setting (tenant_id, join_by_github, access) values (t, false, 'managed');

	update app_user set platform_role = 'admin' where system_role = 'admin';
	insert into tenant_member (tenant_id, user_id, role, source)
		select t, id, case when system_role = 'admin' then 'admin' else 'member' end, 'signup' from app_user;

	insert into installation (id, tenant_id, account_login, claimed_at)
		select installation_id, t, min(owner), now() from project group by installation_id;
	update project set tenant_id = t;

	-- Today's usage was counted per project; counted per tenant from now on.
	insert into inference_usage (scope, day, tokens)
		select 'tenant:' || t, day, sum(tokens) from inference_usage
		where scope like 'project:%' and day = current_date group by day
		on conflict (scope, day) do update set tokens = inference_usage.tokens + excluded.tokens;
	delete from inference_usage where scope like 'project:%';

	insert into audit_log (tenant_id, action, target, data_json)
		values (t, 'tenant.migrated', 'tenant:' || t, jsonb_build_object('migration', '008_tenants.sql'));
end $$;

alter table project alter column tenant_id set not null;
