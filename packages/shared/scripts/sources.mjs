#!/usr/bin/env node
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { providers } from "../sources/catalog.mjs";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const registryPath = "packages/shared/data/sources.json";
const localRepositoryUrl = "https://github.com/psychedelicare/psy.cards";
const upstreamUrls = {
  drugs: "https://github.com/TripSit/drugs",
  combogen: "https://github.com/TripSit/combogen",
};

function git(cwd, ...args) {
  return execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

function dateOrNull(value, label) {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T/.test(value) || !Number.isFinite(Date.parse(value))) {
    throw new Error(`Invalid ${label}: ${value}`);
  }
  return new Date(value).toISOString();
}

function safePath(root, relativePath) {
  if (typeof relativePath !== "string" || !relativePath || path.isAbsolute(relativePath) || relativePath.split("/").includes("..")) {
    throw new Error(`Invalid input path: ${relativePath}`);
  }
  const fullPath = path.join(root, relativePath);
  if (!fs.existsSync(fullPath)) throw new Error(`Missing source input: ${relativePath}`);
  return fullPath;
}

function inputFiles(root, input) {
  const fullPath = safePath(root, input.path);
  if (!input.extension) {
    if (!fs.statSync(fullPath).isFile()) throw new Error(`Expected source file: ${input.path}`);
    return [input.path];
  }
  const walk = (relative) => fs.readdirSync(path.join(root, relative), { withFileTypes: true }).flatMap((entry) => {
    const name = `${relative}/${entry.name}`;
    return entry.isDirectory() ? walk(name) : entry.isFile() && name.endsWith(input.extension) ? [name] : [];
  });
  const files = walk(input.path).sort();
  if (!files.length) throw new Error(`No ${input.extension} inputs found in ${input.path}`);
  return files;
}

function fileMetadata(root, relativePath, repository) {
  const cwd = repository ? path.join(root, repository) : root;
  const repoPath = repository ? relativePath.slice(repository.length + 1) : relativePath;
  if (repository && !relativePath.startsWith(`${repository}/`)) throw new Error(`Input outside repository: ${relativePath}`);
  const content = fs.readFileSync(path.join(root, relativePath));
  const sha256 = createHash("sha256").update(content).digest("hex");
  // Uncommitted input bytes cannot honestly inherit a previous commit's date.
  // Commit source inputs before refreshing provenance; the registry is a later commit.
  if (git(cwd, "status", "--porcelain", "--", repoPath)) {
    throw new Error(`Uncommitted source input: ${relativePath}. Commit the input before refreshing its revision metadata.`);
  }
  const history = git(cwd, "log", "-1", "--format=%H%n%cI", "--", repoPath);
  const [revision, date] = history.split("\n");
  if (!revision || !date) throw new Error(`Missing Git history for source input: ${relativePath}`);
  const repositoryUrl = repository ? upstreamUrls[repository] : localRepositoryUrl;
  return {
    path: relativePath, sha256, lastChangedRevision: revision,
    lastChangedAt: dateOrNull(date, `${relativePath} last change`),
    url: `${repositoryUrl}/blob/${revision}/${repoPath.split("/").map(encodeURIComponent).join("/")}`,
  };
}

export function buildRegistry({ root: inputRoot = root, definitions = providers } = {}) {
  const ids = new Set();
  const checkedRepositories = new Set();
  const records = definitions.map((provider) => {
    if (!provider.id || ids.has(provider.id)) throw new Error(`Missing or duplicate provider ID: ${provider.id}`);
    ids.add(provider.id);
    if (!provider.name || !provider.role || !provider.description || !Array.isArray(provider.inputs) || !Array.isArray(provider.fields)) {
      throw new Error(`Incomplete provider definition: ${provider.id}`);
    }
    new URL(provider.url);
    const paths = [...new Set(provider.inputs.flatMap((input) => inputFiles(inputRoot, input)))].sort();
    const cwd = provider.repository ? path.join(inputRoot, provider.repository) : inputRoot;
    if (paths.length && !checkedRepositories.has(cwd)) {
      if (git(cwd, "rev-parse", "--is-shallow-repository") === "true") {
        throw new Error(`Shallow Git history cannot establish source dates: ${provider.repository ?? "psy.cards"}. Fetch full history first.`);
      }
      checkedRepositories.add(cwd);
    }
    const imports = paths.map((p) => fileMetadata(inputRoot, p, provider.repository));
    let repositoryRevision = null;
    let sourceRevision = null;
    let retrievedAt = null;
    let dataRevisionAt = imports.length ? imports.map((f) => f.lastChangedAt).sort().at(-1) : null;
    if (provider.repository) {
      if (!upstreamUrls[provider.repository]) throw new Error(`Unknown repository: ${provider.repository}`);
      const cwd = path.join(inputRoot, provider.repository);
      const id = git(cwd, "rev-parse", "HEAD");
      repositoryRevision = {
        id, date: dateOrNull(git(cwd, "show", "-s", "--format=%cI", "HEAD"), "repository revision date"),
        url: `${upstreamUrls[provider.repository]}/commit/${id}`,
      };
    }
    if (provider.metadata === "wikipedia") {
      const { source = {} } = JSON.parse(fs.readFileSync(path.join(inputRoot, paths[0]), "utf8"));
      const id = source.revisionId ?? null;
      if (id !== null && (!Number.isSafeInteger(id) || id <= 0)) throw new Error("Invalid Wikipedia revision ID");
      const date = dateOrNull(source.revisionTimestamp, "Wikipedia revision timestamp");
      sourceRevision = id === null && date === null ? null : {
        id: id === null ? null : String(id), date,
        url: id === null ? null : `https://en.wikipedia.org/w/index.php?title=List_of_drug_combinations&oldid=${id}`,
      };
      dataRevisionAt = date;
      retrievedAt = dateOrNull(source.retrievedAt, "Wikipedia retrieval timestamp");
    }
    const { inputs, repository, metadata, ...description } = provider;
    return {
      ...description,
      licenseStatement: provider.licenseStatement ?? "No separate license statement recorded here.",
      inheritedFrom: provider.inheritedFrom ?? null,
      repositoryRevision, sourceRevision, dataRevisionAt, retrievedAt,
      scientificReviewedAt: null, reviewStatus: "not-recorded",
      imports,
    };
  });
  for (const record of records) {
    if (record.inheritedFrom && !ids.has(record.inheritedFrom)) throw new Error(`Unknown inherited provider: ${record.inheritedFrom}`);
  }
  return { schemaVersion: 1, providers: records };
}

export function serializeRegistry(registry) {
  return `${JSON.stringify(registry, null, 2)}\n`;
}

export function checkRegistry(expected, filename) {
  if (!fs.existsSync(filename)) throw new Error("Source registry is missing. Run pnpm sources:refresh.");
  if (fs.readFileSync(filename, "utf8") !== serializeRegistry(expected)) {
    throw new Error("Source registry differs from its inputs, revisions or catalog. Run pnpm sources:refresh and review the diff.");
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const command = process.argv[2];
    if (!["refresh", "check"].includes(command)) throw new Error("Usage: sources.mjs refresh|check");
    // Workers Builds clones depth 1 and often skips submodules. Git log on that
    // tree would stamp HEAD onto older files, so skip rather than publish dates.
    if (command === "check") {
      let shallow = false;
      try {
        shallow = git(root, "rev-parse", "--is-shallow-repository") === "true";
      } catch {
        shallow = false;
      }
      if (shallow) {
        console.warn("Sources check skipped: shallow Git clone cannot establish source dates.");
      } else if (process.env.CI && !fs.existsSync(path.join(root, "drugs/drugs.json"))) {
        console.warn("Sources check skipped: git submodules are not initialized.");
      } else {
        const registry = buildRegistry();
        checkRegistry(registry, path.join(root, registryPath));
        console.log(`Sources check: ${registry.providers.length} providers, ${registry.providers.reduce((n, p) => n + p.imports.length, 0)} file records. No network requests.`);
      }
    } else {
      const registry = buildRegistry();
      fs.writeFileSync(path.join(root, registryPath), serializeRegistry(registry));
      console.log(`Sources refresh: ${registry.providers.length} providers, ${registry.providers.reduce((n, p) => n + p.imports.length, 0)} file records. No network requests.`);
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
