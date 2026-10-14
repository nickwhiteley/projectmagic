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

/** Svelte attachments' worth of drag handling, as plain handlers: data-id on items, data-to on zones. */
export function dragHandlers(repo: string, state: MoveState, enabled: () => boolean) {
	let dragging: string | null = null;
	const clear = () => {
		dragging = null;
		document.querySelectorAll('.drop-target').forEach((x) => x.classList.remove('drop-target'));
	};
	const target = (e: DragEvent) =>
		(e.target as HTMLElement).closest<HTMLElement>('[data-id],[data-to]');
	return {
		ondragstart(e: DragEvent) {
			const el = (e.target as HTMLElement).closest<HTMLElement>('[data-id]');
			if (!enabled() || !el) return;
			dragging = el.dataset.id!;
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
			clear();
			if (!from || !t) return;
			e.preventDefault();
			const to = t.dataset.to ?? `before:${t.dataset.id}`;
			if (t.dataset.id === from) return;
			await moveItem(repo, from, to, state);
		}
	};
}
