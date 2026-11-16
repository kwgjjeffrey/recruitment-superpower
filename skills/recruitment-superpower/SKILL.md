---
name: recruitment-superpower
description: Operate recruiting pages using the Talent and Application workflows; inspect authorized page, API and table contracts when needed.
---

Complete the recruiting task through the user's application and report the actual result. Use the registered entry `${RECRUITMENT_SKILL_DIR:-$HOME/.agents/skills/recruitment-superpower}` and `${RECRUITMENT_PYTHON:-python3}` in every command. Never resolve that entry or substitute a release-store path from history.

## Happy path

### Choose the recruiting workflow

Use this page map for ordinary recruiting tasks. Do not start by searching for familiar recruiting pages.

| User's task | Entry asset | Continue to |
|---|---|---|
| Find a person; filter the talent pool | `recruitment/talent/list` | `recruitment/talent/detail` using the returned Talent ID |
| Find applications; inspect recruiting progress | `recruitment/applications/list` | `recruitment/applications/detail` with the returned Application and Talent IDs |
| Inspect a job or its candidates | `recruitment/jobs/list` | `recruitment/jobs/detail` |
| Create a person or job | `recruitment/talent/create` or `recruitment/jobs/create` | The corresponding detail page using the saved ID |
| Edit a person or job | `recruitment/talent/edit` or `recruitment/jobs/edit` | Resolve its ID from the corresponding list, then read the original editor fields |
| Add a person to a job | `recruitment/talent/detail` | Follow its add-to-job form link; the form supplies eligible Job choices |
| Work with leads | `recruitment/leads/list` | `recruitment/leads/detail`, `recruitment/leads/create` or `recruitment/leads/edit` |
| Review assigned recruiting tasks | `recruitment/tasks/list` | The linked candidate and Application |
| Configure offices and meeting rooms | `recruitment/settings/offices` | Its declared actions |

**Talent and Application share the visible detail interface, with distinct business page identities.** `recruitment/talent/detail` owns the person's resume, shared Notes and application choices. `recruitment/applications/detail` owns the selected job's stage, resume evaluation, test, interview and offer. Application detail needs both `id` (Talent ID) and `applicationId`; obtain them from the list or the Talent's application choices. Notes always belong to the Talent.

For a create-and-apply task, create the Talent, then follow the Talent detail's add-to-job form link. That form already supplies the eligible Jobs: resolve the requested Job from those choices instead of discovering a separate Job-list workflow first. The same principle applies to interviewer and other form-owned choices. Use one authoritative choice source. If an assignable identifier has already been established, reuse it rather than looking it up again. This does not replace ordinary Job browsing/editing workflows.

Select a displayed section with the page parameter `section`, such as `section: test`. A section is not an asset and has no separate address. Read the page contract, or use `view ... --section test` to inspect only that section's parameters and field meanings. Follow its `forms[].asset_path` for a writable form page; do not construct form addresses. On a form page, filling parameters opens/fills the visible draft, and `action: save` submits it. Use an activity record's ID only to reopen that particular record for editing; do not confuse it with the Application ID.

```sh
"${RECRUITMENT_PYTHON:-python3}" "${RECRUITMENT_SKILL_DIR:-$HOME/.agents/skills/recruitment-superpower}/semantics/view_semantics_asset.py" recruitment/talent/list
"${RECRUITMENT_PYTHON:-python3}" "${RECRUITMENT_SKILL_DIR:-$HOME/.agents/skills/recruitment-superpower}/action/invoke_a_page.py" recruitment/talent/list --params '{"q":"Benji Park"}'
```

To inspect the available page map, view `recruitment --type page`. It lists pages, their sections and linked form pages. Search is a fallback for capabilities not identified by the map or catalog, especially unfamiliar APIs and tables. The commands and page rules here are sufficient for the ordinary page workflow: do not open both module guides as a prerequisite. Read [Semantics](semantics/SKILL.md) only for discovery or metadata options not covered here; read [Actions](action/SKILL.md) for Function/SQL commands or execution behavior not covered here. Search and view print YAML; Python imports return dictionaries.

### Act on an identified target

When the target and its contract are already known, invoke it directly. Every page call still requires an explicit asset path. The conversation identifies the browser tab; the asset identifies the target page, which can differ from the page currently displayed. A named page such as “the current Talent list” is already identified by this map. Read `"$ATS_PAGE_BRIDGE/context.json"` only when the page identity or current record ID is still missing; it does not select a browser tab or replace a live state read. Obtain current state through invoke, not from an old snapshot.

A named operation uses the `action` key inside `--params`, for example `--params '{"action":"save"}'`. Include changed fields in the same object to fill and save once. Send only changed fields plus required record IDs and action fields; omitted page fields retain their current values. An empty string or null clears a filter. Do not resend unchanged filters or reconstruct unrelated resume fields. If the user asks to keep unspecified filters, either apply only the requested changes and inspect the returned filters, or read current state once if those values are needed for a decision. `"submit":false` only opens/fills a draft. Use returned business identifiers to reopen and verify saved records. With no parameters, invoke reads the target's actual state. Do not repeat a successful read just to confirm the same read.

Independent metadata requests may run in parallel. Page invocations on the same tab must run sequentially, including when grouped into one tool call. Never guess IDs, field names or action names.

Use a short, evidence-complete path. Read page context only to resolve missing page/record identity; merely mentioning “current” does not require a context-file read. Search when the asset is unknown, then read only the definitions needed for the task and reuse them within this conversation. An edit page already exposes its original values; a separate detail visit before editing usually adds no information. Combine known fields and the action in one request. Open a draft first only when the user requests review, original edit values or currently loaded choices. Dynamic choices must come from the same form and record. To append an activity, follow the form contract’s create value for its activity ID rather than reusing an existing record ID. Use actual returned state as evidence, and perform the extra leave/reopen checks the user explicitly requested. Do not replace required identity checks, field preservation or post-write verification with a shorter-looking command.

## Prerequisite check

Every CLI ensures the local runtime is available and requests application authorization when necessary. The daemon manages application credentials, token refresh and authorized Semantics/API requests. Inside ATS it supplies the Skill entry, Python interpreter and per-conversation channel. Use [Setup](setup/SKILL.md) for installation, update, restart or recovery when automatic startup is blocked.

## Other outcomes

`ok: false` is failure. Read replies have `phase: observed` and loaded `state`; writes have `phase: executed` and persisted `result`. An error is not an empty business result. After an interrupted or timed-out write, inspect actual state before retrying. Preserve the user's requested read/write scope. Unknown assets, invalid parameters and missing permissions require resolving the specific error, not reinstalling or switching browser tabs.
