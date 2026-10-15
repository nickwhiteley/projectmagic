// Images in rendered documents (PM21): served from a branch's tree through the app, because
// GitHub's raw URLs need a token for a private repository.

const TYPES: Record<string, string> = {
	png: 'image/png',
	jpg: 'image/jpeg',
	jpeg: 'image/jpeg',
	gif: 'image/gif',
	webp: 'image/webp',
	svg: 'image/svg+xml'
};

/** The content type for a path we will serve as an image, or null. */
export function imageType(path: string): string | null {
	return TYPES[path.slice(path.lastIndexOf('.') + 1).toLowerCase()] ?? null;
}

/** A repository path from a URL, or null if it climbs out of the repository or is empty. */
export function cleanPath(raw: string): string | null {
	const parts = raw.split('/');
	if (!raw || parts.some((p) => p === '' || p === '.' || p === '..' || p.includes('\\')))
		return null;
	return parts.join('/');
}

/** Headers that keep an SVG, which can hold script, an inert image (§11.3). */
export const IMAGE_HEADERS = {
	'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox",
	'x-content-type-options': 'nosniff',
	'cache-control': 'private, max-age=300'
};
