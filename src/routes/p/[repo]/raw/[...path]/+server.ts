// An image from a branch's tree, for the Docs tab (PM21).
import { installationClient } from '#lib/server/github-app.ts';
import { cleanPath, IMAGE_HEADERS, imageType } from '#lib/server/image.ts';
import { projectState } from '#lib/server/project-state.ts';
import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

const MAX = 1_000_000; // the contents API's inline limit

export const GET: RequestHandler = async ({ locals, params, url, request }) => {
	const project = locals.project!;
	const path = cleanPath(params.path);
	const type = path && imageType(path);
	if (!path || !type) error(404, 'Not an image');
	const s = await projectState({ locals, params });
	const ref = url.searchParams.get('ref') ?? s.main;
	if (!s.branches.some((b) => b.name === ref)) error(404, `No branch ${ref}`);

	const gh = installationClient(project.installationId);
	const encoded = path.split('/').map(encodeURIComponent).join('/');
	const res = await gh.send<{ type?: string; sha?: string; size?: number; content?: string }>(
		'GET',
		`/repos/${project.owner}/${project.repo}/contents/${encoded}?ref=${encodeURIComponent(ref)}`
	);
	const f = res.body;
	if (res.status !== 200 || f?.type !== 'file' || !f.sha) error(404, `${path} is not on ${ref}`);
	if ((f.size ?? 0) > MAX || !f.content) error(413, `${path} is too large to show`);

	const etag = `"${f.sha}"`;
	if (request.headers.get('if-none-match') === etag)
		return new Response(null, { status: 304, headers: { etag, ...IMAGE_HEADERS } });
	return new Response(Buffer.from(f.content, 'base64'), {
		headers: { 'content-type': type, etag, ...IMAGE_HEADERS }
	});
};
