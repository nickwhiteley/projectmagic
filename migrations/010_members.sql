-- PM20 phase 3 (specs/tenants.md §3.3, §6, §6.4): invitations, access by GitHub, support sessions,
-- and the rule that a tenant, and the service, always keep an administrator. Real data.

create table invitation (
	id bigint generated always as identity primary key,
	tenant_id bigint not null references tenant (id) on delete cascade,
	-- Held against GitHub's numeric id, so a renamed account still finds it.
	github_id bigint not null,
	github_login text not null,
	role text not null default 'member' check (role in ('admin', 'member')),
	-- For managed access: {"<project id>": "viewer"|"editor"|"maintainer"}.
	project_roles_json jsonb not null default '{}',
	token_hash text not null unique,
	invited_by bigint references app_user (id) on delete set null,
	created_at timestamptz not null default now(),
	expires_at timestamptz not null,
	accepted_at timestamptz,
	revoked_at timestamptz
);
create index invitation_github on invitation (github_id);
create index invitation_tenant on invitation (tenant_id);

-- A manual role of 'none' overrides a role derived from GitHub, or the tenant's default, downwards.
alter table membership drop constraint membership_role_check;
alter table membership add constraint membership_role_check check (role in ('none', 'viewer', 'editor', 'maintainer'));

-- When this person's roles were last read from GitHub for this tenant (§6.1); null means due.
alter table tenant_member add column github_synced_at timestamptz;
alter table tenant_member add column last_seen_at timestamptz;

-- A platform admin's time-limited, read-only look into one tenant (§6.3).
create table support_session (
	id bigint generated always as identity primary key,
	tenant_id bigint not null references tenant (id) on delete cascade,
	user_id bigint not null references app_user (id) on delete cascade,
	reason text not null,
	started_at timestamptz not null default now(),
	expires_at timestamptz not null,
	ended_at timestamptz
);
create index support_session_user on support_session (user_id, expires_at);

-- A tenant keeps an active administrator, and so does the service (§6.4). The service checks first
-- and says why; these constraint triggers are for every other path, and check at commit so a
-- transaction may swap one admin for another.
create function pm_tenant_needs_admin(t bigint) returns void language plpgsql as $$
begin
	if exists (select 1 from tenant where id = t and status <> 'deleted')
		and not exists (
			select 1 from tenant_member m join app_user u on u.id = m.user_id
			where m.tenant_id = t and m.role = 'admin' and u.disabled_at is null
		)
	then
		raise exception 'tenant % must keep an active admin', t using errcode = '23514';
	end if;
end $$;

create function pm_member_changed() returns trigger language plpgsql as $$
begin
	perform pm_tenant_needs_admin(old.tenant_id);
	return null;
end $$;

create function pm_user_changed() returns trigger language plpgsql as $$
declare
	t bigint;
begin
	for t in select tenant_id from tenant_member where user_id = old.id and role = 'admin' loop
		perform pm_tenant_needs_admin(t);
	end loop;
	return null;
end $$;

create constraint trigger tenant_member_keeps_admin
	after update or delete on tenant_member
	deferrable initially deferred for each row execute function pm_member_changed();
create constraint trigger app_user_tenants_keep_admin
	after update of disabled_at or delete on app_user
	deferrable initially deferred for each row execute function pm_user_changed();

create function pm_check_platform_admin() returns trigger language plpgsql as $$
begin
	if old.platform_role = 'admin' and old.disabled_at is null
		and not exists (select 1 from app_user where platform_role = 'admin' and disabled_at is null)
	then
		raise exception 'the service must keep an active platform admin' using errcode = '23514';
	end if;
	return null;
end $$;

create constraint trigger app_user_keeps_platform_admin
	after update of platform_role, disabled_at or delete on app_user
	deferrable initially deferred for each row execute function pm_check_platform_admin();
