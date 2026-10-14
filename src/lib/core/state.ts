// A project's state for the views (spec §9), assembled from the cached parses of every active
// branch: each item's derived status and where it came from, its links, the plan, the branches,
// what is done, and the health panel. Pure: the server loader passes the rows in.
import type { Backlog, Item, Note, Section, Warning } from './backlog.ts';
import { EDIT_BRANCH } from './branchref.ts';
import type { Config } from './config.ts';
import { link, type Dangling, type Edge } from './link.ts';
import type { MetaEntry, Status } from './meta.ts';
import type { Group, Task } from './progress.ts';
import { deriveStatus, type LinkedBranch, type LinkedPr, type StatusSource } from './status.ts';

export interface PrInfo {
	number: number;
	title: string;
	body: string | null;
	state: 'OPEN' | 'MERGED' | 'CLOSED';
	isDraft: boolean;
	url: string;
	baseRefName: string;
	headRefName: string;
	createdAt: string;
	mergedAt: string | null;
}

/** A backlog parse as the sync caches it: each item carries its source, and the preamble its text. */
export interface StoredBacklog extends Omit<Backlog, 'items'> {
	items: (Item & { source: string })[];
	preambleText?: string;
}

export interface StoredPlan {
	tasks: Task[];
	groups: Group[];
	next: string | null;
	unknown: string[];
}

export interface RefInput {
	name: string;
	headOid: string;
	committedAt: string;
	ahead: number;
	behind: number;
	active: boolean;
	message: string;
	prs: PrInfo[];
	backlog: StoredBacklog | null;
	plan: StoredPlan | null;
}

export interface DoneInput {
	itemId: string;
	title: string;
	lastBody: string;
	removedOid: string;
	removedAt: string;
	prNumber: number | null;
}

export interface StateInput {
	owner: string;
	repo: string;
	config: Config;
	configWarnings: string[];
	refs: RefInput[];
	done: DoneInput[];
	lastSyncAt: string | null;
	lastError: string | null;
	now: number;
}

export interface BranchLink {
	name: string;
	ahead: number;
	behind: number;
	active: boolean;
	committedAt: string;
	message: string;
}

export interface PrLink {
	number: number;
	title: string;
	state: PrInfo['state'];
	draft: boolean;
	url: string;
	branch: string;
}

export interface TaskLink {
	number: string;
	title: string;
	status: Task['status'];
	group: string | null;
}

export interface ItemView {
	id: string;
	idKind: Item['idKind'];
	title: string;
	titleText: string;
	star: boolean;
	job: string | null;
	/** The heading's own ` — WORD` tag, which an edit rewrites when the meta line has no Job. */
	headingJob: string | null;
	size: string | null;
	section: number | null;
	line: number;
	start: number;
	meta: MetaEntry[] | null;
	body: string;
	source: string;
	status: Status;
	statusSource: StatusSource;
	blocked: boolean;
	waiting: string | null;
	branches: BranchLink[];
	prs: PrLink[];
	tasks: TaskLink[];
	disagreements: string[];
	hints: string[];
	/** Other branches' copies that differ from main's, for the item view's diffs. */
	differs: { branch: string; source: string }[];
	/** Changed in the open Project Magic edits PR (§10.3). */
	pending: boolean;
	/** Older branches probably about this item (§6, source 6): shown, never used for status. */
	inferredBranches: string[];
}

export interface BranchView extends BranchLink {
	isMain: boolean;
	/** An item this older branch is probably about (§6, source 6). */
	inferred: string | null;
	prs: PrLink[];
	items: string[];
	tasks: string[];
	/** Active work the backlog doesn't know about (§9: listed first). */
	unlinked: boolean;
	isEdits: boolean;
	/** A deployment branch: main is merged into it by PR (both projects' `vercel`). Not work. */
	isDeploy: boolean;
}

export interface DoneView {
	id: string;
	title: string;
	at: string | null;
	commit: string | null;
	pr: number | null;
	body: string;
	/** Still on main with `done` in its meta line, waiting to be pruned. */
	unpruned: boolean;
}

export interface Health {
	lastError: string | null;
	warnings: Warning[];
	dangling: Dangling[];
	disagreements: string[];
	unknownTasks: string[];
	configWarnings: string[];
	notes: string[];
}

export interface PlanTaskView extends Task {
	items: string[];
}

export interface ProjectState {
	owner: string;
	repo: string;
	name: string;
	main: string;
	lastSyncAt: string | null;
	hasBacklog: boolean;
	preambleText: string;
	sections: Section[];
	items: ItemView[];
	notes: Note[];
	plan: { tasks: PlanTaskView[]; groups: Group[]; next: string | null } | null;
	branches: BranchView[];
	done: DoneView[];
	health: Health;
	/** The last commit on any branch. */
	lastCommit: { branch: string; at: string; message: string } | null;
	/** Every id in use or used before: main, every active branch, and done history (§10.1). */
	usedIds: string[];
	newIdPrefix: string | null;
}

const prLink = (p: PrInfo): PrLink => ({
	number: p.number,
	title: p.title,
	state: p.state,
	draft: p.isDraft,
	url: p.url,
	branch: p.headRefName
});

export function assembleState(input: StateInput): ProjectState {
	const { config } = input;
	const main = input.refs.find((r) => r.name === config.main) ?? null;
	const items = main?.backlog?.items ?? [];
	const plan = main?.plan ?? null;
	const active = input.refs.filter((r) => r.active);
	const refByName = new Map(input.refs.map((r) => [r.name, r]));

	// Every PR once, from the branch it was opened from.
	const prs = new Map<number, PrInfo>();
	for (const r of input.refs)
		for (const p of r.prs) if (p.headRefName === r.name) prs.set(p.number, p);

	// Tasks that exist: main's, and active branches' where main lacks them (a branch adds rows).
	const tasks = new Map<string, Task>();
	for (const r of [...active.filter((r) => r !== main), ...(main ? [main] : [])])
		for (const t of r.plan?.tasks ?? []) if (!t.superseded) tasks.set(t.number, t);

	const copies = active
		.filter((r) => r.backlog)
		.map((r) => ({ branch: r.name, items: r.backlog!.items as Item[] }));
	const links = link({
		items: items as Item[],
		tasks: tasks.keys(),
		branches: input.refs.map((r) => ({ name: r.name })),
		prs: [...prs.values()].map((p) => ({
			number: p.number,
			title: p.title,
			body: p.body,
			headRef: p.headRefName
		})),
		copies
	});
	// Inferred links (source 6) are shown, labelled, but never feed status (§6).
	const edgesOf = (id: string) =>
		links.edges.filter((e) => e.from.kind === 'item' && e.from.id === id && e.source !== 6);
	const inferredOf = (id: string) =>
		links.edges.flatMap((e) =>
			e.source === 6 && e.from.kind === 'item' && e.from.id === id && e.to.kind === 'branch'
				? [e.to.name]
				: []
		);
	const branchLink = (r: RefInput): BranchLink => ({
		name: r.name,
		ahead: r.ahead,
		behind: r.behind,
		active: r.active,
		committedAt: r.committedAt,
		message: r.message
	});

	const edits = refByName.get(EDIT_BRANCH);
	const views: ItemView[] = items.map((it) => {
		const edges = edgesOf(it.id);
		const pick = <K extends Edge['to']['kind']>(kind: K) =>
			edges.map((e) => e.to).filter((t): t is Extract<Edge['to'], { kind: K }> => t.kind === kind);
		const branches = pick('branch')
			.map((b) => refByName.get(b.name))
			.filter((r): r is RefInput => !!r && r !== main);
		const itemPrs = pick('pr')
			.map((p) => prs.get(p.number))
			.filter((p): p is PrInfo => !!p);
		const itemTasks = pick('task')
			.map((t) => tasks.get(t.number))
			.filter((t): t is Task => !!t);
		const otherCopies = active
			.filter((r) => r !== main && r.name !== EDIT_BRANCH && r.backlog)
			.flatMap((r) => {
				const c = r.backlog!.items.find((x) => x.id === it.id);
				return c ? [{ branch: r.name, item: c as Item, text: c.source }] : [];
			});
		const d = deriveStatus({
			item: it,
			text: it.source,
			removed: false,
			branches: branches.map((r): LinkedBranch => ({
				name: r.name,
				active: r.active,
				ahead: r.ahead,
				committedAt: r.committedAt
			})),
			prs: itemPrs.map((p): LinkedPr => ({
				number: p.number,
				state: p.state === 'OPEN' ? 'open' : p.state === 'MERGED' ? 'merged' : 'closed',
				draft: p.isDraft
			})),
			copies: otherCopies,
			tasks: itemTasks
		});
		const editCopy = edits?.active ? edits.backlog?.items.find((x) => x.id === it.id) : undefined;
		return {
			id: it.id,
			idKind: it.idKind,
			title: it.title,
			titleText: it.titleText,
			star: it.star,
			job: it.job,
			headingJob: it.headingJob,
			size: it.meta?.size ?? null,
			section: it.section,
			line: it.line,
			start: it.start,
			meta: it.meta?.entries ?? null,
			body: it.body,
			source: it.source,
			status: d.status,
			statusSource: d.source,
			blocked: d.blocked,
			waiting: d.waiting,
			branches: branches.map(branchLink),
			prs: itemPrs.map(prLink),
			tasks: itemTasks.map((t) => ({
				number: t.number,
				title: t.title,
				status: t.status,
				group: t.group
			})),
			disagreements: d.disagreements,
			hints: d.hints,
			differs: d.differs.map((c) => ({ branch: c.branch, source: c.text })),
			pending: !!edits?.active && (editCopy?.source ?? null) !== it.source,
			inferredBranches: inferredOf(it.id)
		};
	});

	const deploy = new Set(
		(main?.prs ?? []).filter((p) => p.headRefName === main?.name).map((p) => p.baseRefName)
	);
	const branchViews: BranchView[] = input.refs
		.map((r) => {
			const es = links.edges.filter(
				(e) =>
					(e.to.kind === 'branch' && e.to.name === r.name) ||
					(e.to.kind === 'pr' && prs.get(e.to.number)?.headRefName === r.name)
			);
			const confident = es.filter((e) => e.source !== 6);
			const inferred = es.find((e) => e.source === 6 && e.from.kind === 'item');
			const itemIds = [
				...new Set(confident.flatMap((e) => (e.from.kind === 'item' ? [e.from.id] : [])))
			];
			const taskIds = [
				...new Set(es.flatMap((e) => (e.from.kind === 'task' ? [e.from.number] : [])))
			];
			const isMain = r === main;
			const isEdits = r.name === EDIT_BRANCH;
			const isDeploy = deploy.has(r.name);
			return {
				...branchLink(r),
				isMain,
				isEdits,
				isDeploy,
				prs: r.prs.filter((p) => p.headRefName === r.name).map(prLink),
				items: itemIds,
				tasks: taskIds,
				inferred: inferred && inferred.from.kind === 'item' ? inferred.from.id : null,
				unlinked: r.active && !isMain && !isEdits && !isDeploy && !itemIds.length && !taskIds.length
			};
		})
		.sort(
			(a, b) =>
				Number(b.isMain) - Number(a.isMain) ||
				Number(b.unlinked) - Number(a.unlinked) ||
				Number(b.active) - Number(a.active) ||
				b.committedAt.localeCompare(a.committedAt)
		);

	const done: DoneView[] = [
		...views
			.filter((v) => v.meta && v.status === 'done' && v.statusSource.rule === 1)
			.map((v) => ({
				id: v.id,
				title: v.title,
				at: null,
				commit: null,
				pr: null,
				body: v.body,
				unpruned: true
			})),
		...input.done
			.map((d) => ({
				id: d.itemId,
				title: d.title,
				at: d.removedAt,
				commit: d.removedOid,
				pr: d.prNumber,
				body: d.lastBody,
				unpruned: false
			}))
			.sort((a, b) => b.at.localeCompare(a.at))
	];

	const planTasks: PlanTaskView[] | null = plan
		? plan.tasks.map((t) => ({
				...t,
				items: links.edges
					.filter(
						(e) =>
							e.from.kind === 'item' &&
							e.to.kind === 'task' &&
							e.to.number === t.number &&
							!t.superseded
					)
					.map((e) => (e.from as { id: string }).id)
			}))
		: null;

	const latest = [...input.refs].sort((a, b) => b.committedAt.localeCompare(a.committedAt))[0];
	return {
		owner: input.owner,
		repo: input.repo,
		name: config.name,
		main: config.main,
		lastSyncAt: input.lastSyncAt,
		hasBacklog: !!main?.backlog,
		preambleText: main?.backlog?.preambleText ?? '',
		sections: main?.backlog?.sections ?? [],
		items: views,
		notes: main?.backlog?.notes ?? [],
		plan: plan && planTasks ? { tasks: planTasks, groups: plan.groups, next: plan.next } : null,
		branches: branchViews,
		done,
		health: {
			lastError: input.lastError,
			warnings: main?.backlog?.warnings ?? [],
			dangling: links.dangling,
			disagreements: views.flatMap((v) => v.disagreements),
			unknownTasks: plan?.unknown ?? [],
			configWarnings: input.configWarnings,
			notes: (main?.backlog?.notes ?? []).map((n) => n.titleText)
		},
		lastCommit: latest
			? { branch: latest.name, at: latest.committedAt, message: latest.message }
			: null,
		newIdPrefix: config.newIdPrefix,
		usedIds: [
			...new Set([
				...active.flatMap((r) => r.backlog?.items.map((i) => i.id) ?? []),
				...input.done.map((d) => d.itemId)
			])
		]
	};
}
