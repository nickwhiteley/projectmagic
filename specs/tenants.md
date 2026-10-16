# Tenants: one Project Magic for many teams (PM20)

**Draft 2, 2026-10-16**, with Nick's answers (§15). Backlog item PM20. When it is built, `spec.md` §3, §4, §8, §11 and §13
are updated to match and this file becomes the record of how tenancy works. Until then `spec.md`
describes the running system.

## 1. What changes

Today each deployment belongs to one person. The GitHub App's credentials are environment
variables, every installation's repositories are that person's projects, and only invited GitHub
accounts can sign in.

After PM20, **one deployment serves many tenants**. Anyone can sign in with GitHub, create a
tenant, install the Project Magic App on their GitHub accounts and organisations, and bring in
their colleagues, without deploying their own copy. Nick runs the hosted service at
`www.projectmagic.work`. The repository stays open source, and **a self-hosted copy with one
owner keeps working as it does today**: it is the same code with one tenant and sign-up closed.

**Why "tenant", not "organisation".** An organisation is a GitHub account type, and one team
often uses several GitHub organisations, and personal accounts too. A tenant is Project Magic's
own boundary: a team, its people, its settings and its plan, over any number of GitHub accounts.

### Decided (Nick, on PM20)

- **Hosted first, self-hosting kept.** The primary use is a hosted service where the GitHub sign-in
  tells Project Magic what a person can reach. Single-owner self-hosting stays supported.
- **One public GitHub App** that any account installs. No tenant registers its own App, and no
  App secrets are stored per tenant.
- **A person can belong to more than one tenant**, because nothing prevents it, but it is not the
  intended use. The UI is built for one tenant per person and copes with more.
- **Tenants, tenant admins and platform admins.** Settings live at tenant level. Tenant admins run a
  tenant. Platform admins (Nick) run the service.
- **Sign-up supports payment, as a stub**, so tiers can gate AI model access and large numbers of
  users before a real payment provider is chosen.
- **A full admin screen implementation**, for both tenant admins and platform admins (§9).
- **PM7 is folded in.** Invitations, the member list and roles are phase 3 here (§14), and PM7 is
  gone from the backlog.
- **Tiers, limits and prices are set in the admin screens**, never in code or at design time (§7.1).
- **Sign-up waits for approval at first**, with a toggle in the platform settings to open it (§8.1).
- **The name is Project Magic**, and it lives at `projectmagic.work` (§8.2).
- **Look at plinth.** plinth is Go and Project Magic is TypeScript, so its code can't be imported.
  Its designs are borrowed (§10).

### Not in PM20

- A real payment provider, invoices, tax, proration and dunning (plinth doesn't have them either).
- GitHub Marketplace listing and billing.
- A tenant's own model API key (bring your own key). The hosted service uses its own keys and the
  tier decides who gets them. The settings table (§4) can hold an encrypted key later.
- Other Git hosts (PM30). Nothing here prevents them: an installation becomes one kind of
  *connection* among several.
- Configurable roles (plinth's `rbac`). Fixed roles cover what is needed (§6.4).

## 2. Concepts

| Term | What it is |
| ---- | ---------- |
| **Tenant** | A team using Project Magic. It has a name, a slug, members, connected installations, settings and a tier. All of its data is invisible to every other tenant |
| **Installation** | One installation of the Project Magic GitHub App on one GitHub account (a user or an organisation), chosen repositories only or all. GitHub allows one per account. **An installation belongs to at most one tenant**, because its webhooks must go to one place |
| **Project** | One repository, as now (`spec.md` §4). It belongs to the tenant its installation belongs to |
| **Tenant member** | A person in a tenant, with a tenant role: `admin` or `member` |
| **Project role** | `viewer`, `editor` or `maintainer`, as now (`spec.md` §11.2), held by a tenant member on a project |
| **Platform admin** | Someone who runs the service. Not a tenant role, and grants no access to a tenant's content (§6.3) |
| **Tier** | A plan: what a tenant may have (members, projects, AI) and what it costs |

A tenant can have several installations: a team's organisation, a second organisation, and a
person's own account. A person can see repositories from all of them in one overview.

## 3. How a tenant is created and joined

### 3.1 Signing in

**Anyone with a GitHub account can sign in** while sign-up is open (§8.1). The OAuth flow is
unchanged (`spec.md` §11.1). The difference is what happens after:

1. **The person's row** in `app_user` is created if it doesn't exist. Today an unknown login is
   refused; now it is refused only while sign-up is `closed` and they have no invitation and no
   tenant to join (§3.3).
2. **Their tenants are found**: those they are a member of, those with a pending invitation for
   their login, and those that admit by GitHub access (§3.3) on an installation their token can
   reach (`GET /user/installations`).
3. **Where they land:**
   - in one tenant: its overview, as today;
   - in several: the one they used last (`user_pref.current_tenant_id`), with a switcher in the
     header;
   - in none: the *Welcome* page, which offers to create a tenant, lists invitations to accept, and
     says that a colleague can invite them.

`BOOTSTRAP_ADMIN_GITHUB_LOGIN` now makes the first **platform** admin, on first sign-in, while none
exists. It no longer creates a tenant by itself (§11 covers a self-hosted copy's first run).

### 3.2 Creating a tenant and connecting GitHub

1. **Create.** On *Welcome*, a person names the tenant. The slug is suggested from the name (lower
   case, `a-z0-9-`, 3–40 characters, unique, never reused). They become its first admin. It starts
   on the default tier (§7). With sign-up set to `approval`, the tenant is created *pending* and a
   platform admin approves it before anything can be connected.
2. **Install the App.** *Connect GitHub* sends them to
   `https://github.com/apps/<app>/installations/new?state=<token>`. They choose the account and the
   repositories on GitHub.
3. **Come back.** GitHub redirects to the App's **Setup URL**,
   `/tenant/installations/setup?installation_id=…&setup_action=install&state=…`. The `state` is a
   single-use token, stored hashed and bound to the person and the tenant, that expires after an
   hour.
4. **Claim.** The installation is connected to the tenant if every check passes:
   - the person's own token can see the installation (`GET /user/installations` lists it);
   - **the person controls the account it is on**: it is their own user account, or they are an
     admin of the organisation (`GET /user/memberships/orgs/{org}`, `role: admin`), or they are
     the `sender` of the `installation` webhook that created it;
   - it isn't already connected to a tenant.

   A claim that fails says why. An installation connected to another tenant says so, and names no
   one: "This GitHub account is already connected to another Project Magic tenant. Ask its admin."
5. **Sync.** The installation's repositories become projects of the tenant, up to the tier's
   project limit (§7.2), and their first syncs start.

**Installations nobody claims.** The `installation` webhook arrives before the redirect, so every
installation is recorded when GitHub announces it, with no tenant and nothing synced. An installation
unclaimed for seven days is listed for platform admins, who can uninstall it
(`DELETE /app/installations/{id}`, as the App).

**A person can also connect an installation that already exists**, for example one made before
they signed up or by a colleague: *Connect GitHub* lists the installations their token can see that
are unclaimed and that they control, beside the *Install on another account* link.

**Disconnecting** (tenant admin, with confirmation) detaches the installation, marks its projects
uninstalled (migration 007's `uninstalled_at`) and offers to uninstall the App from that GitHub
account too. Members, edit logs and pending edits are kept with the projects, so reconnecting brings
them back. GitHub uninstalling the App (`installation.deleted`) does the same.

### 3.3 Joining a tenant

Two ways in, both on by default, each switched by a tenant admin:

- **By GitHub access** (`join_by_github`, on). A person who signs in and whose token can see one of
  the tenant's installations joins as a `member`, with no invitation. This is "the GitHub login tells
  us what they have access to". It is limited to organisation installations: a personal account's
  installation admits only its owner. A tenant over a large organisation that wants to choose who
  joins turns it off.
- **By invitation.** A tenant admin invites a GitHub login, with a tenant role and, for managed
  access (§6.2), project roles. The invitation is shown at the person's next sign-in, and can also be
  sent as a link (a single-use token, stored hashed, valid 14 days). Invitations are by login, so no
  email is needed. A login is checked against GitHub when invited (`GET /users/{login}`) and the
  invitation is held against its numeric id, so a renamed account still finds it.

**The member limit** (§7.2) applies to both: at the limit, auto-joining stops and the person is told
the tenant is full and its admins have been told (a banner on the tenant's admin pages). Invitations
can't be sent beyond the limit.

**Leaving and removing.** A member can leave. A tenant admin can remove a member. Either way their
project roles in that tenant go, their edits and edit log rows stay, and their pending (batched)
edits are saved under the batch's next author or, if none, discarded with a note in the edit log.
**A tenant always has at least one admin** (§6.4).

## 4. Data model

New tables and columns. Like `spec.md` §8, tenants, members, invitations, installations, settings,
tiers, billing and the audit log are **real data** and backed up. Everything already marked as cache
stays cache.

```
tenant            (id, slug unique, name, status pending|active|suspended|deleted,
                   tier_id, tier_override_id, created_by, created_at, deleted_at)
tenant_member     (tenant_id, user_id, role admin|member, source signup|invited|github,
                   joined_at, invited_by)                      primary key (tenant_id, user_id)
tenant_setting    (tenant_id primary key, join_by_github, access github|managed,
                   default_project_role none|viewer|editor, ai_enabled, batch_edits_default)
invitation        (id, tenant_id, github_id, github_login, role, project_roles_json,
                   token_hash, invited_by, created_at, expires_at, accepted_at, revoked_at)
installation      (id = GitHub's installation id, tenant_id null, account_login,
                   account_type User|Organization, account_id, sender_github_id,
                   repository_selection all|selected, created_at, claimed_by, claimed_at,
                   suspended_at, removed_at)
setup_state       (token_hash primary key, user_id, tenant_id, expires_at, used_at)
project           + tenant_id (not null, from its installation), + over_limit boolean
membership        + source manual|github, + synced_at     (project roles, as now)
app_user          system_role admin|member → platform_role admin|none
user_pref         + current_tenant_id
platform_setting  (key primary key, value_json, updated_by, updated_at)
tier, tier_quota, tenant_quota_override, flag, tier_flag, tenant_flag_override    (§7)
billing_price, billing_customer, subscription, checkout                          (§7.3)
audit_log         (id, tenant_id null, actor_user_id, action, target, data_json, at)
inference_usage   scope 'tenant:<id>' for item inference (was 'project:<id>'), 'ask:<user>' as now
```

- **`project.tenant_id` is copied from the installation**, not looked up through it, so every
  project query scopes on one column. A project moves tenant only when its installation does, and the
  sync sets both together.
- **`project` is unique on `github_repo_id` across the service**, as now. A repository is in one
  installation, so it is in one tenant.
- **Shared caches stay shared.** `blob_parse`, `doc_blob` and `blob_text` are keyed by git blob
  oid. Every read reaches an oid through the project's own `ref_file` rows, and no route takes an oid
  from the request, so one tenant can't read another's blob through them. A test keeps it that way
  (§12).
- **Migration 008** creates the tables, adds the columns, and backfills (§11).

## 5. Isolation

**A tenant's data is visible only to its members.** Nothing about one tenant appears to another,
including that it exists. Platform admins see metadata, not content (§6.3).

- **Every request has a current tenant**: the signed-in person's `current_tenant_id`, which must be a
  tenant they belong to and that is active. Pages with no tenant (Welcome, sign-in, personal
  settings) are listed in one place.
- **Every project lookup takes the tenant.** `projectByRepo(tenantId, repo)`, `allProjects(tenantId)`,
  search, Activity, Ask, Delivery and the overview all filter on `project.tenant_id`. No exported
  function reads projects without a tenant, except the sync runner, the webhook and the cron, which
  work by project id and installation id.
- **`can()` checks the tenant** (§6.4). A project in another tenant is a 404, the same as one the
  person can't see, so a URL guessed from another team never confirms that a repository exists.
- **URLs stay as they are**: `/p/{repo}`, resolved in the current tenant. Two repositories with the
  same name in one tenant (two GitHub organisations each with a `web`) are addressed
  `/p/{owner}--{repo}`. GitHub forbids `--` in account names, so the split is unambiguous. Only the
  ambiguous ones need it, and links in the app always use the form that resolves.
- **A link from another of your tenants** (`/p/web` while the current tenant has no `web`) switches
  to the one tenant of yours that has it, and says so. If several do, it asks.
- **Webhooks** route by `installation.id`. A delivery for an installation with no tenant, or a
  suspended or deleted one, is recorded and acknowledged, and starts no sync.
- **The cron** syncs every active tenant's projects, a slice at a time (§8.3).
- **The Ask digest** is built from the current tenant's projects only.
- **Row-level security** in Postgres was considered and is not used. It needs every query in a
  transaction that sets the tenant, which the pooled Neon connection and the sync runner make
  awkward, and a mistake still shows up only at run time. Scoping in the query layer, with the
  cross-tenant tests in §12, is the protection. It can be added later as defence in depth.

## 6. Access

### 6.1 Access by GitHub (the default)

With `access: github`, **a tenant member's project roles come from their GitHub permissions** on each
repository, read with their own token from `GET /user/installations/{id}/repositories`, which lists
the repositories of that installation they can reach, each with its `permissions`:

| GitHub permission on the repository | Project role |
| ----------------------------------- | ------------ |
| `admin` or `maintain`               | `maintainer` |
| `push`                              | `editor`     |
| `pull` or `triage`                  | `viewer`     |
| none (not listed)                   | no access    |

- Stored in `membership` with `source: github` and `synced_at`, so `can()` stays a pure function over
  rows.
- **Refreshed** at sign-in, and on a request when older than an hour (in the background, so the page
  isn't held up). A person removed from a repository on GitHub loses it within the hour, and at once
  on their next write, since GitHub refuses it.
- A **manual** membership (`source: manual`), set by a tenant admin, overrides the derived one for that
  project, up or down. Up is useful for a viewer who can't see a private repository's settings but
  should edit the backlog; GitHub still refuses a write they have no right to (`spec.md` §11.2).
- A tenant admin is `maintainer` on every project in the tenant, as a system admin is today.

### 6.2 Managed access

With `access: managed`, project roles are only what tenant admins set, the member list
per project (formerly PM7), and `default_project_role` for projects nobody set (`none`, `viewer` or `editor`). This
suits a tenant whose members don't all have GitHub access to the repositories, such as a client
watching progress, and is what a self-hosted copy's tenant uses after migration (§11).

### 6.3 Platform admins

A platform admin runs the service: tenants, tiers, sign-up, users, and the queues of unclaimed
installations and pending tenants. **Being a platform admin gives no access to a tenant's projects.**
For support, a platform admin may **open a tenant as support**: a time-limited (one hour), read-only
view, which needs a reason, is written to the audit log, and is listed on the tenant's own audit page
so its admins see it. Nick's own tenant is unaffected: he is its admin as well.

### 6.4 Roles and `can()`

**Fixed roles, not configurable RBAC.** Three layers, each a short ordered list, cover everything the
backlog asks for. plinth's configurable roles (`rbac`) are worth porting only if the service ever has
support staff with different rights, and fit then without changing these.

| Layer    | Roles                                 | Actions |
| -------- | ------------------------------------- | ------- |
| Platform | `admin`                               | `platform.tenants` (list, approve, suspend, delete, change tier, override quotas), `platform.users` (disable anywhere), `platform.tiers` (tiers, quotas, flags, prices), `platform.settings` (sign-up), `platform.support` (open a tenant as support) |
| Tenant   | `member` < `admin`                    | `tenant.view` (member); `tenant.members`, `tenant.installations`, `tenant.settings`, `tenant.billing`, `tenant.audit`, `tenant.delete` (admin) |
| Project  | `viewer` < `editor` < `maintainer`    | as now: `view`, `edit`, `merge`, `hide`, `manage-members` |

`can(user, action, ctx)`, where `ctx` holds the tenant, the person's tenant membership, the project
(if any) and their project memberships, decides every check, pure as now. The rules, in order:

1. no user, or a disabled one: no;
2. a platform action: only a platform admin;
3. a tenant or project action: the tenant must be active (a suspended tenant allows only
   `tenant.view` of a notice, and `tenant.billing`), and the person must be its member, or a platform
   admin in a live support session for read-only actions;
4. a project action: the project must be in that tenant; then the project role decides, a tenant admin
   being `maintainer`, and a hidden project visible only to maintainers, as now.

The existing system actions move: `invite-users` becomes `tenant.members`, `install-app` becomes
`tenant.installations`, and `disable-users` becomes `platform.users`.

**The last admin.** A tenant must keep an active admin. As in plinth (`rbac.last_holder`), the
database enforces it: a deferred constraint trigger on `tenant_member` and `app_user.disabled_at`
checks at commit that each affected active tenant still has an admin. The service refuses first
with a clear message; the trigger is for every other path. The same rule keeps one platform admin.

## 7. Tiers, quotas and billing

### 7.1 Tiers

Tiers are data, set by platform admins on *Tiers & prices* (§9.3), never named in code and never
fixed at design time (plinth §13). A tier has a name, a position in the order, its quotas (§7.2), its
flags, and its prices. Tiers are ordered, and a disabled tier can't be chosen but keeps its tenants.

**Migration 008 seeds one tier**, *Default*: free, with every quota unlimited and every flag on, so
the existing deployment and a self-hosted copy behave as today. Before the hosted service opens
sign-up, a platform admin creates the tiers it sells (members, projects, AI, AI tokens a day, price)
and chooses the default tier for new tenants (`platform_setting.default_tier`). Changing a tier's
limits applies to its tenants at once; going down takes nothing away (§7.2).

A platform admin can put a tenant on another tier without payment (`tier_override_id`: a trial, a
friend, Nick's own), and can override one quota for one tenant, with a reason and an optional expiry.

### 7.2 Quotas and flags

Resolution is plinth's (§13), ported as pure functions in `src/lib/core/plans.ts`:

- **A quota** resolves to a live tenant override, else the tenant's effective tier or the nearest tier
  below it with a row (an explicit unlimited beats an inherited number), else the declared default,
  else unlimited. An unknown tier resolves as the lowest enabled one.
- **A flag** is on by a tenant override in either direction, else off if disabled, else on at or above
  its minimum tier. Anything unresolvable is off.

The quotas and where they bite:

| Quota | Counted as | At the limit |
| ----- | ---------- | ------------ |
| `members` | active tenant members | no auto-join, no new invitations; nobody is removed |
| `projects` | the tenant's installed projects that are synced | further repositories are listed as *over the plan* and not synced; a tenant admin chooses which are synced on the Installations page; the oldest are kept by default |
| `ai_tokens_daily` | `inference_usage` for `tenant:<id>`, plus every member's `ask:<user>` that day | inference and Ask stop until midnight UTC, and say so |

The flag is `ai`: off below its tier, and then the inferred-status machinery and the Ask page are off for
the tenant, as if no model were configured. A tenant admin can also turn AI off for the tenant
(`ai_enabled`), which is the tenant opt-out PM3 left for PM20. A project's `inference: false` and a
person's opt-out stay as they are.

**Going down a tier takes nothing away** (plinth): over a limit, nothing is removed or locked; only
adding more is refused, and projects over the limit stop syncing at the next sync, oldest kept. A
banner on the tenant's admin pages says what is over.

### 7.3 Billing (stub)

plinth §13b's design, ported, with only the stub provider: **a checkout is an attempt; a subscription is
a relationship**, and the provider is the authority on a subscription's state.

- **`billing_price`**: per tier and interval (month, year) and provider. Switching a price off moves
  nobody.
- **Start**: a tenant admin chooses a tier on *Plan & billing*; Project Magic makes the provider's
  customer once (`billing_customer`, per tenant), starts a subscription and records a checkout, then
  sends the admin to the provider's page. A card is only ever entered on the provider's page.
- **The stub provider** takes no money. Its page says so plainly and has *Complete* and *Abandon*
  buttons. It is the only provider until one is chosen, and is off on the hosted service's production
  deploy unless `BILLING_STUB` is set, so nobody there believes they have paid.
- **Reconcile** is the one way state comes in: a return from the provider's page, a provider webhook,
  and the daily cron each call it. It copies the provider's state and moves the tenant's tier: the
  subscription's tier while *entitled* (active; past due within seven days of its period's end;
  cancelled with the paid period still running), else the default tier.
- **Cancel** ends the subscription at the period's end, keeping the tier until then.
- **A real provider** is a second implementation of the same port. Stripe is the obvious one; the
  choice, and tax, invoices and terms, come before taking money.

A self-hosted copy has billing off (no `BILLING_PROVIDER`), and its tenant is on the top tier by
override (§11).

## 8. Platform behaviour

### 8.1 Sign-up

`platform_setting.signup`: `open` (anyone may create a tenant), `approval` (anyone may, and a platform
admin approves it before it can connect GitHub), or `closed` (no new tenants; sign-in only for people
with a tenant, an invitation or GitHub access to an auto-joining tenant). It is set on the platform admin
*Settings* page (§9.3). The default is `closed`, so a self-hosted copy behaves as today. **The hosted
service starts at `approval`**, and a platform admin switches it to `open` there when billing and the
terms are ready (§13).

### 8.2 The GitHub App

The hosted service needs the App made public (*Installable by: Any account*) and renamed **Project
Magic**, from `Project Magic (nickwhiteley)`. App names are unique across GitHub, so if the name is
taken the App keeps a suffix and the product is still called Project Magic everywhere else. Its
homepage is `https://www.projectmagic.work`, and three settings that today are blank are set:

| Setting | Value |
| ------- | ----- |
| Setup URL | `https://www.projectmagic.work/tenant/installations/setup` |
| Redirect on update | on, so changing an installation's repositories comes back too |
| Events | add `installation` and `installation_repositories` (already handled, `webhook.ts`) |

Permissions don't change. Each installation has its own rate limit, so tenants don't spend each
other's.

### 8.3 Syncing at scale

The daily cron (`spec.md` §7.4) today syncs every project in one invocation. With many tenants it
syncs the projects whose last sync is oldest, up to a time budget (40 seconds), and leaves the rest to
the next run; webhooks keep active projects fresh anyway. A tenant's first sync is triggered by the
claim, not the cron. If one invocation a day isn't enough, a per-hour cron needs Vercel Pro (§13).

### 8.4 Suspending and deleting

- **Suspend** (platform admin, with a reason): members see a notice, syncs and webhooks stop, nothing
  is deleted. Unsuspend restores it.
- **Delete** (tenant admin, typing the slug; or platform admin): the tenant is marked `deleted`, its
  installations are detached and the App is uninstalled from them, its members lose access at once,
  and after 30 days its real data (members, settings, memberships, edit log, pending edits, audit log)
  is purged by the cron. Within the 30 days a platform admin can restore it. Caches go at once.
- **A person** can delete their account from personal settings: their memberships go, their tokens
  are erased, and edit-log rows keep their GitHub login only. Refused while they are a tenant's last
  admin.

## 9. Screens

### 9.1 Everyone

- **Header**: the tenant's name, a switcher if the person has more than one tenant, *Tenant* for tenant
  admins, *Admin* for platform admins.
- **Welcome** (`/welcome`): create a tenant, accept invitations, or wait to be invited.
- **Personal settings** (`/settings`): the existing AI and batch preferences, the tenants they belong
  to (leave), and delete account.

### 9.2 Tenant admin (`/tenant`)

| Page | What it does |
| ---- | ------------ |
| **Overview** | members, projects and AI use against the tier's limits; anything over a limit; recent admin actions |
| **Members** | each member: GitHub login, tenant role, how they joined, last seen, projects; change role, remove; invitations (send, copy link, revoke); `join_by_github` |
| **Access** | `access` (GitHub or managed), `default_project_role`; per project, its members and their roles, with derived roles shown and manual ones editable (formerly PM7's member list) |
| **Installations** | each connected GitHub account, its repositories and whether each is synced or over the plan, choose which are synced, connect another, disconnect |
| **Settings** | name, slug, AI on or off, whether batch edits are on by default for new members |
| **Plan & billing** | the tier, its limits, the subscription and its period, change tier (checkout), cancel |
| **Audit** | tenant admin actions and support sessions, newest first |
| **Delete tenant** | with the slug typed to confirm |

### 9.3 Platform admin (`/admin`)

| Page | What it does |
| ---- | ------------ |
| **Overview** | tenants by status and tier, sign-ups this week, AI tokens spent today, pending approvals, unclaimed installations |
| **Tenants** | search and list; each tenant's metadata (members, installations, projects, tier, subscription, usage, created): approve, suspend, restore, delete, change or override tier, override a quota, open as support |
| **Users** | search by login; their tenants; disable or enable across the service |
| **Installations** | every installation, its account, tenant or *unclaimed*, age; uninstall an unclaimed one |
| **Tiers & prices** | tiers in order, their quotas and flags, prices per interval; enable, disable, reorder |
| **Settings** | sign-up mode, default tier |
| **Audit** | every platform admin action and support session |

Every admin action is written to `audit_log` with who, what, the target and the before and after.

## 10. What comes from plinth

| plinth | Taken | Not taken |
| ------ | ----- | --------- |
| `quotas`, `flags` (§13) | the resolution rules, the "downgrades take nothing away" rule, overrides with reason and expiry | tier ids as UUIDv7, the Go stores |
| `usage` (§13) | the check against a limit and the 80% warning (a banner) | the quota day in a time zone: Project Magic's is UTC |
| `billing` (§13b) | checkout vs subscription, Start / Reconcile / Cancel, the entitlement rule, the stub provider | the Go code; written again in TypeScript at the same shape |
| `rbac` (§13a) | the last-holder rule, enforced by deferred constraint triggers | configurable roles and declared permissions (§6.4) |
| `ids` (§7) | secret tokens as 32 random bytes, stored only as their SHA-256 (invitations, setup state) | prefixed Crockford ids |
| `settings` (§8) | a value is encrypted (`crypto.ts`, as for refresh tokens) where it's a secret; a sensitive value is never shown back | the environment-free configuration: Project Magic keeps its environment variables |
| `account` (§12) | — | local passwords and Google sign-in: GitHub is the only identity |

If plinth ever ships a TypeScript port, these modules are the ones to replace.

## 11. Migrating the existing deployment, and self-hosting

**Migration 008 makes today's deployment one tenant**, with nothing visible changing for Nick:

- a tenant, `default` (named from `BOOTSTRAP_ADMIN_GITHUB_LOGIN` if set), `active`;
- every existing installation (from `project.installation_id`) connected to it, and every project's
  `tenant_id` set;
- every `app_user` a member: system admins as tenant `admin` and platform `admin`, others as `member`;
- existing project memberships kept, as `source: manual`, and the tenant's `access: managed`, which is
  exactly today's rule;
- `inference_usage` rows for `project:<id>` folded into `tenant:<id>` for today;
- the tenant on the top tier by override, so no limit applies.

**A self-hosted copy** keeps `signup: closed` and its one tenant. A fresh self-hosted install's first
platform admin, on first sign-in, gets *Welcome* and creates the tenant as anyone would; with the App
installable only by its owner, that is the only tenant there can be. The README gains a short *Hosted
or self-hosted* section and keeps "it runs on your own accounts" for the self-hosted route.

## 12. Testing

- **Pure functions** with unit tests: `can()` over the three layers (every action, every role, suspended
  and deleted tenants, support sessions, a project in another tenant), quota and flag resolution,
  billing's entitlement rule, the GitHub-permission-to-role mapping, and the `owner--repo` parse.
- **The route test** (`routes.test.ts`) keeps asserting which action each route checks, now including
  the tenant and admin routes.
- **Cross-tenant isolation**: a fixture with two tenants, each with a project named `web`, and for every
  route under `/p/`, `/activity`, `/search`, `/ask` and `/tenant`, a member of one gets a 404 or nothing
  of the other's. Run against Postgres, not mocks.
- **Claims**: a person who can see an installation but isn't its account's admin can't claim it; a used,
  expired or someone else's `state` is refused; an installation already claimed stays where it is.
- **The last-admin trigger**: removing, demoting or disabling the last admin fails at commit, on every
  path.
- **Migration 008** on a copy of today's data: Nick signs in and sees what he sees today, with the same
  links.
- **Playwright**: sign up, create a tenant, a stub *Complete* that moves the tier, invite and accept.

## 13. Before the hosted service opens

Not code, but needed before sign-up is `open` to strangers:

- **Vercel Pro.** Vercel's Hobby plan is for non-commercial use only, so a service that charges, or that
  serves other people's teams, needs Pro. It also lifts the one-cron-a-day limit (§8.3).
- **Neon's plan** for many tenants' caches; the caches can be truncated, so this is about size, not
  risk.
- **Terms and a privacy notice.** Project Magic stores repository contents (backlogs, plans and docs) in
  its cache, GitHub logins and names, and encrypted refresh tokens. The model providers receive item
  text for inference and Ask. Pages for both, linked from sign-up.
- **Support**: an address on the Welcome page and in the footer.
- **The App's rename and public listing** on GitHub (§8.2).

## 14. Build order

Four phases, one PR each. Each leaves the deployment working, with Nick's tenant unchanged to him.

| Phase | Contents | Visible to Nick |
| ----- | -------- | --------------- |
| **1. The tenant model and scoping** | migration 008; `tenant`, `tenant_member`, `installation`, `audit_log`; `project.tenant_id`; scoping every query; `can()` with tenants; the current tenant and switcher; the `owner--repo` form; cross-tenant tests; webhooks and cron routed by installation | the tenant name in the header; nothing else |
| **2. Sign-up and installations** | open sign-in under `platform_setting.signup`; Welcome; create a tenant; the Setup URL and claims; unclaimed installations; disconnect; tenant Overview, Installations and Settings pages; platform Overview, Tenants, Installations, Settings and Audit pages; suspend and delete | the *Admin* and *Tenant* pages |
| **3. Members and access** | access by GitHub; managed access; invitations; join by GitHub; leave and remove; the last-admin trigger; tenant Members, Access and Audit pages; platform Users; support sessions. **PM7 is folded in here** | inviting a colleague |
| **4. Tiers, quotas and billing** | `tier`, quotas and flags with their resolution; the AI flag and per-tenant token limit (PM3's tenant scope); the project and member limits; billing with the stub provider; Plan & billing; platform Tiers & prices | Plan & billing |

**Phase 1 as built** (PR `feat/pm20-tenant-model`), where it differs from or settles the above:

- **Migration 008 is additive.** `app_user.platform_role` is added and backfilled, and `system_role`
  stays unused until a later migration drops it, so the running version works between the migration
  and the deploy. Run `make migrate`, then deploy.
- **Only the phase 1 tables exist**: `tenant`, `tenant_member`, `tenant_setting`, `installation`,
  `audit_log`, with `project.tenant_id` and `over_limit`, `membership.source` and `synced_at`, and
  `user_pref.current_tenant_id`. Invitations, `setup_state`, `platform_setting` and the tier and billing
  tables come with the phase that uses them. `tenant.tier_id` and `tier_override_id` arrive with tiers.
- **Until phase 2 adds claims**, a deployment with exactly one tenant owns every new installation
  (`syncInstallations`), so adding a repository works as it does today. With none or several tenants
  an installation is recorded and waits to be claimed. A fresh database's first sign-in (the bootstrap
  login) creates the one tenant, as `default`. Both rules go when phase 2 lands *Welcome* and claims.
- **Inference spend is counted per tenant** (`tenant:<id>`), so `INFERENCE_DAILY_TOKEN_LIMIT` is now a
  tenant's allowance, not a project's, until phase 4 makes it a quota.
- **A link from another of your tenants** switches to the one tenant that has it. If several do, it is a
  404 until phase 2's switcher can ask.
- **The cron** syncs active tenants' projects, longest since last sync first, for up to 40 seconds.
- **Tests**: `src/lib/server/tenancy.test.ts` runs migration 008 on seeded "today" data and the
  cross-tenant checks against Postgres when `TEST_DATABASE_URL` is set, and is skipped otherwise.
  Playwright and the per-route cross-tenant sweep arrive with the pages that need them.

**Phase 2 as built** (PR `feat/pm20-signup-installations`), where it differs from or settles the above:

- **Migration 009** adds `platform_setting`, `setup_state` and `tenant.status_reason`.
- **Phase 1's interim rules are gone**: a new installation is never given to the only tenant, and the
  bootstrap login no longer creates a tenant. The first platform admin lands on *Welcome* like anyone.
- **Sign-in** creates an `app_user` for any GitHub account while sign-up is `open` or `approval`, and the
  bootstrap login is let in as the first platform admin even when `closed`. Joining a tenant by GitHub
  access or invitation is phase 3, so until then a new person has *Welcome* and can create a tenant.
- **A platform admin creating a tenant** is never made to wait for approval.
- **Pages**: `/welcome`, `/tenant` (Overview, Installations, Settings, Delete tenant), `/admin`
  (Overview, Tenants and a tenant's page, Installations, Settings, Audit). Platform Users and tenant
  Members, Access and Audit are phase 3. A tenant's slug cannot be changed.
- **The claim** is `claimInstallation` (`installations.ts`) with GitHub's calls passed in. It records an
  installation the webhook hasn't announced yet, and accepts the account's owner, an organisation admin
  or the person who installed it. The Setup URL needs `GITHUB_APP_SLUG` and the App's **Setup URL** set (§8.2).
- **Suspend, delete and restore** are `moveTenant`, each audited with before and after. Deleting detaches
  the installations, marks the projects uninstalled, and uninstalls the App from GitHub on a best-effort
  basis; the cron's `purgeDeletedTenants` removes a tenant 30 days after deletion.
- **Not yet**: the *open a tenant as support* session (phase 3), and the pending-tenant notice only shows
  in the banner, not on a Welcome-style page of its own.

Sizes: phase 1 M, phase 2 M–L, phase 3 M, phase 4 M. The hosted service can take its first tenants at `signup:
approval` after phase 3, each on a tier set by hand, before billing exists.

## 15. Decisions (Nick, 2026-10-16)

1. **Who may create a tenant at first:** approval by a platform admin, with a toggle on the platform
   *Settings* page to open sign-up later (§8.1).
2. **Tier limits and prices** are set by platform admins in the admin screens, not in this spec or in
   code (§7.1).
3. **Platform admin access to content:** none, except the audited, read-only, one-hour support
   session that the tenant's admins can see (§6.3).
4. **PM7** is folded into PM20 as phase 3 and removed from the backlog (§14).
5. **The name** is Project Magic, and the hosted service is at `projectmagic.work` (§8.2).

No questions are open.
