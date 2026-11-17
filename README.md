# piteamdev/marketplace

Public marketplace catalog of definitions for [piteam](https://github.com/piteamdev): skills, agents and apps.

## Layout

```
catalog.json             # the catalog: schemaVersion 1, one entry per definition
skills/<slug>/SKILL.md   # skill definitions (YAML frontmatter: name == slug, description)
agents/<slug>.json       # agent definitions
apps/<slug>.json         # app definitions (kind: "mcp" | "treg")
validate.mjs             # contract validator (plain Node >= 22, no dependencies)
```

## Catalog contract

`catalog.json` is a JSON object:

- `schemaVersion`: `1`
- `catalogVersion`: catalog-level version string (e.g. `"v1"`)
- `updatedAt`: ISO timestamp of the last change
- `repo`: `https://github.com/piteamdev/marketplace`
- `skills` / `agents` / `apps`: arrays of entries

Each entry has: `slug` (`^[a-z0-9][a-z0-9-]*$`, unique in its section and globally), `name`, `description`, `category`, `version` (semver `MAJOR.MINOR.PATCH`), `contentHash` (sha256 hex of the **raw bytes** of the definition file), `path` (relative path matching the slug: `skills/<slug>/SKILL.md`, `agents/<slug>.json`, `apps/<slug>.json`). App entries additionally carry `kind` (`"mcp"` or `"treg"`).

piteam compares each entry by `version` + `contentHash` to decide whether an installed item is `installed` or `update`. The hash is what makes updates deterministic — version alone is advisory.

## Adding a definition

1. Create the file (`skills/<slug>/SKILL.md`, `agents/<slug>.json` or `apps/<slug>.json`), keeping its shape consistent with existing entries.
2. Add a catalog entry with a bumped/initial `version`.
3. Run `npm run fix-hashes` to compute the `contentHash`, then `npm run validate` — it must exit 0.

## Changing a definition

Changing content means a new version: **bump `version`**, run `npm run fix-hashes`, run `npm run validate`, update `updatedAt`, commit and push. piteam will then show the item as an update for anyone who has an older version installed.

## Validation

```
npm run validate      # check the whole contract; exit 1 with an error list on failure
npm run fix-hashes    # recompute contentHash values in catalog.json (author convenience)
```

The validator checks catalog shape and types, slug/version/hash formats, slug uniqueness, path↔slug consistency, that definition files exist, recomputed hashes, definition-level rules (skill frontmatter, agent fields, app kind/server/prompts), and orphan files not listed in the catalog.

CI runs `npm run validate` on every push and PR (`.github/workflows/validate.yml`).

## License

MIT — see [LICENSE](LICENSE).
