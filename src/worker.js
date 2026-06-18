const BURNING_MOUNTAIN_HOST = "burning-mountain.psy.cards";
const BURNING_MOUNTAIN_SHORT_HOST = "bm.psy.cards";
const BURNING_MOUNTAIN_ROUTE = "/burning-mountain";
const BURNING_MOUNTAIN_HOSTS = new Set([
	BURNING_MOUNTAIN_HOST,
	BURNING_MOUNTAIN_SHORT_HOST,
]);
const LOCALES = new Set(["fr", "de", "it"]);
const PASSTHROUGH_SEGMENTS = new Set([
	"_astro",
	"assets",
	"card",
	"combo-data",
	"data",
	"favicon.png",
	"robots.txt",
	"sitemap-index.xml",
	"sitemap.xml",
]);

function withPath(request, pathname) {
	const url = new URL(request.url);
	url.pathname = pathname;
	return new Request(url, request);
}

function redirectTo(url, status = 308) {
	return Response.redirect(url, status);
}

function canonicalBmPathname(pathname) {
	let canonical = pathname;
	const indexMatch = canonical.match(/^\/(?:(fr|de|it)\/)?index\.html$/);
	if (indexMatch) {
		canonical = indexMatch[1] ? `/${indexMatch[1]}/` : "/";
	}

	const segments = canonical.split("/").filter(Boolean);
	if (segments[0] === "burning-mountain") {
		segments.shift();
	} else if (LOCALES.has(segments[0]) && segments[1] === "burning-mountain") {
		segments.splice(1, 1);
	}

	if (segments.length === 0) return "/";
	if (segments.length === 1 && LOCALES.has(segments[0])) return `/${segments[0]}/`;
	return `/${segments.join("/")}`;
}

// Astro builds pages as `<route>/index.html` (directory format). The Cloudflare
// asset server redirects a slash-less directory request to its trailing-slash
// form, which would leak the internal `/burning-mountain/` prefix back to the
// client and cause a redirect loop. Request the trailing-slash form directly so
// the asset server returns `index.html` (200) instead of a redirect. Files with
// an extension (e.g. `lsd.png`) are left untouched.
function ensureDirectorySlash(path) {
	const lastSegment = path.split("/").pop();
	if (!lastSegment || lastSegment.includes(".")) return path;
	return path.endsWith("/") ? path : `${path}/`;
}

function burningMountainAssetPath(pathname) {
	const segments = pathname.split("/").filter(Boolean);
	if (segments.length === 0) return `${BURNING_MOUNTAIN_ROUTE}/`;
	if (PASSTHROUGH_SEGMENTS.has(segments[0])) return ensureDirectorySlash(pathname);

	const [first, second, ...rest] = segments;
	if (LOCALES.has(first)) {
		if (!second) return `/${first}${BURNING_MOUNTAIN_ROUTE}/`;
		if (PASSTHROUGH_SEGMENTS.has(second)) return ensureDirectorySlash(pathname);
		return ensureDirectorySlash(
			`/${first}${BURNING_MOUNTAIN_ROUTE}/${[second, ...rest].join("/")}`
		);
	}

	return ensureDirectorySlash(`${BURNING_MOUNTAIN_ROUTE}/${segments.join("/")}`);
}

export default {
	fetch(request, env) {
		const url = new URL(request.url);

		if (BURNING_MOUNTAIN_HOSTS.has(url.hostname)) {
			url.protocol = "https:";
			url.hostname = BURNING_MOUNTAIN_SHORT_HOST;
			const canonicalPath = canonicalBmPathname(url.pathname);
			if (
				request.url !== url.href ||
				url.pathname !== canonicalPath
			) {
				url.pathname = canonicalPath;
				return redirectTo(url);
			}

			return env.ASSETS.fetch(
				withPath(request, burningMountainAssetPath(canonicalPath))
			);
		}

		// Temporary: send main-site home to the combos chart.
		if (url.pathname === "/" || url.pathname === "/index.html") {
			url.pathname = "/combos";
			return redirectTo(url, 302);
		}

		return env.ASSETS.fetch(request);
	},
};
