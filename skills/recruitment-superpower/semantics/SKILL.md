# Semantics

Find authorized recruiting capabilities and understand their inputs and results. Discovery always uses the local runtime and the independent Semantics service; it does not read a bundled metadata snapshot.

```sh
"${RECRUITMENT_PYTHON:-python3}" "${RECRUITMENT_SKILL_DIR:-$HOME/.agents/skills/recruitment-superpower}/semantics/search_semantics_assets.py" 'candidate' --kind page
"${RECRUITMENT_PYTHON:-python3}" "${RECRUITMENT_SKILL_DIR:-$HOME/.agents/skills/recruitment-superpower}/semantics/view_semantics_asset.py" recruitment
"${RECRUITMENT_PYTHON:-python3}" "${RECRUITMENT_SKILL_DIR:-$HOME/.agents/skills/recruitment-superpower}/semantics/view_semantics_asset.py" recruitment/talent/detail/resume
```

Search returns asset paths, matching child references, names and descriptions. `--kind` optionally selects page, view, function, table or column. `--mode keyword|hybrid|vector` selects retrieval mode; the response reports the effective mode when vectors are unavailable. View reads an asset, a directory, or a `#view/column` reference. A page index references separate tab metadata assets. Each view file describes only its own parameters, observations and actions. Follow an asset reference before acting; do not load every tab or infer an endpoint.

Choose an action using the asset type. When the target is already identified, invoke it directly with its explicit path. Runtime startup and application authorization are automatic for both commands; [Setup](../setup/SKILL.md) owns manual recovery.
