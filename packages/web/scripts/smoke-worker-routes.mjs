import worker from "../src/worker.js";

const checks = [
	{
		url: "http://bm.psy.cards/",
		status: 308,
		location: "https://bm.psy.cards/",
	},
	{
		url: "https://bm.psy.cards/",
		status: 200,
		assetPath: "/burning-mountain/",
	},
	{
		url: "https://bm.psy.cards/fr/",
		status: 200,
		assetPath: "/fr/burning-mountain/",
	},
	{
		url: "https://bm.psy.cards/fr/lsd",
		status: 200,
		assetPath: "/fr/burning-mountain/",
	},
	{
		url: "https://bm.psy.cards/ketamine",
		status: 200,
		assetPath: "/burning-mountain/",
	},
	{
		url: "https://bm.psy.cards/fr/card/lsd",
		status: 200,
		assetPath: "/fr/card/lsd/",
	},
	{
		url: "https://bm.psy.cards/card/lsd",
		status: 200,
		assetPath: "/card/lsd/",
	},
	{
		url: "https://bm.psy.cards/combo-data/lsd~mdma.json",
		status: 200,
		assetPath: "/combo-data/lsd~mdma.json",
	},
	{
		url: "https://bm.psy.cards/assets/burningmountain-logo.png",
		status: 200,
		assetPath: "/assets/burningmountain-logo.png",
	},
	{
		url: "https://bm.psy.cards/sw.js",
		status: 200,
		assetPath: "/sw.js",
	},
	{
		url: "https://bm.psy.cards/manifest.webmanifest",
		status: 200,
		assetPath: "/manifest.webmanifest",
	},
	{
		url: "https://bm.psy.cards/workbox-2fbc6a65.js",
		status: 200,
		assetPath: "/workbox-2fbc6a65.js",
	},
	{
		url: "https://bm.psy.cards/appicon.png",
		status: 200,
		assetPath: "/appicon.png",
	},
	{
		url: "https://bm.psy.cards/fontshare/css/satoshi.css",
		status: 200,
		assetPath: "/fontshare/css/satoshi.css",
	},
	{
		url: "https://bm.psy.cards/fr/burning-mountain/lsd?x=1",
		status: 308,
		location: "https://bm.psy.cards/fr/lsd?x=1",
	},
	{
		url: "https://burning-mountain.psy.cards/fr/burning-mountain/",
		status: 308,
		location: "https://bm.psy.cards/fr/",
	},
	{
		url: "https://psy.cards/burning-mountain/",
		status: 200,
		assetPath: "/burning-mountain/",
	},
	{
		url: "https://psy.cards/burning-mountain/ketamine/",
		status: 200,
		assetPath: "/burning-mountain/",
	},
	{
		url: "https://psy.cards/",
		status: 200,
		assetPath: "/",
	},
	{
		url: "https://www.psy.cards/index.html",
		status: 200,
		assetPath: "/index.html",
	},
	{
		url: "https://psy.cards/wheel",
		status: 200,
		assetPath: "/wheel",
	},
	{
		url: "https://psy.cards/card/lsd/",
		status: 200,
		assetPath: "/card/lsd/",
	},
	// A card that doesn't exist. Current pages mark their requests and get the
	// 404; old service workers' combos page doesn't, and gets the "updating"
	// card instead of a 404 it would loop on.
	{
		url: "https://psy.cards/card/about/",
		headers: { "X-Psy-Card": "1" },
		status: 404,
	},
	{
		url: "https://psy.cards/card/about/",
		status: 200,
		bodyIncludes: ["data-card-fragment", "PSY.CARDS is updating", "psy:version", 'href="/cache/"'],
	},
	{
		url: "https://psy.cards/fr/card/about/",
		status: 200,
		bodyIncludes: ["data-card-fragment", "PSY.CARDS se met à jour"],
	},
];

const assetPaths = [];
const env = {
	ASSETS: {
		fetch(request) {
			const url = new URL(request.url);
			assetPaths.push(url.pathname);
			if (url.pathname.includes("/card/about")) return new Response("not found", { status: 404 });
			return new Response(`asset:${url.pathname}`);
		},
	},
};

for (const check of checks) {
	const response = await worker.fetch(new Request(check.url, { headers: check.headers }), env);
	if (response.status !== check.status) {
		throw new Error(`${check.url}: expected ${check.status}, got ${response.status}`);
	}

	const location = response.headers.get("location");
	if (check.location && location !== check.location) {
		throw new Error(`${check.url}: expected location ${check.location}, got ${location}`);
	}

	if (check.bodyIncludes) {
		const body = await response.text();
		for (const text of check.bodyIncludes) {
			if (!body.includes(text)) throw new Error(`${check.url}: expected the body to include ${text}`);
		}
	}

	if (check.assetPath) {
		const body = await response.text();
		if (body !== `asset:${check.assetPath}`) {
			throw new Error(`${check.url}: expected asset ${check.assetPath}, got ${body}`);
		}
	}
}

console.log(`worker route smoke passed (${assetPaths.join(", ")})`);
