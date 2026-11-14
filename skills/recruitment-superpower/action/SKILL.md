# Actions

Execute a known page, function or table capability with the user's application identity. When the asset is unknown, first use Semantics search and view. All three CLIs reuse the same daemon lifecycle and authorized execution path.

## Page

```sh
"${RECRUITMENT_PYTHON:-python3}" "${RECRUITMENT_SKILL_DIR:-$HOME/.agents/skills/recruitment-superpower}/action/invoke_a_page.py" recruitment/talent/list --params '{"availability":"open"}'
"${RECRUITMENT_PYTHON:-python3}" "${RECRUITMENT_SKILL_DIR:-$HOME/.agents/skills/recruitment-superpower}/action/invoke_a_page.py" recruitment/talent/list
```

Every call requires `asset_path`. The conversation connection chooses the browser tab; the explicit asset chooses the target page. The action navigates when needed, then applies parameters or reads current state. Changed parameters merge into the target's existing state if it is open; otherwise they apply to its initial state. An empty string or null clears a filter. Read results contain target asset, view, actual parameters and loaded state. The page metadata's `params` names are flat keys in `--params`. Page indexes list their tab assets; view the appropriate file, then invoke its explicit asset path. An optional `view` selects a listed tab when invoking its parent page.

To execute an operation, put its name in the **`action` key inside `--params`**. It is neither a CLI option nor a view name. A create/edit draft uses `"action":"save"`:

```sh
"${RECRUITMENT_PYTHON:-python3}" "${RECRUITMENT_SKILL_DIR:-$HOME/.agents/skills/recruitment-superpower}/action/invoke_a_page.py" recruitment/talent/create --params '{"name":"Example Candidate","phoneE164":"+15555550101","resume":{"summary":"Relevant recruiting summary"},"tags":["Referral"],"action":"save"}'
```

This creates one Talent and returns its identifier. Without `action`, the same request only fills the visible draft. To inspect before execution, add `"submit":false`; later send `{"action":"save"}` to the same explicit asset. An operation such as `record_test` uses `"action":"record_test"` with the fields declared by that operation. Read the detail page after a mutation; never infer persistence from a draft response.

Page `actions` are operations, not views. Supply action fields as flat keys. Omitted parameters retain current values; nested object patches retain omitted fields, while arrays replace the complete array. Actions execute by default. To open/fill an action's visible form without saving, pass `submit: false`, inspect the returned `state.values` and current `state.options`, then invoke the same action to submit. Fields declaring `source` use those loaded value/label choices; submit the stable value. `requires` lists values that must be present before execution. Filling a create/edit page without an action only changes its draft; its `save` action persists it.

`phase: observed` describes actual page/draft state and optional `feedback`. `phase: executed` contains `result`, never a before-action state. Invoke the target page again to read persistence. Save actions may navigate as the same human button does. If the original tab is disconnected, reconnect it before retrying; another tab is never selected automatically.

## Function

```sh
"${RECRUITMENT_PYTHON:-python3}" "${RECRUITMENT_SKILL_DIR:-$HOME/.agents/skills/recruitment-superpower}/action/call_a_function.py" recruitment/api/jobs/list --params '{"status":"open"}'
```

Supply the function asset and a JSON object matching its input schema. Semantics resolves method, URL and parameter locations; the daemon injects authorization and executes the HTTP request. The function description and `effect` explain whether it reads or changes data. The returned dictionary contains `ok`, HTTP `status` and `data`.

## SQL

```sh
"${RECRUITMENT_PYTHON:-python3}" "${RECRUITMENT_SKILL_DIR:-$HOME/.agents/skills/recruitment-superpower}/action/run_sql.py" 'SELECT name, location FROM "recruitment/tables/talent" LIMIT 10'
```

Use quoted table asset paths discovered through Semantics. Supply one SELECT query against one data source. Semantics parses and resolves table objects; the application SQL API enforces exposed objects, allowed functions, a read-only transaction, timeout and row limit. Results contain `data.rows`, `data.rowCount` and `data.truncated`. Narrow a truncated query. Errors are not successful empty results.

## Python use

Import `invoke(asset_path, params=None)`, `call(asset_path, params=None)` or `run(sql)` from the corresponding scripts. Each returns the same structured dictionary synchronously. Requests share automatic startup and authentication. After an interrupted write request, inspect the business result before deciding whether to repeat it.
