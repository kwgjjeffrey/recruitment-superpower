# Portable component kit

Builder owns the standard component sources in `builder/page/components/` and checks/builds in `builder/page/tooling/`. `new` packages them with the canonical Page contract as a fixed local `@recruitment/page` npm dependency. The page retains only business source and the portable archive; components compile into its static output. It adds no Runner component service or new runtime capability. Provenance is recorded and checked inside the dependency. Tailwind v4 is compiled locally; the shared theme and popup root are supplied by the dependency.

| Use | Component / declaration | Behavior owner |
| --- | --- | --- |
| Page layout and feedback | `PageShell`, `Card`, `Loading`, `ErrorState`, `EmptyState` | Selected Omni patterns, English copy |
| Controlled fields | `AutoObject`, `AutoInput` | Canonical field schema + `accept` |
| String/search | `type:'string'`, optional `ui.widget:'search'` | Copied shadcn/Base UI Input |
| Long text | `ui.widget:'textarea'` | Omni textarea primitive pattern |
| Numeric field | `type:'integer'/'number'`, min/max | Same schema validation as Agent assignment |
| Fixed choices | `enum`, optional `ui.labels` or exact `ui.options` | Copied Omni shadcn/Radix Select; typed value mapping |
| Live choices | `ui.widget:'select'`, `ui.optionsFrom` | Existing Select; observed `{value,label}` choices passed as `AutoObject.sources` |
| Boolean | `type:'boolean'` | Base UI Checkbox, including keyboard behavior |
| Nested object | `type:'object'` | Recursive `AutoObject`; nested patches preserve siblings |
| Read-only record/table | `AutoRead`, `AutoTable` | Returns schema selects fields/columns; hidden IDs retained |

Export `mountPage(View)` from `@recruitment/page` as `mount`, as in the starter. It installs the existing Page context, theme/portal root and unmount cleanup. Use `usePageContext()` when business API loading needs the current viewer. Popup portals stay inside that root in standalone and ATS-embedded execution.

Use ordinary composition for business layout, metrics and charts. `AutoRead` takes a field declaration and its loaded value; `AutoTable` takes the array declaration and real rows. Do not recreate another column schema or copy parameter values into Agent-only state. For very large result sets, query/page the API and choose an established virtual grid if the view needs one; the starter's bounded API page is a plain accessible table, not an Excel-scale grid.

The portable core deliberately does not bring Omni's company people/departments APIs, upload storage, editable-row engine or native temporal inputs. Dates, times, tags and rich editors require an appropriate existing component adapter before use; unsupported widgets fail at build instead of becoming a misleading text box. Prefer the suitable Omni component first, otherwise a mature library. Temporal selection must use a mature calendar/selection/overlay library; browser date/time/month pickers and handmade popup/calendar behavior are forbidden.

To extend the kit, preserve the field's value protocol, connect it to the same controlled `accept` value, add its explicit dispatch and validation to Builder’s `components/src/schema.ts`, and record the real source path/version/hash plus adaptation reason in `component-sources.json`. For dynamic choices, render and observe the same `{value,label}` options, expose how they are obtained, submit stable values, disable/retry on failure, and never fall back to unrestricted text. An unimplemented option source must not appear in semantics.

`npm run check` validates recorded component hashes and audits JSX usage. Raw business controls outside reviewed sources, native temporal controls and invented selection/dialog roles fail. `.recruitment/component-inventory.json` records the derived JSX inventory for review. This is a source consistency check, not proof of working keyboard/focus behavior; exercise the affected components with a real browser before publication acceptance.

Use `@recruitment/page/fields` for `AutoObject`/`AutoInput`, `/read` for `AutoRead`/`AutoTable`, `/ui` for layout/feedback/buttons, `/schema` and `/portable` for canonical declarations, and `/viz` for SQL visualization. Importing the normal page controls does not load ECharts; the visualization entry is separate. The package identity is a build dependency, not a Runner feature list.

`Viz` retains Omni’s declaration/query/rendering protocol and uses the same Page state and standard controls. Its SQL client, response handling, request lifecycle, schema normalization and chart renderers are internal implementation. See [Visualization](visualization.md) for the business authoring surface.

`MetricReport` adds a count matrix and exact member/activity drilldowns using the same SQL API, standard Select/Table and the copy-in Omni Radix Drawer. It is Builder-owned and compiles into the published page. See [Metric matrix](visualization.md#metric-matrix-with-exact-drilldown).
