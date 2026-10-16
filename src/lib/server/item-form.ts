// Reading the item form (spec §10.1: title, meta as fields, body as markdown).
import type { ItemFormValues } from '#lib/core/edit-form.ts';
import { assigneeProblem } from '#lib/core/assignee.ts';
import { STATUSES, type Status } from '#lib/core/meta.ts';

export type { ItemFormValues };

export function readItemForm(form: FormData): ItemFormValues {
	const get = (k: string) => String(form.get(k) ?? '').trim();
	const status = get('status') as Status;
	return {
		id: get('id'),
		title: get('title').replace(/\s+/g, ' '),
		star: form.get('star') === 'on',
		job: get('job').toUpperCase(),
		size: get('size'),
		status: (STATUSES as readonly string[]).includes(status) ? status : 'todo',
		waiting: get('waiting').replace(/\s+/g, ' '),
		plan: get('plan'),
		branch: get('branch'),
		assignee: get('assignee').replace(/\s+/g, ''),
		epic: get('epic').toUpperCase(),
		body: String(form.get('body') ?? '').replace(/\r\n/g, '\n')
	};
}

/** The item's source as the form opened it. Browsers send form fields with CRLF line endings. */
export function readBase(form: FormData): string {
	return String(form.get('base') ?? '').replace(/\r\n/g, '\n');
}

export function problems(v: ItemFormValues): string | null {
	if (!v.title) return 'A title is needed.';
	if (/^###|\n/.test(v.title)) return 'The title is one line of text.';
	if (v.job && !/^[A-Z]+$/.test(v.job)) return 'A job is one word in capitals, such as PRO.';
	if (v.assignee && assigneeProblem(v.assignee)) return `For ${assigneeProblem(v.assignee)}.`;
	if (v.epic && !/^EP\d+$/.test(v.epic)) return 'An epic is EP and a number, such as EP3.';
	if (v.plan && v.plan.split(',').some((n) => !/^[0-9]+(\.[0-9]+)*[a-z]?$/.test(n.trim())))
		return 'Plan tasks are numbers such as 46 or 5.8, separated by commas.';
	return null;
}
