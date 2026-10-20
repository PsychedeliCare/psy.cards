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
	"fontshare",
	"favicon.png",
	"robots.txt",
	"sitemap-index.xml",
	"sitemap.xml",
]);

/** Root-level files that must not be prefixed with /burning-mountain on bm.psy.cards. */
function isRootPassthroughAsset(pathname) {
	const segments = pathname.split("/").filter(Boolean);
	if (segments.length !== 1) return false;
	const name = segments[0];
	return (
		name === "sw.js" ||
		name === "manifest.webmanifest" ||
		name === "registerSW.js" ||
		name === "favicon.png" ||
		name === "appicon.png" ||
		(name.startsWith("workbox-") && name.endsWith(".js"))
	);
}

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
function isSubstanceSlugSegment(segment) {
	return (
		Boolean(segment) &&
		!LOCALES.has(segment) &&
		!PASSTHROUGH_SEGMENTS.has(segment) &&
		!segment.includes(".")
	);
}

function burningMountainIndexAssetPath(canonicalPath) {
	const segments = canonicalPath.split("/").filter(Boolean);
	if (segments.length === 0) return ensureDirectorySlash(BURNING_MOUNTAIN_ROUTE);
	if (segments.length === 1 && LOCALES.has(segments[0])) {
		return ensureDirectorySlash(`/${segments[0]}${BURNING_MOUNTAIN_ROUTE}`);
	}
	if (segments.length === 1 && isSubstanceSlugSegment(segments[0])) {
		return ensureDirectorySlash(BURNING_MOUNTAIN_ROUTE);
	}
	if (
		segments.length === 2 &&
		LOCALES.has(segments[0]) &&
		isSubstanceSlugSegment(segments[1])
	) {
		return ensureDirectorySlash(`/${segments[0]}${BURNING_MOUNTAIN_ROUTE}`);
	}
	return null;
}

function mainSiteBurningMountainIndexPath(pathname) {
	const segments = pathname.split("/").filter(Boolean);
	if (
		segments[0] === "burning-mountain" &&
		segments.length >= 2 &&
		isSubstanceSlugSegment(segments[1])
	) {
		return ensureDirectorySlash(BURNING_MOUNTAIN_ROUTE);
	}
	if (
		LOCALES.has(segments[0]) &&
		segments[1] === "burning-mountain" &&
		segments.length >= 3 &&
		isSubstanceSlugSegment(segments[2])
	) {
		return ensureDirectorySlash(`/${segments[0]}/burning-mountain`);
	}
	return null;
}

function ensureDirectorySlash(path) {
	const lastSegment = path.split("/").pop();
	if (!lastSegment || lastSegment.includes(".")) return path;
	return path.endsWith("/") ? path : `${path}/`;
}

function burningMountainAssetPath(pathname) {
	const indexPath = burningMountainIndexAssetPath(pathname);
	if (indexPath) return indexPath;

	const segments = pathname.split("/").filter(Boolean);
	if (segments.length === 0) return `${BURNING_MOUNTAIN_ROUTE}/`;
	if (isRootPassthroughAsset(pathname)) return pathname;
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

/**
 * Service workers installed before October 2026 answered any page they did
 * not know with the combos page, whose script then loads `/card/<path>` and,
 * when that 404s, reloads the page: forever (/about did this). That old code
 * keeps running on visitors' devices until the new worker (src/sw.ts) takes
 * over. Current pages send X-Psy-Card with their card requests; a missing
 * card requested without it gets this "updating" card instead of a 404, which
 * the old page shows rather than reloading, and which reloads it into the
 * real page as soon as the new worker controls it. /cache is the manual way
 * out.
 */
const CARD_PATH = /^\/(?:(fr|de|it)\/)?card\/[^/]+\/?$/;
const UPDATE_COPY = {
	en: ["PSY.CARDS is updating", "This page opens by itself in a moment.", "Still here after a minute? Reset PSY.CARDS on this device"],
	fr: ["PSY.CARDS se met à jour", "Cette page s'ouvre d'elle-même dans un instant.", "Toujours là après une minute ? Réinitialisez PSY.CARDS sur cet appareil"],
	de: ["PSY.CARDS wird aktualisiert", "Diese Seite öffnet sich gleich von selbst.", "Nach einer Minute noch hier? PSY.CARDS auf diesem Gerät zurücksetzen"],
	it: ["PSY.CARDS si sta aggiornando", "Questa pagina si apre da sola tra un momento.", "Ancora qui dopo un minuto? Reimposta PSY.CARDS su questo dispositivo"],
};
// Runs in the old page (fragments' <script>s don't): reload once a worker
// that answers "psy:version" (src/sw.ts) is active, or when it takes over.
const UPDATE_SCRIPT = `(function(){var s=navigator.serviceWorker;if(!s)return;var k='psy-update-reloads',n=+(sessionStorage.getItem(k)||0);function go(){if(n>2)return;sessionStorage.setItem(k,n+1);location.reload()}s.addEventListener('controllerchange',go);s.getRegistration().then(function(r){if(!r)return;r.update();var w=r.active;if(!w)return;var c=new MessageChannel();c.port1.onmessage=function(e){if(e.data>=2)go()};w.postMessage({type:'psy:version'},[c.port2])})})()`;

function updateCard(locale) {
	const [title, text, reset] = UPDATE_COPY[locale] ?? UPDATE_COPY.en;
	const html = `<!doctype html><html lang="${locale}"><head><meta charset="utf-8"><meta name="robots" content="noindex"><title>${title}</title></head><body><div data-card-fragment><div style="display:grid;justify-items:center;gap:12px;max-width:340px;margin:0 auto;padding:40px 24px;border-radius:24px;background:#151518;color:#f3f3f5;font:16px/1.5 system-ui,sans-serif;text-align:center"><img src="/favicon.png" alt="" width="56" height="56" onload="${UPDATE_SCRIPT.replace(/"/g, "&quot;")}"><h2 style="margin:0;font-size:22px">${title}</h2><p style="margin:0;color:#b9b9c0">${text}</p><a href="/cache/" style="color:#f3f3f5;font-size:14px">${reset}</a></div></div></body></html>`;
	return new Response(html, {
		headers: {
			"content-type": "text/html; charset=utf-8",
			"cache-control": "no-store",
			"x-robots-tag": "noindex",
		},
	});
}

async function cardOrUpdate(request, env, locale) {
	const response = await env.ASSETS.fetch(request);
	// Current pages mark their requests (src/scripts/card-request.ts) and
	// handle a 404 themselves.
	if (response.status !== 404 || request.headers.has("x-psy-card")) return response;
	return updateCard(locale);
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

		const mainSiteBmIndex = mainSiteBurningMountainIndexPath(url.pathname);
		if (mainSiteBmIndex) {
			return env.ASSETS.fetch(withPath(request, mainSiteBmIndex));
		}

		const card = url.pathname.match(CARD_PATH);
		if (card) return cardOrUpdate(request, env, card[1] ?? "en");

		return env.ASSETS.fetch(request);
	},
};
