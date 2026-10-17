<script lang="ts">
	import { page } from '$app/state';
	import { MAX_COMMENT, SCORES } from '#lib/core/feedback.ts';

	// The feedback button (PM35), after Bloomprint's. A suggestion box: nobody is notified.
	let dialog = $state<HTMLDialogElement | null>(null);
	let score = $state<number | null>(null);
	let comment = $state('');
	let busy = $state(false);
	let error = $state('');
	let sent = $state(false);

	function open() {
		score = null;
		comment = '';
		error = '';
		sent = false;
		dialog?.showModal();
	}

	async function send() {
		if (score === null && comment.trim() === '') {
			error = 'Leave a score, or tell us what is wrong.';
			return;
		}
		busy = true;
		error = '';
		try {
			const res = await fetch('/feedback', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					score: score ?? undefined,
					comment: comment.trim() || undefined,
					page: page.url.pathname
				})
			});
			if (!res.ok) {
				const body = await res.json().catch(() => ({}));
				error = body.message ?? 'Could not send that.';
				return;
			}
			sent = true;
		} finally {
			busy = false;
		}
	}
</script>

<button type="button" class="button launch" onclick={open}>Feedback</button>

<!-- A <dialog>, so focus trapping and Escape-to-close come from the element. -->
<dialog bind:this={dialog} class="sheet">
	{#if sent}
		<p>Thank you. We read everything that comes in.</p>
		<div class="actions">
			<button type="button" class="button" onclick={() => dialog?.close()}>Close</button>
		</div>
	{:else}
		<h2>How is it going?</h2>
		<p class="muted hint">
			Tell us what is wrong or missing. A score is optional: if something is broken, just say so.
		</p>
		<fieldset class="score">
			<legend>Overall</legend>
			<div class="faces">
				{#each SCORES as { value, label } (value)}
					<button
						type="button"
						class="face"
						class:on={score === value}
						aria-pressed={score === value}
						aria-label={label}
						title={label}
						onclick={() => (score = score === value ? null : value)}
					>
						<!-- One face with one number moved: the mouth's control point runs from frown to smile. -->
						<svg viewBox="0 0 24 24" aria-hidden="true">
							<circle cx="12" cy="12" r="9" />
							<circle class="eye" cx="8.8" cy="9.5" r="1.1" />
							<circle class="eye" cx="15.2" cy="9.5" r="1.1" />
							<path d="M 8 16.5 Q 12 {16.5 + (value - 3) * 3} 16 16.5" />
						</svg>
					</button>
				{/each}
			</div>
		</fieldset>
		<label>
			Comment
			<textarea bind:value={comment} rows="4" maxlength={MAX_COMMENT}></textarea>
		</label>
		{#if error}<p class="error" role="alert">{error}</p>{/if}
		<div class="actions">
			<button type="button" class="button" onclick={() => dialog?.close()}>Cancel</button>
			<button type="button" class="button primary" disabled={busy} onclick={send}>Send</button>
		</div>
	{/if}
</dialog>

<style>
	.sheet {
		width: min(28rem, calc(100vw - 2rem));
		padding: 1.2rem;
		border: 1px solid var(--line);
		border-radius: var(--radius);
		background: var(--card);
		color: var(--text);
	}
	.sheet::backdrop {
		background: rgb(0 0 0 / 0.35);
	}
	h2 {
		font-size: 20px;
		margin: 0 0 0.3rem;
	}
	.hint {
		margin: 0 0 0.9rem;
		font-size: 13px;
	}
	.score {
		border: 0;
		padding: 0;
		margin: 0 0 0.9rem;
	}
	legend {
		padding: 0;
		font-size: 12.5px;
		color: var(--text-2);
	}
	.faces {
		display: flex;
		gap: 0.2rem;
		margin-top: 0.25rem;
	}
	.face {
		width: 2.4rem;
		height: 2.4rem;
		padding: 0.15rem;
		border: 1px solid transparent;
		border-radius: 50%;
		background: transparent;
		color: var(--text-2);
		cursor: pointer;
	}
	.face:hover {
		color: var(--text);
		background: var(--surface-2);
	}
	/* A ring and a colour change together: colour alone would not survive a monochrome display. */
	.face.on {
		color: var(--text);
		background: var(--surface-3);
		border-color: var(--line-strong);
	}
	.face svg {
		width: 100%;
		height: 100%;
		display: block;
		fill: none;
		stroke: currentColor;
		stroke-width: 1.4;
		stroke-linecap: round;
	}
	.face svg .eye {
		fill: currentColor;
		stroke: none;
	}
	label {
		display: grid;
		gap: 0.25rem;
		font-size: 13px;
		color: var(--text-2);
	}
	textarea {
		font: inherit;
		padding: 0.4rem 0.55rem;
		border: 1px solid var(--line-strong);
		border-radius: var(--radius);
		background: var(--card);
		color: var(--text);
		resize: vertical;
	}
	.actions {
		display: flex;
		justify-content: flex-end;
		gap: 0.6rem;
		margin-top: 0.9rem;
	}
	.error {
		margin: 0.6rem 0 0;
		font-size: 13px;
		color: var(--danger);
	}
</style>
