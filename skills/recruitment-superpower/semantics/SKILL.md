# Semantics

Use the root Skill's Talent/Application page map for ordinary recruiting work. Inspect the authorized live contract through the local runtime; search is fallback discovery.

## View pages and their sections

```sh
"${RECRUITMENT_PYTHON:-python3}" "${RECRUITMENT_SKILL_DIR:-$HOME/.agents/skills/recruitment-superpower}/semantics/view_semantics_asset.py" recruitment --type page
"${RECRUITMENT_PYTHON:-python3}" "${RECRUITMENT_SKILL_DIR:-$HOME/.agents/skills/recruitment-superpower}/semantics/view_semantics_asset.py" recruitment/applications/detail --section test
```

A directory returns `entities`: page addresses and descriptions, with their sections and form links. A section is a parameter of its owning page, not a separately addressed asset. Talent detail has Resume and Notes. Application detail has Resume and its recruiting activities. `--section` narrows the metadata returned for inspection; when operating the page, put `section` inside invoke's `--params`.

Choose the smallest definition needed for the task. A page summary already contains its sections: reuse those definitions if they were returned earlier. Do not fetch that page and its selected section in parallel, or fetch the section again merely to confirm the same metadata. Linked forms have their own contracts and still need inspection before use. Re-read when a response was truncated, a required field is missing, or an actual version/contract change requires it.

Page input descriptions explain how to supply values. `returns` maps actual result paths to their business meanings, without output types or JSON Schema wrappers. The actual invoke reply remains the source of truth. `items[].education[].school`, for example, means each displayed candidate's schools. IDs are navigation/edit locators only where needed.

When a parameter has dynamic choices, its `choices` instruction tells you to invoke that page without saving and read the specified `state.options` collection. Each entry has a displayed label and an assignable value. Use the same page/record identity when retrieving choices and filling them; a bare browser-state path is not a data-source API.

Follow `forms[].asset_path` to inspect and open a writable form. Fill it without `action` to inspect a draft; add `action: save` to persist. Inline operations such as changing the current stage remain named page actions.

`--show full` reads the whole authoritative metadata file, including invocation bindings, for diagnostics. Output defaults to YAML; `--format json` is optional for programs. Python `view(asset_path, show='summary', type_=None, section=None)` returns a dictionary. No catalog snapshot is bundled in the Skill.

## Search an unfamiliar capability

```sh
"${RECRUITMENT_PYTHON:-python3}" "${RECRUITMENT_SKILL_DIR:-$HOME/.agents/skills/recruitment-superpower}/semantics/search_semantics_assets.py" 'interview scheduling' --type page --mode keyword
```

Search returns addresses, types, descriptions and scores. Inspect the matching page/API/table before acting. Setup and authorization are automatic; [Setup](../setup/SKILL.md) covers recovery.

When no operation fits, use the relevant authorized catalog to decide what is exposed; do not treat a search result as exhaustive. Continue discovery only to answer a concrete remaining gap, not to repeat near-identical queries. State which capability is not exposed in the inspected scope. A failed request, an inaccessible asset, an empty catalog and zero search matches are different observations; preserve the actual distinction.
