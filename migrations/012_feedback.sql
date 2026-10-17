-- The feedback button (PM35): a score and a comment from a signed-in person, and the page they were
-- on. A table with an admin screen rather than an email, so there is a trend and nothing is lost to
-- a filter. Nobody is notified: it is a suggestion box, not a support channel.
create table feedback (
	id bigint generated always as identity primary key,
	user_id bigint not null references app_user (id) on delete cascade,
	tenant_id bigint references tenant (id) on delete set null,
	-- Optional on purpose: this is also how someone reports a broken control.
	score smallint check (score between 1 and 5),
	comment text not null default '',
	-- Where they were, captured rather than asked.
	page text not null default '',
	created_at timestamptz not null default now(),
	-- An empty submission is not feedback, whatever write path is added later.
	constraint feedback_not_empty check (score is not null or comment <> '')
);
create index feedback_recent on feedback (created_at desc);
create index feedback_by_user on feedback (user_id, created_at desc);
