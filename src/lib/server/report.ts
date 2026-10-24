// Where the sync's own modules report a failure they catch and go on from (PM49). They import
// nothing from SvelteKit, so `scripts/sync.ts` can run them, and there the report is a log line.
// In the app, ops.ts points this at the recorder.

export type Reporter = (
	kind: string,
	scope: { projectId?: string | null; tenantId?: string | null },
	error: unknown,
	detail?: Record<string, unknown>
) => void;

let reporter: Reporter = (kind, scope, error, detail) =>
	console.error(
		JSON.stringify({
			level: 'error',
			event: `${kind} failed`,
			...scope,
			...detail,
			error: error instanceof Error ? error.message : String(error)
		})
	);

export function setReporter(r: Reporter): void {
	reporter = r;
}

export function report(...args: Parameters<Reporter>): void {
	try {
		reporter(...args);
	} catch {
		// Reporting a failure must not cause another.
	}
}
