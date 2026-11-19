---
name: recruitment-superpower
description: Operate recruiting pages using the Talent and Application workflows; inspect authorized page, API and table contracts when needed.
---

Complete the recruiting task through the user's application and report the actual result. Use the registered entry `${RECRUITMENT_SKILL_DIR:-$HOME/.agents/skills/recruitment-superpower}` and `${RECRUITMENT_PYTHON:-python3}` in every command. Never resolve that entry or substitute a release-store path from history.

## Happy path

### Check whether the requested operation applies

Before choosing a write workflow, combine the business state the user has already given with the relevant contract's rules. Read the smallest contract that can decide whether the operation is allowed; resolve record IDs only if that decision still needs the actual record. If a known state makes the requested operation unavailable, explain the restriction and end the turn. Do not discover or open a write form to test a restriction already established by the contract. Offer an alternative without executing a different change on the user's behalf.

### Choose the recruiting workflow

For a user-built page (`users/.../pages/...`), use that page's own contract. When the user refers to the current custom page or names a page absent from the map below (for example, Talent Explorer), read `"$ATS_PAGE_BRIDGE/context.json"` to identify it, inspect that asset, and invoke it. Do not substitute a built-in recruiting page just because it displays similar data. Builder is needed to create or publish pages, not to operate an already published page.

Use this page map for ordinary recruiting tasks. Do not start by searching for familiar recruiting pages.

| User's task | Entry asset | Continue to |
|---|---|---|
| Find a person; filter the talent pool | `recruitment/talent/list` | `recruitment/talent/detail` using the returned Talent ID |
| Find applications; inspect recruiting progress | `recruitment/applications/list` | `recruitment/applications/detail` with the returned Application and Talent IDs |
| Inspect a job or its candidates | `recruitment/jobs/list` | `recruitment/jobs/detail` |
| Create a person or job | `recruitment/talent/create` or `recruitment/jobs/create` | The corresponding detail page using the saved ID |
| Edit a person or job | `recruitment/talent/edit` or `recruitment/jobs/edit` | Resolve its ID from the corresponding list, then read the original editor fields |
| Add a person to a job | `recruitment/talent/detail` | Follow its add-to-job form link; the form supplies eligible Job choices |
| Find a Lead | `recruitment/leads/list` | `recruitment/leads/detail` using the returned Lead ID |
| Read or record Lead communication Notes; convert a Lead | `recruitment/leads/detail` | Its linked Note or conversion form, when its business rules allow the operation |
| Create a Lead or edit its profile fields | `recruitment/leads/create` or `recruitment/leads/edit` | Profile fields such as name, contact details and company; communication Notes belong to the detail workflow |
| Review assigned recruiting tasks | `recruitment/tasks/list` | The linked candidate and Application |
| Configure offices and meeting rooms | `recruitment/settings/offices` | Its declared actions |

**Talent and Application share the visible detail interface, with distinct business page identities.** `recruitment/talent/detail` owns the person's resume, shared Notes and application choices. `recruitment/applications/detail` owns the selected job's stage, resume evaluation, test, interview and offer. Application detail needs both `id` (Talent ID) and `applicationId`; obtain them from the list or the Talent's application choices. Notes always belong to the Talent.

For a create-and-apply task, create the Talent, then follow the Talent detail's add-to-job form link. That form already supplies the eligible Jobs: resolve the requested Job from those choices instead of discovering a separate Job-list workflow first. The same principle applies to interviewer and other form-owned choices. Use one authoritative choice source. If an assignable identifier has already been established, reuse it rather than looking it up again. This does not replace ordinary Job browsing/editing workflows.

For a new Talent, use the create contract directly. Its normal save reports an existing phone without modifying that profile; an unrelated list contract is not a phone-availability check. For an existing person, a name is a lookup, not a unique identity. If multiple records match, report the ambiguity and ask for the missing identifier before opening a recruiting form or submitting a change. End this turn with the clarification question in the Chat response; continue when the user replies, rather than keeping the turn alive waiting for an answer.

Match the depth of the answer to the request. For a browse/filter request, report the list's actual matching rows and the facts it exposes. Do not add extra biographical claims that require opening every resume just to substantiate your expanded answer. A keyword match is a search result, not proof of an unstated capability. Read details when the user asks to inspect a background or a requested condition cannot be decided from the list and its search contract, such as duties belonging to the same work-history entry. Keep that necessary verification; do not replace it with a guess to save calls.

Map the requested search focus to the fields the contract provides. When `q` searches names, companies or roles, switching to one of those search targets replaces `q`; keeping the other filters means retaining the other parameter keys, not restoring the previous value of the search being changed. Do not report company search as unavailable merely because the page uses a shared search box. If the user explicitly requires an intersection with the old keyword, check the declared search capabilities instead of silently dropping a condition or presenting a manually selected subset as an applied page filter.

Select a displayed section with the page parameter `section`, such as `section: test`. A section is not an asset and has no separate address. Read the page contract when several sections are needed, or use `view ... --section test` for one section. Choose the needed scope once: if an earlier response already contains that section's definition, reuse it instead of reading the whole page and the same section again. Follow its `forms[].asset_path` and read that form's contract before writing; do not construct form addresses. On a form page, filling parameters opens/fills the visible draft, and `action: save` submits it. Use an activity record's ID only to reopen that particular record for editing; do not confuse it with the Application ID.

Check the requested values against the form contract before submitting. If a value is outside a declared range or does not match an allowed value, explain the mismatch and ask for a corrected value; do not knowingly submit an invalid draft or silently change the user's value. Read the relevant form definition before doing record lookups that cannot affect this decision.

```sh
"${RECRUITMENT_PYTHON:-python3}" "${RECRUITMENT_SKILL_DIR:-$HOME/.agents/skills/recruitment-superpower}/semantics/view_semantics_asset.py" recruitment/talent/list
"${RECRUITMENT_PYTHON:-python3}" "${RECRUITMENT_SKILL_DIR:-$HOME/.agents/skills/recruitment-superpower}/action/invoke_a_page.py" recruitment/talent/list --params '{"q":"Benji Park"}'
```

To inspect the available page map, view `recruitment --type page`. It lists pages, their sections and linked form pages. Search is a fallback for capabilities not identified by the map or catalog, especially unfamiliar APIs and tables. The commands and page rules here are sufficient for the ordinary page workflow: do not open both module guides as a prerequisite. Read [Semantics](semantics/SKILL.md) only for discovery or metadata options not covered here; read [Actions](action/SKILL.md) for Function/SQL commands or execution behavior not covered here. Search and view print YAML; Python imports return dictionaries.

### Act on an identified target

When the target and its contract are already known, invoke it directly. Every page call still requires an explicit asset path. The conversation identifies the browser tab; the asset identifies the target page, which can differ from the page currently displayed. A named page such as “the current Talent list” is already identified by this map. Read `"$ATS_PAGE_BRIDGE/context.json"` only when the page identity or current record ID is still missing; it does not select a browser tab or replace a live state read. Obtain current state through invoke, not from an old snapshot.

A named operation uses the `action` key inside `--params`, for example `--params '{"action":"save"}'`. Include changed fields in the same object to fill and save once. Send only changed fields plus required record IDs and action fields; omitted page fields retain their current values. An empty string or null clears a filter. Do not resend unchanged filters or reconstruct unrelated resume fields. If the user asks to keep unspecified filters, either apply only the requested changes and inspect the returned filters, or read current state once if those values are needed for a decision. `"submit":false` only opens/fills a draft. Use returned business identifiers to reopen and verify saved records. With no parameters or `{}`, invoke only reads the currently open target page and its visible section/draft; do not supply filters or record IDs for that read. Returned `params` are observed values, not inputs. Reading never navigates, fills fields or submits; a closed target returns `PAGE_NOT_ACTIVE`. To open a page without filling fields, pass `--open`. Nonempty `--params` opens/applies the requested fields normally. Only opening/applying a page generates a display card. Do not repeat a successful read just to confirm the same read.

Independent metadata requests may run in parallel. Page invocations on the same tab must run sequentially, including when grouped into one tool call. Never guess IDs, field names or action names.

Use a short, evidence-complete path. Read page context only to resolve missing page/record identity; merely mentioning “current” does not require a context-file read. Search when the asset is unknown, then read only the definitions needed for the task and reuse them within this conversation. An edit page already exposes its original values; a separate detail visit before editing usually adds no information. After saving an edit, reopening that same editor is also an authoritative readback of its persisted fields. Reuse its known contract for that check; discover another detail asset when the task needs additional information the editor does not expose. Combine known fields and the action in one request. Open a draft first only when the user requests review, original edit values or currently loaded choices. Dynamic choices must come from the same form and record. To append an activity, follow the form contract’s create value for its activity ID rather than reusing an existing record ID. Use actual returned state as evidence, and perform the extra leave/reopen checks the user explicitly requested. Do not replace required identity checks, field preservation or post-write verification with a shorter-looking command.

## Prerequisite check

For importing a local file into a private data table, building a portable API-driven page, or creating an analytics report, use [Builder](builder/SKILL.md). Its [Table](builder/table/SKILL.md), [Page](builder/page/SKILL.md) and [Wiki](builder/wiki/SKILL.md) modules give the corresponding commands. Table imports and compiled page publication use authenticated APIs; Wiki indexing is not defined yet. Ordinary recruiting workflows above do not require Builder.

Every CLI ensures the local runtime is available and requests application authorization when necessary. The daemon manages application credentials, token refresh and authorized Semantics/API requests. Inside ATS it supplies the Skill entry, Python interpreter and per-conversation channel. Use [Setup](setup/SKILL.md) for installation, update, restart or recovery when automatic startup is blocked.

## Other outcomes

`ok: false` is failure. Read replies have `phase: observed` and loaded `state`; writes have `phase: executed` and persisted `result`. An error is not an empty business result. After an interrupted or timed-out write, inspect actual state before retrying. Preserve the user's requested read/write scope. Unknown assets, invalid parameters and missing permissions require resolving the specific error, not reinstalling or switching browser tabs.

For an unfamiliar integration, first discover whether its required capability is exposed by this application's authorized Semantics catalog. Use a focused search and inspect the relevant matching contracts or catalog. Once they cover the requested capability and expose no suitable operation, stop; do not keep swapping synonyms or rereading adjacent pages. Another lookup needs a specific unanswered gap, such as a search in the wrong language or an unexplored relevant catalog branch. A zero-hit query alone proves only that query had no match; an error proves no absence at all. Report the limit of the authorized catalog actually inspected. Do not try unrelated services, other Skills, desktop apps or browser history to manufacture an integration. Missing capability is different from missing records or a service outage.
