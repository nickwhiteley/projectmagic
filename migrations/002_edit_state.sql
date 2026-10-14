-- spec.md §10.2: what the last edit left behind. edit_pr is the open "Project Magic edits" PR, if
-- any; edit_state is null when edits flow straight to main, else 'pending' (the PR is open: auto_merge
-- is off or GitHub refused the merge), 'edits-not-merged' or 'needs-merge-by-hand'.
alter table project add column edit_state text
	check (edit_state in ('pending', 'edits-not-merged', 'needs-merge-by-hand'));
alter table project add column edit_detail text;
alter table project add column edit_pr integer;
