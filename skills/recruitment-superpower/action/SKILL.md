# Actions

Execute a known page, function or table capability with the user's application identity. When the asset is unknown, first use Semantics search and view. All three CLIs reuse the same daemon lifecycle and authorized execution path.

## Page

Apply the parent page's business-state rules before following a write-form link. When the user has supplied the relevant state and the known contract rules out the change, explain that limit without opening a draft or trying a save. A rejected call is not the way to verify a rule already known. Read the actual record only when a missing fact can change that decision; do not substitute another mutation for the requested one.

```sh
"${RECRUITMENT_PYTHON:-python3}" "${RECRUITMENT_SKILL_DIR:-$HOME/.agents/skills/recruitment-superpower}/action/invoke_a_page.py" recruitment/talent/list --params '{"availability":"open"}'
"${RECRUITMENT_PYTHON:-python3}" "${RECRUITMENT_SKILL_DIR:-$HOME/.agents/skills/recruitment-superpower}/action/invoke_a_page.py" recruitment/talent/list
```

Every call requires `asset_path`. The conversation connection chooses the browser tab; the explicit asset chooses the target page. The action navigates when needed, then applies parameters or reads current state. Changed parameters merge into the target's existing state if it is open; otherwise they apply to its initial state. An empty string or null clears a filter. Read results contain target asset, section, actual parameters and loaded state. The page metadata's `params` names are flat keys in `--params`. Use `section` inside params, or `--section test`, to select the displayed part of a page. Both forms send the same page parameter; conflicting values are rejected. Sections have no separate asset paths. Follow the metadata form links to open/fill a writable form page.

To execute an operation, put its name in the **`action` key inside `--params`**. It is neither a CLI option nor a view name. A create/edit draft uses `"action":"save"`:

```sh
"${RECRUITMENT_PYTHON:-python3}" "${RECRUITMENT_SKILL_DIR:-$HOME/.agents/skills/recruitment-superpower}/action/invoke_a_page.py" recruitment/talent/create --params '{"name":"Example Candidate","phoneE164":"+15555550101","resume":{"summary":"Relevant recruiting summary"},"tags":["Referral"],"action":"save"}'
```

This creates one Talent and returns its identifier. Without `action`, the same request only fills the visible draft. To inspect before execution, add `"submit":false`; later send `{"action":"save"}` to the same explicit asset. A form such as `record_test` is a separately addressed page linked from its parent; use that form's declared `save` action. Reopen a page that exposes the saved fields after a mutation; never infer persistence from a draft response.

Named `actions` are explicit operations on the page. Supply their name in the flat `action` parameter. To use a writable form, follow its declared asset path: parameters fill the visible draft without saving, and `action: save` persists it. Read the draft first only when inspection is needed. Nested object patches retain omitted values; arrays replace the whole array. Resolve form choices when a supplied label still needs an assignable value; reuse an already-established value without a second lookup. Dynamic `choices` instructions tell you how to read the same page's loaded options with invoke and which value to assign. `requires` lists values needed before the declared operation can execute.

`phase: observed` describes actual page/draft state and optional `feedback`. `phase: executed` contains `result`, never a before-action state. Invoke the target page again to read persistence. Save actions may navigate as the same human button does. If the original tab is disconnected, reconnect it before retrying; another tab is never selected automatically.

Reuse a current observation instead of reading the same state twice. A filter-change reply already contains the loaded rows for those filters; another identical read is useful only when it resolves uncertainty. On create/edit pages, read original values directly there. When a named action has all required fields and known choices, submit them together instead of opening and rereading a preview. For an additional activity, explicitly use the metadata's create value for its record identifier; a populated current editor may otherwise refer to an existing record.

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
