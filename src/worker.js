const BURNING_MOUNTAIN_HOST = "burning-mountain.psy.cards";
const BURNING_MOUNTAIN_SHORT_HOST = "bm.psy.cards";

function withPath(request, pathname) {
	const url = new URL(request.url);
	url.pathname = pathname;
	return new Request(url, request);
}

export default {
	fetch(request, env) {
		const url = new URL(request.url);

		if (url.hostname === BURNING_MOUNTAIN_SHORT_HOST) {
			url.hostname = BURNING_MOUNTAIN_HOST;
			return Response.redirect(url, 308);
		}

		if (url.hostname === BURNING_MOUNTAIN_HOST) {
			if (url.pathname === "/" || url.pathname === "/index.html") {
				return env.ASSETS.fetch(withPath(request, "/burning-mountain"));
			}

			if (url.pathname === "/burning-mountain") {
				url.pathname = "/";
				return Response.redirect(url, 308);
			}
		}

		return env.ASSETS.fetch(request);
	},
};
