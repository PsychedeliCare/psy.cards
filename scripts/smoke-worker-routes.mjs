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
		assetPath: "/fr/burning-mountain/lsd/",
	},
	{
		url: "https://bm.psy.cards/ketamine",
		status: 200,
		assetPath: "/burning-mountain/ketamine/",
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
		url: "https://psy.cards/",
		status: 302,
		location: "https://psy.cards/combos",
	},
	{
		url: "https://www.psy.cards/index.html",
		status: 302,
		location: "https://www.psy.cards/combos",
	},
];

const assetPaths = [];
const env = {
	ASSETS: {
		fetch(request) {
			const url = new URL(request.url);
			assetPaths.push(url.pathname);
			return new Response(`asset:${url.pathname}`);
		},
	},
};

for (const check of checks) {
	const response = await worker.fetch(new Request(check.url), env);
	if (response.status !== check.status) {
		throw new Error(`${check.url}: expected ${check.status}, got ${response.status}`);
	}

	const location = response.headers.get("location");
	if (check.location && location !== check.location) {
		throw new Error(`${check.url}: expected location ${check.location}, got ${location}`);
	}

	if (check.assetPath) {
		const body = await response.text();
		if (body !== `asset:${check.assetPath}`) {
			throw new Error(`${check.url}: expected asset ${check.assetPath}, got ${body}`);
		}
	}
}

console.log(`worker route smoke passed (${assetPaths.join(", ")})`);
