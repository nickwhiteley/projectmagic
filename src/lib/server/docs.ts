// Documents (spec §7.1, §9): listed lazily per branch from the tree, filtered by the project's
// `docs` globs, and their text cached by blob oid in doc_blob.
import { selectDocs } from '#lib/core/glob.ts';
import type { Config } from '#lib/core/config.ts';
import { db } from './db.ts';
import { installationClient } from './github-app.ts';
import type { ProjectRow } from './projects.ts';
import { fetchBlobs } from './sync.ts';

export interface DocFile {
	path: string;
	oid: string;
}

const trees = new Map<string, DocFile[]>();

/** The documents on a branch, keyed by its head commit so a push shows new files. */
export async function listDocs(
	project: ProjectRow,
	config: Config,
	headOid: string
): Promise<DocFile[]> {
	const key = `${project.id}:${headOid}`;
	const hit = trees.get(key);
	if (hit) return hit;
	const gh = installationClient(project.installationId);
	const { body } = await gh.rest<{
		tree: { path: string; type: string; sha: string }[];
		truncated: boolean;
	}>(
		`/repos/${project.owner}/${project.repo}/git/trees/${encodeURIComponent(headOid)}?recursive=1`
	);
	const blobs = new Map(body.tree.filter((t) => t.type === 'blob').map((t) => [t.path, t.sha]));
	const docs = selectDocs([...blobs.keys()], config.docs, config.docsExclude).map((path) => ({
		path,
		oid: blobs.get(path)!
	}));
	trees.set(key, docs);
	return docs;
}

export async function docText(project: ProjectRow, oid: string): Promise<string | null> {
	const [row] = await db()<{ text: string }[]>`select text from doc_blob where oid = ${oid}`;
	if (row) return row.text;
	const texts = await fetchBlobs(
		installationClient(project.installationId),
		project.owner,
		project.repo,
		[oid]
	);
	const text = texts.get(oid);
	if (text === undefined) return null;
	await db()`insert into doc_blob (oid, text) values (${oid}, ${text}) on conflict (oid) do nothing`;
	return text;
}
