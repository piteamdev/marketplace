#!/usr/bin/env node
// Migration: port the OpenBot marketplace content into this repo's contract (user-ordered, 2026-11-17).
// Sources (read-only): the OpenBot checkout under OPENBOT_SRC (default /home/artur/projects/piteam/tmp/openbot/marketplace).
//   - production-catalog/catalog.json + skills/<slug>/SKILL.md   (40 skills, 27 agents; agent instructions live in `description`)
//   - plugin-catalog/plugins/<slug>/plugin.json                  (254 apps; server.transport stdio|http)
// Output: skills/ agents/ apps/ + regenerated catalog.json (catalogVersion bumped to v2). Idempotent:
// running again reproduces the same files; the repo's own seed entries are never overwritten.
// Usage: node scripts/migrate-from-openbot.mjs [--dry]

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const REPO = resolve(import.meta.dirname, "..");
const OPENBOT = resolve(process.env.OPENBOT_SRC ?? "/home/artur/projects/piteam/tmp/openbot/marketplace");
const DRY = process.argv.includes("--dry");
const NOW = "2026-11-17T00:00:00.000Z"; // fixed for deterministic re-runs; bump on re-migration
const MIGRATION_NOTE = "Initial import from the OpenBot marketplace catalog (user-ordered migration, 2026-11-17). See LICENSES.md.";
/** The repo's own (hand-written) seed entries — an OpenBot entry with the same slug never overwrites these. */
const OWN = { skills: new Set(["code-review"]), agents: new Set(["code-reviewer"]), apps: new Set(["context7"]) };

const sha256 = (p) => createHash("sha256").update(readFileSync(p)).digest("hex");
const readJson = (p) => JSON.parse(readFileSync(p, "utf8"));
const slugOf = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
const out = { skills: [], agents: [], apps: [], skipped: [] };

// ---------- skills ----------
const prodCatalog = readJson(join(OPENBOT, "production-catalog", "catalog.json"));
for (const s of prodCatalog.skills ?? []) {
  const src = join(OPENBOT, "production-catalog", "skills", s.slug, "SKILL.md");
  if (!existsSync(src)) { out.skipped.push(`skills/${s.slug} (no SKILL.md upstream)`); continue; }
  if (OWN.skills.has(s.slug)) { out.skipped.push(`skills/${s.slug} (own seed entry kept)`); continue; }
  let md = readFileSync(src, "utf8");
  // The validator requires frontmatter name === slug; upstream uses the display name.
  md = md.replace(/^(---\r?\nname:\s*).*(\r?\n)/m, `$1${s.slug}$2`); // unquoted slug (validator: name === slug)
  if (!DRY) { mkdirSync(join(REPO, "skills", s.slug), { recursive: true }); writeFileSync(join(REPO, "skills", s.slug, "SKILL.md"), md); }
  const path = `skills/${s.slug}/SKILL.md`;
  out.skills.push({
    slug: s.slug, name: s.slug, description: md.match(/^description:\s*"?(.*?)"?\r?$/m)?.[1] ?? s.slug,
    category: s.category ?? "other", version: "1.0.0", contentHash: sha256(DRY ? src : join(REPO, path)), path,
    changelog: [{ version: "1.0.0", date: NOW.slice(0, 10), notes: MIGRATION_NOTE }],
  });
}

// ---------- agents ----------
for (const a of prodCatalog.agents ?? []) {
  if (OWN.agents.has(a.slug)) { out.skipped.push(`agents/${a.slug} (own seed entry kept)`); continue; }
  const def = {
    name: a.slug,
    description: a.title ?? a.name ?? a.slug,
    systemPrompt: a.description ?? "",
    ...(Array.isArray(a.skills) && a.skills.length ? { skills: a.skills } : {}),
    category: a.category ?? "other",
  };
  if (!def.systemPrompt) { out.skipped.push(`agents/${a.slug} (no instructions upstream)`); continue; }
  const path = `agents/${a.slug}.json`;
  if (!DRY) writeFileSync(join(REPO, path), JSON.stringify(def, null, 2) + "\n");
  out.agents.push({
    slug: a.slug, name: a.slug, description: def.description, category: def.category,
    version: "1.0.0", contentHash: DRY ? "" : sha256(join(REPO, path)), path,
    changelog: [{ version: "1.0.0", date: NOW.slice(0, 10), notes: MIGRATION_NOTE }],
  });
}

// ---------- apps (plugin catalog) ----------
const pluginsDir = join(OPENBOT, "plugin-catalog", "plugins");
for (const dir of existsSync(pluginsDir) ? readdirSync(pluginsDir).sort() : []) {
  const pj = join(pluginsDir, dir, "plugin.json");
  if (!existsSync(pj)) continue;
  const p = readJson(pj);
  const slug = slugOf(p.slug ?? dir);
  if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) { out.skipped.push(`apps/${slug} (slug unmappable from "${dir}")`); continue; }
  if (OWN.apps.has(slug)) { out.skipped.push(`apps/${slug} (own seed entry kept)`); continue; }
  const srv = p.apps?.[0]?.server;
  let kind, server, link = p.websiteUrl ?? undefined;
  if (srv && (srv.transport === "stdio" || srv.command)) {
    kind = "mcp";
    server = { transport: "stdio", command: srv.command, ...(Array.isArray(srv.args) ? { args: srv.args } : {}) };
  } else if (srv && srv.url) {
    kind = "mcp";
    server = { transport: srv.transport === "sse" ? "sse" : "http", url: srv.url };
  } else {
    kind = "treg";
    if (!link) { out.skipped.push(`apps/${slug} (no server and no websiteUrl)`); continue; }
  }
  const def = {
    name: p.name ?? slug, tagline: p.tagline ?? "", category: p.category ?? "other", kind,
    ...(server ? { server } : { link }),
    ...(Array.isArray(p.auth) && p.auth.length ? { auth: p.auth } : {}), // connection prerequisites (informational; not part of the server config)
    ...(Array.isArray(p.prompts) && p.prompts.length ? { prompts: p.prompts.filter(x => x?.id && x?.text) } : {}),
    ...(p.iconUrl ? { iconUrl: p.iconUrl } : {}),
    ...(p.creatorName ? { creatorName: p.creatorName } : {}),
    ...(p.description ? { description: p.description } : {}),
  };
  const path = `apps/${slug}.json`;
  if (!DRY) writeFileSync(join(REPO, path), JSON.stringify(def, null, 2) + "\n");
  const version = typeof p.version === "string" && /^\d+\.\d+\.\d+$/.test(p.version) ? p.version : "1.0.0";
  out.apps.push({
    slug, name: def.name, description: p.tagline ?? p.name ?? slug, category: def.category,
    version,
    contentHash: DRY ? "" : sha256(join(REPO, path)), path, kind,
    changelog: [{ version, date: NOW.slice(0, 10), notes: MIGRATION_NOTE }],
  });
}

// ---------- catalog ----------
if (DRY) {
  console.log(`dry: skills=${out.skills.length} agents=${out.agents.length} apps=${out.apps.length} skipped=${out.skipped.length}`);
  console.log(out.skipped.slice(0, 10).join("\n"));
  process.exit(0);
}
const catalogPath = join(REPO, "catalog.json");
const existing = readJson(catalogPath);
const bySlug = (list) => new Map(list.map(e => [e.slug, e]));
const merge = (oldList, newList) => {
  const fresh = bySlug(newList);
  // migrated entries win (they carry the recomputed hashes); only slugs the migration does not
  // produce survive from the old catalog — that is exactly the repo's own hand-written seeds.
  return [...oldList.filter(e => !fresh.has(e.slug)), ...newList];
};
const catalog = {
  schemaVersion: 1,
  catalogVersion: "v2",
  updatedAt: NOW,
  repo: "https://github.com/piteamdev/marketplace",
  skills: merge(existing.skills, out.skills),
  agents: merge(existing.agents, out.agents),
  apps: merge(existing.apps, out.apps),
};
writeFileSync(catalogPath, JSON.stringify(catalog, null, 2) + "\n");
console.log(`migrated: skills=${out.skills.length} agents=${out.agents.length} apps=${out.apps.length} skipped=${out.skipped.length}`);
if (out.skipped.length) console.log("skipped:\n  " + out.skipped.join("\n  "));
