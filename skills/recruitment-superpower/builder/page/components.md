# Portable component kit

The scaffold copies selected Omni/shadcn components into `src/components` and `src/ui`, with provenance in `component-sources.json`. It composes them against the canonical `src/sdk` contract. These are source-owned components, not a remote component service. Tailwind v4 is compiled locally; `style.css` owns theme tokens for both the page and popup portal. No runtime compiler or Tailwind CDN is required.

| Use | Component / declaration | Behavior owner |
| --- | --- | --- |
| Page layout and feedback | `PageShell`, `Card`, `Loading`, `ErrorState`, `EmptyState` | Selected Omni patterns, English copy |
| Controlled fields | `AutoObject`, `AutoInput` | Canonical field schema + `accept` |
| String/search | `type:'string'`, optional `ui.widget:'search'` | Copied shadcn/Base UI Input |
| Long text | `ui.widget:'textarea'` | Omni textarea primitive pattern |
| Numeric field | `type:'integer'/'number'`, min/max | Same schema validation as Agent assignment |
| Fixed choices | `enum`, optional `ui.labels` or exact `ui.options` | Copied Omni shadcn/Radix Select; typed value mapping |
| Boolean | `type:'boolean'` | Base UI Checkbox, including keyboard behavior |
| Nested object | `type:'object'` | Recursive `AutoObject`; nested patches preserve siblings |
| Read-only record/table | `AutoRead`, `AutoTable` | Returns schema selects fields/columns; hidden IDs retained |

Wrap the React tree with `PortalRoot element={element}` and add `page-root` to the mount element, as in the starter. `mount` returns an unmount/cleanup function. Popup portals stay inside that theme root in both standalone and ATS-embedded execution.

Use ordinary composition for business layout, metrics and charts. `AutoRead` takes a field declaration and its loaded value; `AutoTable` takes the array declaration and real rows. Do not recreate another column schema or copy parameter values into Agent-only state. For very large result sets, query/page the API and choose an established virtual grid if the view needs one; the starter's bounded API page is a plain accessible table, not an Excel-scale grid.

The portable core deliberately does not bring Omni's company people/departments APIs, upload storage, editable-row engine or native temporal inputs. Dates, times, tags, dynamic choices and rich editors require an appropriate existing component adapter before use; unsupported widgets fail at build instead of becoming a misleading text box. Prefer the suitable Omni component first, otherwise a mature library. Temporal selection must use a mature calendar/selection/overlay library; browser date/time/month pickers and handmade popup/calendar behavior are forbidden.

To extend the kit, preserve the field's value protocol, connect it to the same controlled `accept` value, add its explicit dispatch and validation to `components/schema.ts`, and record the real source path/version/hash plus adaptation reason in `component-sources.json`. For dynamic choices, render and observe the same `{value,label}` options, expose how they are obtained, submit stable values, disable/retry on failure, and never fall back to unrestricted text. An unimplemented option source must not appear in semantics.

`npm run check` validates recorded component hashes and audits JSX usage. Raw business controls outside reviewed sources, native temporal controls and invented selection/dialog roles fail. `.recruitment/component-inventory.json` records the derived JSX inventory for review. This is a source consistency check, not proof of working keyboard/focus behavior; exercise the affected components with a real browser before publication acceptance.
