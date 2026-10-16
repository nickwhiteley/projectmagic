// Drag to reorder (spec §10.1, task 5.3): a drop calls the edit page's move action, which commits
// a cut and an insert of the item's exact range, and the page reloads its data.
import { deserialize } from '$app/forms';
import { refreshAll } from '$app/navigation';

export interface MoveState {
	busy: string | null;
	message: string | null;
}

/** `to` is `before:ID`, `after:ID`, `start:SECTION` or `end:SECTION`. */
export async function moveItem(
	repo: string,
	id: string,
	to: string,
	state: MoveState
): Promise<void> {
	state.busy = id;
	state.message = null;
	try {
		const body = new FormData();
		body.set('to', to);
		const res = await fetch(`/p/${repo}/i/${encodeURIComponent(id)}/edit?/move`, {
			method: 'POST',
			body,
			headers: { 'x-sveltekit-action': 'true', accept: 'application/json' }
		});
		const result = deserialize(await res.text());
		if (result.type === 'failure')
			state.message = String((result.data as { message?: string })?.message ?? 'The move failed.');
		else if (result.type === 'error') state.message = 'The move failed.';
		await refreshAll();
	} finally {
		state.busy = null;
	}
}

/** The Board's drag into another column sets the status (PM27); `waiting` is for blocked and built. */
export async function setStatus(
	repo: string,
	id: string,
	status: string,
	waiting: string | null,
	state: MoveState
): Promise<void> {
	state.busy = id;
	state.message = null;
	try {
		const body = new FormData();
		body.set('status', status);
		if (waiting !== null) body.set('waiting', waiting);
		const res = await fetch(`/p/${repo}/i/${encodeURIComponent(id)}/edit?/status`, {
			method: 'POST',
			body,
			headers: { 'x-sveltekit-action': 'true', accept: 'application/json' }
		});
		const result = deserialize(await res.text());
		if (result.type === 'failure')
			state.message = String(
				(result.data as { message?: string })?.message ?? 'The change failed.'
			);
		else if (result.type === 'error') state.message = 'The change failed.';
		await refreshAll();
	} finally {
		state.busy = null;
	}
}

/** Svelte attachments' worth of drag handling, as plain handlers: data-id on items, data-to on zones. */
export function dragHandlers(
	repo: string,
	state: MoveState,
	enabled: () => boolean,
	/** Called instead of a move when an item is dropped into a column other than its own. */
	onColumn?: (id: string, from: string, to: string) => void,
	/** Reordering needs every item in view, so a filtered view turns it off. */
	canReorder: () => boolean = () => true,
	/** Lets the page show the move before it is saved. */
	optimistic?: { set(id: string, to: string): void; clear(): void }
) {
	let dragging: string | null = null;
	let column: string | null = null;
	const clear = () => {
		dragging = null;
		column = null;
		document.querySelectorAll('.drop-target').forEach((x) => x.classList.remove('drop-target'));
	};
	const target = (e: DragEvent) =>
		(e.target as HTMLElement).closest<HTMLElement>('[data-id],[data-to]');
	return {
		ondragstart(e: DragEvent) {
			const el = (e.target as HTMLElement).closest<HTMLElement>('[data-id]');
			if (!enabled() || !el) return;
			dragging = el.dataset.id!;
			column = el.closest<HTMLElement>('[data-status]')?.dataset.status ?? null;
			e.dataTransfer?.setData('text/plain', dragging);
			if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
		},
		ondragover(e: DragEvent) {
			const t = target(e);
			if (dragging && t && t.dataset.id !== dragging) {
				e.preventDefault();
				document.querySelectorAll('.drop-target').forEach((x) => x.classList.remove('drop-target'));
				t.classList.add('drop-target');
			}
		},
		ondragend: clear,
		async ondrop(e: DragEvent) {
			const t = target(e);
			const from = dragging;
			const col = column;
			clear();
			if (!from || !t) return;
			e.preventDefault();
			if (t.dataset.id === from) return;
			const into = t.closest<HTMLElement>('[data-status]')?.dataset.status;
			if (onColumn && col && into && into !== col) return onColumn(from, col, into);
			if (!canReorder()) return;
			const to = t.dataset.to ?? `before:${t.dataset.id}`;
			// Show the item where it was dropped at once; the save and the reload follow.
			optimistic?.set(from, to);
			try {
				await moveItem(repo, from, to, state);
			} finally {
				optimistic?.clear();
			}
		}
	};
}
