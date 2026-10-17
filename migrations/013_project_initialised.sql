-- Setting up a new repository (PM33): when Project Magic added the files a repository needs
-- (backlog.md, bugs.md, .projectmagic.yml), or found it needed none. Null means it has not been
-- looked at yet. Projects that exist now were set up by hand, so they are marked as done and no PR
-- is opened on them.
alter table project add column initialised_at timestamptz;
update project set initialised_at = now();
