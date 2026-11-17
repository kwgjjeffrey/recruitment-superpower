# SQL visualization in a standard Page

Create a normal page with a report example:

```sh
"${RECRUITMENT_PYTHON:-python3}" "${RECRUITMENT_SKILL_DIR:-$HOME/.agents/skills/recruitment-superpower}/builder/page/build_page.py" new /user/chosen/project --name recruitment-overview --template report
```

The project uses the ordinary Page schema, compiled MF ABI and publication. It introduces no report-specific Runner. The example reads the viewer's authorized recruitment table assets through the existing SQL API.

## Author the report

Edit `src/page.viz.ts`. Import `viz`, `block`, `f` from `@recruitment/page/viz`. These retain Omni Builder's source, filter and channel vocabulary:

```ts
export const report = viz({
  description: 'Applications by current stage.',
  data_source: {
    kind: 'sql',
    sql: 'SELECT stage FROM "recruitment/tables/applications"',
    verified_columns: { stage: 'string' },
  },
  blocks: [
    block.pie({
      id: 'stages', title: 'Current stage', donut: true,
      category: { rel_column: 'stage', label: 'Stage', sort: 'value_desc' },
      value: { agg: 'count', as: 'applications', label: 'Applications', format: 'int' },
    }),
  ],
})
```

SQL chooses the semantic tables. Channels reference its result aliases. `verified_columns` describes those result columns for declaration checks; it does not supply table bindings or permissions. No separate `table_ref`, endpoint, authentication token or physical mapping is required. Use multiple blocks to compose KPIs, line/bar/area, pie, scatter and read-only table views. Set measures with `agg/rel_column/as`, dimensions with `rel_column`, and display properties such as `grain`, `labels`, `format`, `sort`, `limit`, `horizontal`, `stacked`, `donut` and `span`.

Filters use mother `f.*` nodes with `rel_column`. Set `title` for the human label and `description` for business meaning. Fixed choices use enum values and labels. An empty filter default means no filtering. Date ranges currently require explicit preset enum choices/labels; the component renders the established Select and the mother compiler applies UTC day windows. It never falls back to a native temporal picker. Other controls must be supported by the standard component kit; check rejects unsupported capabilities.

In `src/page.schema.ts`, set `views.main` to `vizView(report)` from the same import. It derives the existing Page input/output contract. In `src/page.tsx`, render `<Viz definition={report}/>` inside a view mounted with `mountPage`. A main view owns one Viz with multiple blocks; separately composed data-source panels are not part of this version. Do not add request effects, a query callback, copied component directories or an Agent-only result.

## Data and failure behavior

Viz requests same-origin `/api/sql/query` as the current viewer. The existing backend resolves semantic assets and enforces read-only SQL, account access, timeout and row limits. The component owns queries, cancellation, late-result rejection, loading/error/retry and the shared actual observation. Human controls and Agent calls use the existing `accept` state.

The SQL response's ordered columns and positional rows are validated. Duplicate output aliases, malformed rows and truncated results fail visibly; a partial dataset is not presented as a complete chart. Mother sorting/limits happen after query execution, so configure SQL/filter granularity to stay within the server's 200-row limit. No client-side setting raises that boundary.

General SQL aggregates retain null-on-empty semantics in both render and observation. Counts are zero. For a conditional count use `COUNT DISTINCT` on a nullable conditional ID, as in the example. Time bucketing/filling and sort/limit behavior remain the mother implementation. State the actual business meaning: a current-stage snapshot does not establish historical stage conversion.

Build/check validates declarations, generated semantics, component sources and supported controls. Publish/verify with the ordinary [Page workflow](SKILL.md), then exercise filters, actual chart results, empty/error/retry, keyboard/focus, narrow layout and reload. Standard verification additionally checks deployed static bytes and the selected browser build.
