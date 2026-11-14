# Semantics

Inspect the authorized live catalog through the local runtime. For ordinary recruiting pages, choose the Talent/Application workflow from the root Skill's page map. Search is needed only when the target capability cannot be identified from that map or a directory listing.

## View a catalog or contract

```sh
"${RECRUITMENT_PYTHON:-python3}" "${RECRUITMENT_SKILL_DIR:-$HOME/.agents/skills/recruitment-superpower}/semantics/view_semantics_asset.py" recruitment --type page
"${RECRUITMENT_PYTHON:-python3}" "${RECRUITMENT_SKILL_DIR:-$HOME/.agents/skills/recruitment-superpower}/semantics/view_semantics_asset.py" recruitment/talent/detail
"${RECRUITMENT_PYTHON:-python3}" "${RECRUITMENT_SKILL_DIR:-$HOME/.agents/skills/recruitment-superpower}/semantics/view_semantics_asset.py" recruitment/talent/detail/test
```

A directory returns `entities`: asset identity, type, description and compact tab references for pages. `--type page|view|function|table` filters its entries. Page indexes list tab `semantic_ref` values and descriptions. A child view returns `type: view`, its `semantic_ref`, a compact `parent`, and its own `view` definition containing parameters, observations and actions. Use the exact `semantic_ref` as the invoke target; no parent fetch is needed merely to obtain its address. API and table directories are `recruitment/api` and `recruitment/tables`.

`--show summary` is the default consumer contract. `--show full` reads the complete authoritative metadata, including invocation declarations, when diagnosing a binding. `--show columns` reads table columns. The default output is YAML; `--format json` is available for programs. Python `view(asset_path, show='summary', type_=None)` returns a dictionary without printing.

## Search an unfamiliar capability

```sh
"${RECRUITMENT_PYTHON:-python3}" "${RECRUITMENT_SKILL_DIR:-$HOME/.agents/skills/recruitment-superpower}/semantics/search_semantics_assets.py" 'interview scheduling' --type view --mode keyword
```

Search returns `query`, effective `mode`, `count` and `results`. Each result contains its type, identity, description and score; a view's `semantic_ref` identifies that tab directly. `--type` selects page, view, function, table or column (`--kind` remains an alias). `--mode keyword|hybrid|vector` selects retrieval mode; unavailable embeddings are reported as keyword mode. Inspect the matching definition, then act. Do not load every sibling tab or infer an API endpoint.

Discovery reads the live independent service, never a packaged catalog snapshot. Every command shares daemon startup and application authorization; [Setup](../setup/SKILL.md) covers manual recovery.
