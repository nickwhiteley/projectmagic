-- The epics file (PM28) is parsed and cached as kind 'epics', which the original check on
-- blob_parse.kind didn't allow, so a sync that found an epics.md failed on the insert.
alter table blob_parse drop constraint blob_parse_kind_check;
alter table blob_parse add constraint blob_parse_kind_check
	check (kind in ('backlog', 'progress', 'config', 'epics'));
