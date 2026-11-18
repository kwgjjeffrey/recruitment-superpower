---
name: recruitment-builder
description: Build and publish user-owned tables, portable API-driven pages and analytics reports through the Recruitment platform's authenticated local daemon.
---

Use the [Builder guide](../recruitment-superpower/builder/SKILL.md) to choose the Page, Table or Wiki module. Each module owns its guide and tooling. Commands use the registered Recruitment Superpower entry `${RECRUITMENT_SKILL_DIR:-$HOME/.agents/skills/recruitment-superpower}` and its authenticated local daemon; compilation and publishing do not require the ATS frontend to remain open. Read the installed module guide.

If Recruitment Superpower is not installed, install its published platform runtime before using Builder:

```sh
npx --yes skills add kwgjjeffrey/recruitment-superpower --global --agent codex --skill recruitment-superpower --yes
sh "${RECRUITMENT_SKILL_DIR:-$HOME/.agents/skills/recruitment-superpower}/setup.sh"
```

Keep page source in the directory chosen by the user. Builder starts from the Talent API example; customize the schema and frontend API orchestration for the requested page or report. Compile locally and publish static output plus a separate version-bound source snapshot through the daemon. Use the Page module’s `fork` command to build another page from a published page’s source. No SSH, developer credentials or service deployment belongs in a user's page publication.

Use the [Page module](../recruitment-superpower/builder/page/SKILL.md) for pages/reports, the [Table module](../recruitment-superpower/builder/table/SKILL.md) for tables/imports/data updates, and the [Wiki module](../recruitment-superpower/builder/wiki/SKILL.md) for local knowledge drafts. Wiki indexing/publication is not defined yet. Each module gives concrete commands through the registered Superpower entry.
