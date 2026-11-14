---
name: recruitment-superpower
description: Complete recruiting tasks by exploring authorized page, API and table assets with search/view, then invoking pages, calling functions or querying SQL through the local runtime.
---

Use the recruiting application's data assets to complete the user's request and report actual results. Every CLI ensures the local runtime is available and requests application authorization when needed. Read modules and run scripts through the registered entry `${RECRUITMENT_SKILL_DIR:-$HOME/.agents/skills/recruitment-superpower}`, using `${RECRUITMENT_PYTHON:-python3}`. Keep that entry in commands; never resolve its link or substitute a version-store path from earlier history.

## Happy path

**Find an appropriate asset, then act.** Search for the required recruiting capability, view the matching definition, and choose its action: page → invoke; function → call; table → SQL query.

```sh
"${RECRUITMENT_PYTHON:-python3}" "${RECRUITMENT_SKILL_DIR:-$HOME/.agents/skills/recruitment-superpower}/semantics/search_semantics_assets.py" 'Talent'
"${RECRUITMENT_PYTHON:-python3}" "${RECRUITMENT_SKILL_DIR:-$HOME/.agents/skills/recruitment-superpower}/semantics/view_semantics_asset.py" recruitment/talent/list
"${RECRUITMENT_PYTHON:-python3}" "${RECRUITMENT_SKILL_DIR:-$HOME/.agents/skills/recruitment-superpower}/action/invoke_a_page.py" recruitment/talent/list --params '{"location":"London, UK","availability":"open"}'
```

Search and view read the live Semantics service with the user's permissions. View describes parameter names, types and result shapes. Asset identity is its directory path. Each real page has its own asset, such as `recruitment/talent/list` or `recruitment/jobs/detail`. A page with tabs lists separate metadata assets for its views; follow the appropriate asset and invoke that explicit path.

**The target asset is already identified.** Execute its action directly. Page actions always require an explicit asset path and run in the browser tab owning this conversation; they can navigate to a different asset. Omit `--params` to read the target page's actual state.

```sh
"${RECRUITMENT_PYTHON:-python3}" "${RECRUITMENT_SKILL_DIR:-$HOME/.agents/skills/recruitment-superpower}/action/invoke_a_page.py" recruitment/jobs/list --params '{"status":"open"}'
"${RECRUITMENT_PYTHON:-python3}" "${RECRUITMENT_SKILL_DIR:-$HOME/.agents/skills/recruitment-superpower}/action/call_a_function.py" recruitment/api/talent/list --params '{"location":"London, UK"}'
"${RECRUITMENT_PYTHON:-python3}" "${RECRUITMENT_SKILL_DIR:-$HOME/.agents/skills/recruitment-superpower}/action/run_sql.py" 'SELECT count(*) FROM "recruitment/tables/talent"'
```

For "the current page", use its asset from the conversation or read `"$ATS_PAGE_BRIDGE/context.json"`; still pass the asset explicitly. This context records page identity, view and an optional `editor` action when the user sent the message. If an editor is active, read its draft by passing that action with `submit: false`. Get live page state through the action. A null asset means that displayed page is not exposed for actions.

Use [Semantics](semantics/SKILL.md) for discovery and [Actions](action/SKILL.md) for page/API/SQL calls. Python callers can import `invoke`, `call` or `run` from the corresponding scripts and use the returned dictionary directly.

For a named page operation, put its name in the **`action` key inside `--params`**. For example, `--params '{"action":"save"}'` saves the current create/edit draft. Include changed fields in that same JSON object to fill and save in one operation. Add `"submit":false` only when you intend to inspect a draft before saving; it does not persist anything. After saving, use the returned business identifier to reopen the relevant detail page and verify the requested fields.

## Prerequisite check

The runtime automatically starts or installs a missing daemon. The first authorized operation may open the application's sign-in/connect page; complete authorization there. The daemon retains application credentials in its private SQLite database. Token refresh, Semantics access and business requests are handled by the daemon.

Inside ATS, the runtime supplies the installed Skill path, Python interpreter and per-conversation channel. See [Setup](setup/SKILL.md) for installation, status, update, restart and recovery when the operating system or network prevents automatic startup.

## Other outcomes

`ok: false` is a failed operation. Read replies have `phase: observed` and actual `state`; executed actions have `phase: executed` and their persisted `result`. Read again to observe saved data. API/SQL results contain HTTP status and returned data. An unknown asset, invalid parameter or missing permission is an error. After a page timeout, read the explicit target's state before retrying. Keep the user's requested scope when choosing mutations; read each function's description and declared effect.
