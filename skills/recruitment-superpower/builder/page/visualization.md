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

## Metric matrix with exact drilldown

For a milestone report, create `new /user/chosen/project --name application-funnel --template funnel`. Its four business files follow the same layout: `page.viz.ts` declares the semantic SQL, metrics and dimensions; `page.schema.ts` uses `metricReportView(report)`; `page.tsx` renders `<MetricReport definition={report}/>`; `style.css` imports the shared theme. Import these from `@recruitment/page/viz/metrics`. No query effect, host adapter or runtime extension is needed.

The source is an event-shaped SQL relation. Declare its output aliases in `verified_columns`: `entity_id`, `entity_name`, `entity_url`, `cohort_at`, `event_at`, `metric`, `event_id`, `event_label`, `result`, `sequence`, plus each dimension's stable ID and label columns. `metrics` specifies stable keys, labels, groups and precise business counting rules. `dimensions` specifies `{key,column,labelColumn,label}`. The funnel template shows the complete working definition against `recruitment/tables/application_funnel_events`.

`MetricReport` counts distinct entities per metric. The Period control is the Omni date-range picker: choose either an existing preset or an inclusive custom `YYYY-MM-DD..YYYY-MM-DD` interval from its calendar. Activity time filters the event clock; cohort mode filters entity creation time and follows its progress through now. Dates use the selected time zone. Time/job/owner grouping and dynamic choices derive from the same authorized SQL source. Optional steps can be skipped, so this is an activity milestone matrix; decreasing conversion counts are not guaranteed.

The matrix has a pinned `Sum` row instead of separate KPI cards. Its counts remain global filtered totals across every group page. Each Sum or grouped count opens its exact members. Primary filters occupy one compact row; time grain and zone are in More options. Each member can expand its qualifying activity evidence. Groups/members/evidence use bounded pagination (25/25/20). Counts and both drilldown levels share one SQL statement, permission scope, filters and snapshot. A single aggregated payload stays within the existing SQL API result-row cap; it does not raise or disable the cap. Live dimension choices are observed as the same `{value,label}` arrays used by the human controls. They include dimension values present in the authorized source, rather than an independent catalog of empty Jobs.

Use `unknownTimeMetric` to expose an explicit all-dates inspection for records whose event clock is unknown; dimension filters still apply. Never assign historical completion to `updated_at` just to fill a chart. The funnel source derives interview order across complete completed history before any date window, retains actual numbers above five, and attributes to the current Job/owner. Result corrections restate the report. It is a live fact view; a cache or materialized aggregate should only follow measured query cost and a defined refresh/invalidation policy.

All visible filter/drilldown parameters and actual results use ordinary Page `accept`/`provide`. Filter changes reset open drilldowns through the canonical contract. Errors remove old values and allow retry/reset. Validate every count against its members, repeated activities, cross-month sequences, unknown clocks, permissions, pagination, empty/error states, keyboard/focus, narrow layout, reload, Agent calls and ATS embedding before claiming acceptance.
