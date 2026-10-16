-- A repository taken out of the GitHub App (or whose installation was deleted) is marked, not
-- deleted: its members and edit log are real data, and it comes back if it is added again.
alter table project add column uninstalled_at timestamptz;
