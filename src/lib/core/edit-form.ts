// From the item form's values to an edit (spec §10.1). Only what changed is in the edit, so
// saving an untouched form changes nothing, and a heading or meta line is only rewritten when
// its content changes.
import { formatMeta, updateMeta, type MetaEntry, type Status } from './meta.ts';
import type { ItemChange } from './splice.ts';

export interface ItemFormValues {
	id: string;
	title: string;
	star: boolean;
	job: string;
	size: string;
	status: Status;
	waiting: string;
	plan: string;
	branch: string;
	/** Who it is for (PM16); '' is anyone's. */
	assignee: string;
	body: string;
}

/** The parts of an item an edit starts from. */
export interface EditableItem {
	id: string;
	title: string;
	star: boolean;
	headingJob: string | null;
	meta: MetaEntry[] | null;
	body: string;
}

export function formValues(it: EditableItem): ItemFormValues {
	const meta = (k: string) => it.meta?.find((e) => e.key.toLowerCase() === k)?.value ?? '';
	const status = meta('status')
		.toLowerCase()
		.replace(/\\?\*$/, '')
		.replace(/\s+/g, ' ');
	return {
		id: it.id,
		title: it.title,
		star: it.star,
		job: meta('job') || it.headingJob || '',
		size: meta('size'),
		status: (['todo', 'in progress', 'blocked', 'in review', 'built', 'done'].includes(status)
			? status
			: 'todo') as Status,
		waiting: meta('waiting'),
		plan: meta('plan'),
		branch: meta('branch').replace(/`/g, ''),
		assignee: meta('for').replace(/`/g, ''),
		body: it.body
	};
}

export function editChange(it: EditableItem, v: ItemFormValues): ItemChange {
	const was = formValues(it);
	const change: ItemChange = {};
	if (v.id !== it.id) change.id = v.id;
	if (v.title !== was.title) change.title = v.title;
	if (v.star !== it.star) change.star = v.star;

	// Job lives where the item keeps it: its meta line if it has a Job key, else the heading.
	const metaJob = !!it.meta?.some((e) => e.key.toLowerCase() === 'job');
	if (!metaJob && v.job !== was.job) change.job = v.job || null;

	const fields = {
		...(v.status !== was.status || !it.meta ? { status: v.status } : {}),
		...(v.size !== was.size ? { size: v.size } : {}),
		...(v.branch !== was.branch ? { branch: v.branch } : {}),
		...(v.plan.replace(/\s/g, '') !== was.plan.replace(/\s/g, '')
			? { plan: v.plan ? v.plan.split(',') : [] }
			: {}),
		...(v.waiting !== was.waiting ? { waiting: v.waiting } : {}),
		...(v.assignee !== was.assignee ? { for: v.assignee } : {}),
		...(metaJob && v.job !== was.job ? { job: v.job } : {})
	};
	const meta = updateMeta(it.meta ?? [], fields);
	if (!it.meta || formatMeta(meta) !== formatMeta(it.meta)) change.meta = meta;

	if (v.body.trim() !== it.body.trim()) change.body = v.body;
	return change;
}
