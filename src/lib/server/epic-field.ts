// The Epic field on the item forms (PM1): an id, or a name that starts a new epic.
import { chooseEpic, declareEpic } from '#lib/core/epics.ts';
import type { ProjectState } from '#lib/core/state.ts';
import { editFile } from './edits.ts';
import type { ProjectRow } from './projects.ts';
import type { SessionUser } from './users.ts';

/**
 * The epic id to write on the item, or a message to show. A new epic is declared first, in the
 * epics file (made if it isn't there yet), so the id the item names exists by the time it saves.
 */
export async function settleEpic(
	user: SessionUser,
	project: ProjectRow,
	s: ProjectState,
	typed: string
): Promise<{ epic: string } | { message: string }> {
	const c = chooseEpic(
		typed,
		s.epics.map((e) => ({ id: e.id, title: e.title }))
	);
	if (c.kind === 'none') return { epic: '' };
	if (c.kind === 'id') return { epic: c.id };
	if (c.kind === 'bad') return { message: c.message };
	if (!s.epicsPath)
		return {
			message: `“${c.title}” would be a new epic, but this project doesn't read an epics file (the epics key in .projectmagic.yml). Use an epic id such as EP3.`
		};
	const result = await editFile(
		user,
		project,
		s.epicsPath,
		{
			create: '',
			apply: (text) => declareEpic(text, c.id, c.title),
			describe: () => `Epics: declare ${c.id} ${c.title}`
		},
		null,
		{ op: 'doc', item: s.epicsPath }
	);
	if (result.kind === 'blocked' || result.kind === 'refused') return { message: result.detail };
	if (result.kind === 'conflict')
		return { message: 'The epics file changed while you were saving. Try again.' };
	return { epic: c.id };
}
