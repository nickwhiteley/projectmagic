// After an edit (spec §10.3, PM17): sync until the cache holds the edit's commit. One sync is not
// enough: a sync a webhook started before the merge may still be running, and then ours is only
// queued behind it; and GitHub can return a ref's old head for a moment after it moves. No
// imports, so it is tested on its own; sync-runner.ts supplies the database and the clock.

export interface SettleDeps {
	/** Runs a sync, or queues one behind a sync that is already running. */
	sync: () => Promise<'ran' | 'queued' | 'failed'>;
	/** Resolves when no sync is running for the project, or the time is up. */
	idle: () => Promise<void>;
	/** True once the cache holds the edit. */
	done: () => Promise<boolean>;
	sleep: (ms: number) => Promise<void>;
	now: () => number;
}

/** True if the edit reached the cache within `limitMs`. */
export async function settle(d: SettleDeps, limitMs = 10_000, retryMs = 500): Promise<boolean> {
	const until = d.now() + limitMs;
	for (;;) {
		if ((await d.sync()) === 'queued') await d.idle();
		if (await d.done()) return true;
		if (d.now() + retryMs >= until) return false;
		await d.sleep(retryMs);
	}
}
