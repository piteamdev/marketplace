#!/usr/bin/env node
// Marketplace catalog validator — plain Node (>=22), no dependencies, ESM.
// Usage:
//   node validate.mjs              # validate catalog.json against the contract
//   node validate.mjs --fix-hashes # recompute contentHash fields and rewrite catalog.json

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;
const SEMVER_RE = /^\d+\.\d+\.\d+$/;

const errors = [];

function err(msg) {
  errors.push(msg);
}

function sha256File(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

// ---------- catalog.json shape ----------

function readCatalog() {
  let raw;
  try {
    raw = readFileSync("catalog.json", "utf8");
  } catch (e) {
    err(`catalog.json unreadable: ${e.message}`);
    return null;
  }
  let catalog;
  try {
    catalog = JSON.parse(raw);
  } catch (e) {
    err(`catalog.json is not valid JSON: ${e.message}`);
    return null;
  }
  if (catalog === null || typeof catalog !== "object" || Array.isArray(catalog)) {
    err("catalog.json must be a JSON object");
    return null;
  }
  if (catalog.schemaVersion !== 1) {
    err(`catalog.schemaVersion must be 1, got ${JSON.stringify(catalog.schemaVersion)}`);
  }
  if (typeof catalog.catalogVersion !== "string" || catalog.catalogVersion.length === 0) {
    err("catalog.catalogVersion must be a non-empty string");
  }
  if (typeof catalog.updatedAt !== "string" || Number.isNaN(Date.parse(catalog.updatedAt))) {
    err("catalog.updatedAt must be an ISO date string");
  }
  if (catalog.repo !== "https://github.com/piteamdev/marketplace") {
    err(`catalog.repo must be "https://github.com/piteamdev/marketplace", got ${JSON.stringify(catalog.repo)}`);
  }
  return catalog;
}

// ---------- entry validation ----------

function validateEntry(entry, section, sectionFile, index, expectedPath, globalSlugs, entryKinds) {
  const at = `${section}[${index}]`;
  if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
    err(`${at}: must be an object`);
    return null;
  }
  const { slug, name, description, category, version, contentHash, path, kind } = entry;

  if (typeof slug !== "string" || !SLUG_RE.test(slug)) {
    err(`${at}.slug must match ${SLUG_RE}, got ${JSON.stringify(slug)}`);
  }
  if (typeof name !== "string" || name.length === 0) err(`${at}.name must be a non-empty string`);
  if (typeof description !== "string" || description.length === 0) {
    err(`${at}.description must be a non-empty string`);
  }
  if (typeof category !== "string" || category.length === 0) {
    err(`${at}.category must be a non-empty string`);
  }
  if (typeof version !== "string" || !SEMVER_RE.test(version)) {
    err(`${at}.version must be MAJOR.MINOR.PATCH semver, got ${JSON.stringify(version)}`);
  }
  if (typeof contentHash !== "string" || !/^[a-f0-9]{64}$/.test(contentHash)) {
    err(`${at}.contentHash must be a 64-char lowercase sha256 hex, got ${JSON.stringify(contentHash)}`);
  }
  if (typeof path !== "string" || path.length === 0) {
    err(`${at}.path must be a non-empty string`);
  } else if (typeof slug === "string" && SLUG_RE.test(slug) && path !== expectedPath(slug)) {
    err(`${at}.path must be ${expectedPath(slug)} to match its slug, got ${path}`);
  }

  // Slug uniqueness: within the section, and (softly) globally.
  if (typeof slug === "string" && SLUG_RE.test(slug)) {
    globalSlugs.push({ slug, at });
  }

  if (entryKinds !== null && kind !== undefined) {
    if (!entryKinds.includes(kind)) err(`${at}.kind must be one of ${entryKinds.join("|")}, got ${JSON.stringify(kind)}`);
  }

  // contentHash matches the raw bytes of the file, and the file exists.
  if (typeof path === "string" && path.length > 0) {
    if (!existsSync(path)) {
      err(`${at}: definition file not found: ${path}`);
    } else if (typeof contentHash === "string" && /^[a-f0-9]{64}$/.test(contentHash) && !fixMode) {
      const actual = sha256File(path);
      if (actual !== contentHash) {
        err(`${at}: contentHash mismatch for ${path}: catalog ${contentHash} != file ${actual} (run --fix-hashes)`);
      }
    }
  }

  // Validate the definition itself.
  if (typeof path === "string" && existsSync(path)) {
    validateDefinition(section, path, slug, at);
  }

  return { path };
}

function validateDefinition(section, path, slug, at) {
  if (section === "skills") {
    const raw = readFileSync(path, "utf8");
    const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
    if (!m) {
      err(`${at}: ${path} must start with a YAML frontmatter block (--- ... ---)`);
      return;
    }
    const fm = {};
    for (const line of m[1].split(/\r?\n/)) {
      const kv = line.match(/^([A-Za-z-]+):\s*(.*)$/);
      if (kv) fm[kv[1]] = kv[2].trim();
    }
    if (fm.name !== slug) {
      err(`${at}: ${path} frontmatter name must equal the slug "${slug}", got ${JSON.stringify(fm.name)}`);
    }
    if (!fm.description) {
      err(`${at}: ${path} frontmatter must contain a description`);
    }
  } else if (section === "agents") {
    let def;
    try {
      def = JSON.parse(readFileSync(path, "utf8"));
    } catch (e) {
      err(`${at}: ${path} is not valid JSON: ${e.message}`);
      return;
    }
    if (def.name !== slug) {
      err(`${at}: ${path} name must equal the slug "${slug}", got ${JSON.stringify(def.name)}`);
    }
    if (typeof def.systemPrompt !== "string" || def.systemPrompt.length === 0) {
      err(`${at}: ${path} systemPrompt must be a non-empty string`);
    }
    for (const field of ["tools", "skills"]) {
      if (def[field] !== undefined && (!Array.isArray(def[field]) || def[field].some((t) => typeof t !== "string" || t.length === 0))) {
        err(`${at}: ${path} ${field} must be an array of non-empty strings`);
      }
    }
  } else if (section === "apps") {
    let def;
    try {
      def = JSON.parse(readFileSync(path, "utf8"));
    } catch (e) {
      err(`${at}: ${path} is not valid JSON: ${e.message}`);
      return;
    }
    for (const field of ["name", "tagline", "category", "kind"]) {
      if (typeof def[field] !== "string" || def[field].length === 0) {
        err(`${at}: ${path} ${field} must be a non-empty string`);
      }
    }
    if (def.kind === "mcp") {
      const server = def.server;
      if (server === null || typeof server !== "object" || Array.isArray(server)) {
        err(`${at}: ${path} kind "mcp" requires a server object`);
      } else {
        if (server.transport === "stdio") {
          if (typeof server.command !== "string" || server.command.length === 0) {
            err(`${at}: ${path} stdio server requires a non-empty "command"`);
          }
        } else if (server.transport === "http" || server.transport === "sse") {
          if (typeof server.url !== "string" || server.url.length === 0) {
            err(`${at}: ${path} ${server.transport} server requires a non-empty "url"`);
          }
        } else {
          err(`${at}: ${path} server.transport must be "stdio", "http" or "sse", got ${JSON.stringify(server.transport)}`);
        }
        const known = ["transport", "command", "args", "env", "cwd", "url", "headers", "tools", "exposure", "toolExposure", "description", "oauth"];
        for (const key of Object.keys(server)) {
          if (!known.includes(key)) err(`${at}: ${path} server has unknown key "${key}"`);
        }
      }
    } else if (def.kind === "treg") {
      if (def.server !== undefined) err(`${at}: ${path} kind "treg" must not define a server`);
      if (typeof def.link !== "string" || def.link.length === 0) {
        err(`${at}: ${path} kind "treg" requires a non-empty "link"`);
      }
    }
    if (def.prompts !== undefined) {
      if (!Array.isArray(def.prompts)) {
        err(`${at}: ${path} prompts must be an array`);
      } else {
        for (const [i, p] of def.prompts.entries()) {
          if (p === null || typeof p !== "object" || Array.isArray(p)
            || typeof p.id !== "string" || p.id.length === 0
            || typeof p.text !== "string" || p.text.length === 0) {
            err(`${at}: ${path} prompts[${i}] must be an object with non-empty "id" and "text"`);
          }
        }
      }
    }
    // kind consistency between catalog entry and definition is checked by the caller via entry.kind
  }
}

// ---------- orphan detection ----------

function findOrphans(dir, section, knownPaths) {
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      // skill layout: skills/<slug>/SKILL.md
      const skillFile = join(p, "SKILL.md");
      if (existsSync(skillFile) && !knownPaths.has(relative(".", skillFile))) {
        err(`orphan: ${relative(".", skillFile)} is not listed in catalog.json "${section}"`);
      }
    } else if (!knownPaths.has(relative(".", p))) {
      err(`orphan: ${relative(".", p)} is not listed in catalog.json "${section}"`);
    }
  }
}

// ---------- main ----------

const catalog = readCatalog();
let fixMode = process.argv.includes("--fix-hashes");
let fixed = false;

if (catalog) {
  const globalSlugs = [];
  const known = new Set();
  const sections = [
    ["skills", (slug) => `skills/${slug}/SKILL.md`, null],
    ["agents", (slug) => `agents/${slug}.json`, null],
    ["apps", (slug) => `apps/${slug}.json`, ["mcp", "treg"]],
  ];
  for (const [section, expectedPath, entryKinds] of sections) {
    const list = catalog[section];
    if (!Array.isArray(list)) {
      err(`catalog.${section} must be an array`);
      continue;
    }
    const seen = new Set();
    for (const [i, entry] of list.entries()) {
      const res = validateEntry(entry, section, `${section}.json`, i, expectedPath, globalSlugs, entryKinds);
      if (typeof entry?.slug === "string" && SLUG_RE.test(entry.slug)) {
        if (seen.has(entry.slug)) err(`catalog.${section}: duplicate slug "${entry.slug}"`);
        seen.add(entry.slug);
      }
      if (typeof entry?.path === "string") known.add(entry.path);
      // --fix-hashes: recompute hash for existing files
      if (fixMode && entry && typeof entry.path === "string" && existsSync(entry.path)) {
        const actual = sha256File(entry.path);
        if (entry.contentHash !== actual) {
          entry.contentHash = actual;
          fixed = true;
        }
      }
    }
  }
  const dupes = globalSlugs.filter((s, i) => globalSlugs.findIndex((t) => t.slug === s.slug) !== i);
  for (const d of dupes) err(`slug "${d.slug}" used more than once globally (${d.at})`);

  findOrphans("skills", "skills", known);
  findOrphans("agents", "agents", known);
  findOrphans("apps", "apps", known);

  if (fixMode && fixed) {
    catalog.updatedAt = new Date().toISOString();
    writeFileSync("catalog.json", JSON.stringify(catalog, null, 2) + "\n");
    console.log("catalog.json rewritten with recomputed contentHash values.");
  } else if (fixMode) {
    console.log("All contentHash values already correct; catalog.json unchanged.");
  }
}

if (errors.length > 0) {
  console.error(`Validation FAILED (${errors.length} error${errors.length > 1 ? "s" : ""}):`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
if (!fixMode || !fixed) console.log("OK: catalog.json and all definitions are valid.");
process.exit(0);
