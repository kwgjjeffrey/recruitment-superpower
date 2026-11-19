# Import a personal table

Use this for a local data file the user wants to upload to ATS. Inspect and, if necessary, reshape a copy first. The table uses the user-defined name inside its owner's dedicated `u_<immutable user ID>` PostgreSQL schema; its complete semantic definition is registered automatically at `users/<authenticated-user-id>/tables/<name>`. Both survive service releases. The server determines ownership; no deployment, database access or owner parameter is needed. Only the owner can discover, query or append today.

```sh
"${RECRUITMENT_PYTHON:-python3}" "${RECRUITMENT_SKILL_DIR:-$HOME/.agents/skills/recruitment-superpower}/builder/table/import_table.py" inspect /absolute/path/data.csv
"${RECRUITMENT_PYTHON:-python3}" "${RECRUITMENT_SKILL_DIR:-$HOME/.agents/skills/recruitment-superpower}/builder/table/import_table.py" upload /absolute/path/data.csv --name my_source --description "Purpose of this data"
```

For a directory source, select the relevant files and prepare a supported local input while preserving the originals. CSV/TSV, XLSX and JSON are supported. XLSX requires `builder/table/requirements-import.txt` in the selected Python environment; use an existing environment or install those dependencies there. Inspection reports worksheet names and the selected sheet; select the intended one with `--sheet "Sheet name"`. CSV defaults to UTF-8 with BOM support; use `--encoding` or convert a copy for other encodings. Empty cells become NULL. Leading-zero identifiers remain text; integers and decimals are sent as exact strings. Automatic inference chooses text, boolean, bigint or numeric. Dates, UUIDs, JSON and domain-specific formats can use an explicit schema.

`--schema /path/schema.json` accepts an array of `{name,type,description?,nullable?}` or `{ "columns": [...] }`, one column per source field in source order. Types: text, integer, bigint, numeric, boolean, uuid, date, timestamptz, jsonb. SQL names must be lowercase letters, digits and underscores, starting with a letter. Name normalization preserves the original header in each column's description. For unstructured/nested JSON, ambiguous headers, currency strings, date/time zone meaning or mixed-type cells, transform a local copy with ordinary data tools and inspect it again. Preserve the original and explain any material interpretation instead of silently dropping rows or fields.

The scaffold scans and validates before writing, begins a job through `recruitment/api/user-tables/import-begin`, sends sequential bounded batches through `import-batch`, then calls `import-complete`. The server atomically stores each batch with its index and content hash. Identical replays return the original receipt; different data for the same batch is rejected. A partial import is not exposed to SQL consumers. Completion validates the expected count and registers the full semantic definition with source file provenance.

A private local receipt records the import key, file hash, definition, table and acknowledged progress. `--receipt /path/receipt.json` selects its location; otherwise it lives in the user's runtime data directory. Retry an interrupted run with the same file, schema and --receipt. Both beginning and completion are idempotent, including pending semantic registration. Do not change source bytes or schema during a retry. A legacy receipt from the former non-idempotent append flow must be inspected manually; it is not silently converted. `import-cancel` can discard an owned unfinished job so an invalid schema can be corrected; it cannot delete a ready table.

After success, use the returned semantic asset path in `run_sql` to verify the row count and sample data. Report the path, imported count and returned Semantics link. The browser Data tab uses the same SQL API. Sharing an asset definition does not share its data access.

## Create from a reference schema or without a file

Read the selected semantic table's columns using `semantics/view_semantics_asset.py <asset path>`. Translate the user's intended changes into an explicit `columns` array; the reference is a starting structure, not permission to copy its rows. For a file import, write the reviewed columns to a local schema JSON and pass `--schema /absolute/path/schema.json` to both `inspect` and `upload`.

Without source data, create the empty typed table directly:

```sh
"${RECRUITMENT_PYTHON:-python3}" "${RECRUITMENT_SKILL_DIR:-$HOME/.agents/skills/recruitment-superpower}/action/call_a_function.py" recruitment/api/user-tables/create --params '{"name":"my_source","description":"Purpose","columns":[{"name":"id","type":"text","description":"Identifier"}]}'
```

## Update existing data

Read the exact selected asset and the user's requested change first. Do not create a second table as a substitute for updating it.

For a personal table, `recruitment/api/user-tables/list` resolves its UUID and `recruitment/api/user-tables/append` appends reviewed rows using its existing columns. Inspect the source with `builder/table/import_table.py inspect`, convert it locally if needed, then call the append Function in bounded batches through the installed `call_a_function.py` or its `call(asset_path, params)` Python function:

```sh
"${RECRUITMENT_PYTHON:-python3}" "${RECRUITMENT_SKILL_DIR:-$HOME/.agents/skills/recruitment-superpower}/action/call_a_function.py" recruitment/api/user-tables/append --params '{"id":"<table UUID>","rows":[{"id":"example"}]}'
```

Only append is currently implemented for ready personal tables. Replacing/removing rows or changing the schema is not an available generic operation: explain that limit when requested instead of silently appending. The append API is not an idempotent file import; after an uncertain response, query the actual data before further writes. The new-table import receipt must not be reused to append data.

For an official recruiting table, use its existing domain write APIs with the current user's permission; the personal append endpoint does not apply. Verify the requested result with `action/run_sql.py` and return the same semantic asset path.
