#!/usr/bin/env node
/**
 * Generate A6 two-sided PDFs for substance print cards.
 *
 * Usage:
 *   pnpm print:pdf -- --locale en --all
 *   pnpm print:pdf -- --locale fr --substance lsd
 *   pnpm print:pdf -- --substance lsd,mushrooms --output ./cards.pdf
 *   pnpm print:pdf -- --all --url http://localhost:4321
 */

import { spawn } from "node:child_process";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "node:http";
import { createReadStream, existsSync, statSync } from "node:fs";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".pdf": "application/pdf",
};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");

const LOCALES = ["en", "fr", "de", "it"];

function printHelp() {
  console.log(`Generate A6 substance card PDFs

Options:
  --locale <code>       Language: en, fr, de, it (default: en)
  --substance <slugs>   Comma-separated slugs or keys (e.g. lsd, ghb-gbl)
  --all                 Generate PDFs for all matrix substances
  --output <path>       Output file or directory (default: dist/print)
  --url <base>          Base URL of built site (skips auto preview server)
  --port <number>       Preview port when auto-starting (default: 4455)
  --no-build            Skip "pnpm build" before generating
  --merge               Write one combined PDF when using --all
  -h, --help            Show this help
`);
}

function parseArgs(argv) {
  const options = {
    locale: "en",
    substances: [],
    all: false,
    output: path.join(root, "packages/web/dist", "print"),
    url: null,
    port: 4455,
    build: true,
    merge: false,
    help: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "-h" || arg === "--help") {
      options.help = true;
      continue;
    }
    if (arg === "--all") {
      options.all = true;
      continue;
    }
    if (arg === "--no-build") {
      options.build = false;
      continue;
    }
    if (arg === "--merge") {
      options.merge = true;
      continue;
    }
    if (arg === "--locale") {
      options.locale = argv[++i] ?? options.locale;
      continue;
    }
    if (arg === "--substance") {
      const value = argv[++i] ?? "";
      options.substances.push(
        ...value.split(",").map((s) => s.trim()).filter(Boolean)
      );
      continue;
    }
    if (arg === "--output") {
      options.output = path.resolve(argv[++i] ?? options.output);
      continue;
    }
    if (arg === "--url") {
      options.url = argv[++i] ?? null;
      continue;
    }
    if (arg === "--port") {
      options.port = Number(argv[++i] ?? options.port);
      continue;
    }
  }

  return options;
}

async function loadSubstanceSlugs(locale) {
  const config = JSON.parse(
    await readFile(path.join(root, "combogen/config.json"), "utf8")
  );
  const enTranslations = JSON.parse(
    await readFile(path.join(root, "drugs/translations/en.json"), "utf8")
  );

  const labelToKey = {};
  for (const [key, label] of Object.entries(enTranslations.drugs)) {
    labelToKey[label] = key;
  }

  const keys = config.tableOrder.flat().map((label) => {
    const key = labelToKey[label] ?? label.toLowerCase();
    return key;
  });

  return keys.map((key) => ({
    key,
    slug: key.replace(/\//g, "-"),
  }));
}

function resolveSubstances(allSubstances, requested, useAll) {
  if (useAll) return allSubstances;

  if (!requested.length) {
    console.error("Specify --substance <slugs> or --all");
    process.exit(1);
  }

  const bySlug = new Map(allSubstances.map((s) => [s.slug, s]));
  const byKey = new Map(allSubstances.map((s) => [s.key, s]));

  const resolved = [];
  for (const token of requested) {
    const normalized = token.toLowerCase();
    const match =
      bySlug.get(normalized) ??
      byKey.get(normalized) ??
      bySlug.get(normalized.replace(/\//g, "-"));
    if (!match) {
      console.error(`Unknown substance: ${token}`);
      process.exit(1);
    }
    resolved.push(match);
  }
  return resolved;
}

function localePrintPath(locale, slug) {
  if (locale === "en") return `/print/${slug}/`;
  return `/${locale}/print/${slug}/`;
}

function runCommand(command, args, cwd = root) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: "inherit",
      shell: process.platform === "win32",
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} exited with code ${code}`));
    });
  });
}

function contentType(filePath) {
  return MIME[path.extname(filePath).toLowerCase()] || "application/octet-stream";
}

function createStaticServer(distDir, port) {
  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      const urlPath = decodeURIComponent(req.url?.split("?")[0] ?? "/");
      let filePath = path.join(
        distDir,
        urlPath.endsWith("/") ? `${urlPath}index.html` : urlPath
      );

      if (urlPath.endsWith("/") && !existsSync(filePath)) {
        filePath = path.join(distDir, urlPath.slice(0, -1) + ".html");
      }

      if (!existsSync(filePath) || statSync(filePath).isDirectory()) {
        res.statusCode = 404;
        res.end("Not found");
        return;
      }

      res.setHeader("Content-Type", contentType(filePath));
      createReadStream(filePath).pipe(res);
    });

    server.on("error", reject);
    server.listen(port, "127.0.0.1", () => {
      resolve({
        url: `http://127.0.0.1:${port}`,
        close: () =>
          new Promise((closeResolve, closeReject) => {
            server.close((error) => (error ? closeReject(error) : closeResolve()));
          }),
      });
    });
  });
}

async function waitForReady(page) {
  await page.waitForFunction(
    () => document.documentElement.dataset.printReady === "true",
    { timeout: 30_000 }
  );

  await page
    .waitForFunction(
      () => {
        const figures = document.querySelectorAll(".molecule-figure");
        if (!figures.length) return true;
        return [...figures].every(
          (figure) =>
            figure.dataset.moleculeRendered === "true" ||
            figure.dataset.moleculeRendered === "error"
        );
      },
      { timeout: 15_000 }
    )
    .catch(() => undefined);

  await new Promise((resolve) => setTimeout(resolve, 250));
}

async function generatePdf(page, targetUrl, outputPath) {
  await page.goto(targetUrl, { waitUntil: "networkidle" });
  await waitForReady(page);

  await page.pdf({
    path: outputPath,
    width: "105mm",
    height: "148mm",
    printBackground: true,
    margin: { top: 0, right: 0, bottom: 0, left: 0 },
    preferCSSPageSize: true,
  });
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  if (!LOCALES.includes(options.locale)) {
    console.error(`Invalid locale: ${options.locale}`);
    process.exit(1);
  }

  const allSubstances = await loadSubstanceSlugs(options.locale);
  const substances = resolveSubstances(
    allSubstances,
    options.substances,
    options.all
  );

  if (options.build && !options.url) {
    console.log("Building site…");
    await runCommand("pnpm", ["build"]);
  }

  const distDir = path.join(root, "packages/web/dist");
  let server = null;
  let baseUrl = options.url;

  if (!baseUrl) {
    console.log(`Serving ${distDir} on port ${options.port}…`);
    server = await createStaticServer(distDir, options.port);
    baseUrl = server.url;
  }

  const { chromium } = await import("playwright");
  const browser = await chromium.launch();
  const page = await browser.newPage();

  try {
    if (options.merge && substances.length > 1) {
      const mergedPath = options.output.endsWith(".pdf")
        ? options.output
        : path.join(options.output, `psy-cards-${options.locale}.pdf`);
      await mkdir(path.dirname(mergedPath), { recursive: true });

      const pages = [];
      for (const substance of substances) {
        const printPath = localePrintPath(options.locale, substance.slug);
        const targetUrl = new URL(printPath, baseUrl).href;
        console.log(`Rendering ${substance.slug}…`);
        await page.goto(targetUrl, { waitUntil: "networkidle" });
        await waitForReady(page);
        const buffer = await page.pdf({
          width: "105mm",
          height: "148mm",
          printBackground: true,
          margin: { top: 0, right: 0, bottom: 0, left: 0 },
          preferCSSPageSize: true,
        });
        pages.push(buffer);
      }

      const { PDFDocument } = await import("pdf-lib");
      const merged = await PDFDocument.create();
      for (const bytes of pages) {
        const doc = await PDFDocument.load(bytes);
        const copied = await merged.copyPages(doc, doc.getPageIndices());
        copied.forEach((p) => merged.addPage(p));
      }
      const mergedBytes = await merged.save();
      await import("node:fs/promises").then((fs) =>
        fs.writeFile(mergedPath, mergedBytes)
      );
      console.log(`Wrote ${mergedPath}`);
    } else {
      const outputDir = options.output.endsWith(".pdf")
        ? path.dirname(options.output)
        : path.join(options.output, options.locale);

      await mkdir(outputDir, { recursive: true });

      for (const substance of substances) {
        const printPath = localePrintPath(options.locale, substance.slug);
        const targetUrl = new URL(printPath, baseUrl).href;
        const outputPath = options.output.endsWith(".pdf")
          ? options.output
          : path.join(outputDir, `${substance.slug}.pdf`);

        console.log(`Generating ${substance.slug} → ${outputPath}`);
        await generatePdf(page, targetUrl, outputPath);
      }
    }
  } finally {
    await browser.close();
    if (server) await server.close();
  }

  console.log("Done.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
