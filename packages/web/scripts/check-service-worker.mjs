/**
 * Guards the built service worker (dist/sw.js) against the ways it has
 * broken the site before. Runs after every build and fails it on:
 *
 * - a precached URL that Cloudflare would redirect or not find: precaching a
 *   redirect slows installs to minutes and Safari refuses redirected
 *   responses for pages. Cloudflare's default "auto-trailing-slash" serves
 *   `mdma/index.html` at `/mdma/` and redirects `/mdma` and
 *   `/mdma/index.html` there;
 * - a page listed twice, or an unlisted page (/about, /logo) in the precache;
 * - a catch-all navigation fallback, which answers new or unknown URLs with
 *   another page (the combos shell sent /about into a reload loop);
 * - a worker that waits for every tab to close before it takes over.
 *
 * Usage: node scripts/check-service-worker.mjs [distDir]
 */
import fs from "node:fs";
import path from "node:path";

const dist = path.resolve(process.argv[2] ?? new URL("../dist", import.meta.url).pathname);
const swPath = path.join(dist, "sw.js");
const UNLISTED = [/^about\//, /^logo\//];
const errors = [];
/** Problems with the worker itself, listed before the per-URL ones. */
const structural = [];

if (!fs.existsSync(swPath)) {
  console.error(`check-service-worker: ${swPath} is missing`);
  process.exit(1);
}
const sw = fs.readFileSync(swPath, "utf8");

const urls = [...sw.matchAll(/["']?url["']?\s*:\s*["']([^"']+)["']/g)].map((match) => match[1]);
if (urls.length === 0) structural.push("no precache manifest found in sw.js");

const isFile = (relative) => fs.existsSync(path.join(dist, relative)) && fs.statSync(path.join(dist, relative)).isFile();

/** How Cloudflare's auto-trailing-slash asset handling answers `url`. */
function cloudflareResponse(url) {
  const relative = url === "./" ? "" : url.replace(/^\.?\//, "");
  if (relative === "" || relative.endsWith("/")) {
    return isFile(`${relative}index.html`) ? 200 : 404;
  }
  const last = relative.split("/").pop();
  if (last.endsWith(".html")) return isFile(relative) ? 307 : 404;
  if (last.includes(".")) return isFile(relative) ? 200 : 404;
  if (isFile(`${relative}.html`)) return 200;
  return isFile(`${relative}/index.html`) ? 307 : 404;
}

const seen = new Map();
for (const url of urls) {
  const status = cloudflareResponse(url);
  if (status !== 200) errors.push(`precached ${url} would get ${status === 307 ? "a redirect" : "a 404"} from Cloudflare`);
  const page = url.replace(/^\.?\//, "").replace(/index\.html$/, "").replace(/\/?$/, "");
  if (!/\.[a-z0-9]+$/i.test(page)) {
    if (seen.has(page)) errors.push(`page /${page} is precached twice (${seen.get(page)}, ${url})`);
    seen.set(page, url);
  }
  if (UNLISTED.some((pattern) => pattern.test(url.replace(/^\.?\//, "")))) errors.push(`unlisted page precached: ${url}`);
}

// The Workbox runtime bundled into sw.js defines these; only a call with a
// URL (or a NavigationRoute) registers a fallback.
if (/new [\w.]*NavigationRoute\(|createHandlerBoundToURL\(\s*["'`]/.test(sw)) {
  structural.push("sw.js registers a navigation fallback: unknown and new URLs would be answered with another page");
}
if (!/skipWaiting\(\)/.test(sw)) structural.push("sw.js does not call skipWaiting(): new deploys would wait for every tab to close");
if (!/clientsClaim\(\)/.test(sw)) structural.push("sw.js does not call clientsClaim()");
errors.unshift(...structural);

if (errors.length) {
  console.error(`check-service-worker: ${errors.length} problem(s) in ${swPath}`);
  for (const error of errors.slice(0, 40)) console.error(`  - ${error}`);
  if (errors.length > 40) console.error(`  … and ${errors.length - 40} more`);
  process.exit(1);
}
console.log(`check-service-worker: ${urls.length} precached URLs, ${seen.size} pages, all served without redirects`);
