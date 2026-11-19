# Actions

Execute a known page, function or table capability with the user's application identity. When the asset is unknown, first use Semantics search and view. These CLIs reuse the same daemon lifecycle and authorized execution path.

## Page

Apply the parent page's business-state rules before following a write-form link. When the user has supplied the relevant state and the known contract rules out the change, explain that limit without opening a draft or trying a save. A rejected call is not the way to verify a rule already known. Read the actual record only when a missing fact can change that decision; do not substitute another mutation for the requested one.

```sh
"${RECRUITMENT_PYTHON:-python3}" "${RECRUITMENT_SKILL_DIR:-$HOME/.agents/skills/recruitment-superpower}/action/invoke_a_page.py" recruitment/talent/list --params '{"availability":"open"}'
"${RECRUITMENT_PYTHON:-python3}" "${RECRUITMENT_SKILL_DIR:-$HOME/.agents/skills/recruitment-superpower}/action/get_page_state.py" recruitment/talent/list
```

Every call requires `asset_path`. The conversation connection chooses the browser tab; the explicit asset chooses the target page. `get_page_state.py ASSET_PATH` reads that page only if it is currently open. It accepts no page field parameters: use its visible section, actual record, filters and draft without supplying them as inputs. A read never navigates, fills or saves, and returns `PAGE_NOT_ACTIVE` for a closed target. Use `invoke_a_page.py ASSET_PATH --open` to explicitly open a target without filling fields; use `invoke_a_page.py ASSET_PATH --params ...` with a nonempty patch to open/apply fields. Invoke without either is rejected; it does not read or open implicitly. Changed parameters merge into the target's existing state if it is open; otherwise they apply to its initial state. An empty string or null clears a filter. Read results contain target asset, actual section, observed parameters and loaded state. The page metadata's `params` names are flat keys in `--params`. Use `section` inside params, or `--section test`, to select the displayed part of a page. Both forms send the same page parameter; conflicting values are rejected. Sections have no separate asset paths. Follow the metadata form links to open/fill a writable form page.

To execute an operation, put its name in the **`action` key inside `--params`**. It is neither a CLI option nor a view name. A create/edit draft uses `"action":"save"`:

```sh
"${RECRUITMENT_PYTHON:-python3}" "${RECRUITMENT_SKILL_DIR:-$HOME/.agents/skills/recruitment-superpower}/action/invoke_a_page.py" recruitment/talent/create --params '{"name":"Example Candidate","phoneE164":"+15555550101","resume":{"summary":"Relevant recruiting summary"},"tags":["Referral"],"action":"save"}'
```

This creates one Talent and returns its identifier. Without `action`, the same request only fills the visible draft. To inspect before execution, add `"submit":false`; later send `{"action":"save"}` to the same explicit asset. A form such as `record_test` is a separately addressed page linked from its parent; use that form's declared `save` action. Reopen a page that exposes the saved fields after a mutation; never infer persistence from a draft response.

Named `actions` are explicit operations on the page. Supply their name in the flat `action` parameter. To use a writable form, follow its declared asset path: parameters fill the visible draft without saving, and `action: save` persists it. Read the draft first only when inspection is needed. Nested object patches retain omitted values; arrays replace the whole array. Resolve form choices when a supplied label still needs an assignable value; reuse an already-established value without a second lookup. Dynamic `choices` instructions tell you how to open/fill the declared form when needed, then use `get_page_state.py` for its current loaded options and which value to assign. `requires` lists values needed before the declared operation can execute.

`phase: observed` describes actual page/draft state and optional `feedback`. `phase: executed` contains `result`, never a before-action state. Use `get_page_state.py` if the target remains open; otherwise reopen the relevant editor through invoke to read persisted fields. Save actions may navigate as the same human button does. If the original tab is disconnected, reconnect it before retrying; another tab is never selected automatically.

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

Use quoted table asset paths discovered through Semantics. Supply only one SQL string. CLI stdout is a SQL table with column headings and a row-count footer; failures print a concise error to stderr and exit nonzero. No HTTP envelopes, asset lists or lifecycle logs are printed to stdout. A truncated table is explicitly marked on stderr and exits with status 2; it is not a complete result.

Semantics selects one authorized data source and sends the original semantic SQL. The authenticated executor independently resolves its canonical asset catalog, projects declared columns, applies credential asset grants and database row policies, and executes as a restricted read-only role. Physical relation names, writes and unsafe functions are rejected. JOINs, nonrecursive CTEs, subqueries, aggregates and window functions use the same path. A scalar SELECT uses the sole authorized data source. The service currently caps results at 200 rows and execution at five seconds; filter or aggregate in SQL.

For Python analysis, install `requirements-analysis.txt` into the interpreter used by the calling program, add the registered Skill entry to `sys.path`, and import `from action.run_sql import run_sql`. `run_sql(sql)` (also named `run(sql)`) returns a pandas DataFrame directly. Empty results retain column names and dtypes; duplicate column names retain each value; nullable integers, exact Decimal values and timestamps retain their meaning. Errors and truncated results raise `SqlError`, never an empty or silently partial DataFrame. SQL types are available in `df.attrs["sql_types"]`. Terminal commands do not require pandas.

Inside the embedded chat, successful SQL requests, explicit `--open` page calls and page calls with nonempty parameters also print an XML `display_to_user` record. `get_page_state.py` returns current state without a display record or card. A read reply's complete `params` does not make it a display action. Keep actual script output intact; capture enough tool output for the complete record. The chat renders it as a page shortcut or query-result table, including when reading session history. Keep the normal business reply and terminal results; do not hand-author successful display records in the answer or rerun SQL just to expand a result.

## Python use

Import `get_page_state(asset_path)` from `action.get_page_state` for reads; import `invoke(asset_path, params=None, open_page=True)` for opening or `invoke(asset_path, params={...})` for changes, `call(asset_path, params=None)` or `run(sql)` from the corresponding scripts. Page and Function return structured dictionaries synchronously; SQL returns a pandas DataFrame. Requests share automatic startup and authentication. After an interrupted write request, inspect the business result before deciding whether to repeat it.
