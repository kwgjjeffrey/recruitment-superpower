---
name: recruitment-builder
description: Build and publish user-owned tables, portable API-driven pages and analytics reports through the Recruitment platform's authenticated local daemon.
---

Use the Builder toolchain independently of recruiting workflows. The platform runtime provides user authentication; it does not require the ATS frontend to remain open for compilation or publishing. The installed tool entry is `${RECRUITMENT_SKILL_DIR:-$HOME/.agents/skills/recruitment-superpower}/builder/build_page.py`; its [Builder guide](../recruitment-superpower/builder/SKILL.md) describes scaffold, build, authenticated upload, version activation, rollback and explicit standalone page instances. Read the installed guide, not a source checkout or a version-store path.

If Recruitment Superpower is not installed, install its published platform runtime before using Builder:

```sh
npx --yes skills add kwgjjeffrey/recruitment-superpower --global --agent codex --skill recruitment-superpower --yes
sh "${RECRUITMENT_SKILL_DIR:-$HOME/.agents/skills/recruitment-superpower}/setup.sh"
```

Keep page source in the directory chosen by the user. Builder starts from the Talent API example; customize the schema and frontend API orchestration for the requested page or report. Compile locally and publish only static output through the daemon. No SSH, developer credentials or service deployment belongs in a user's page publication.

For a local file or user table, read the installed [table import guide](../recruitment-superpower/builder/tables.md). Use `${RECRUITMENT_SKILL_DIR:-$HOME/.agents/skills/recruitment-superpower}/builder/import_table.py inspect FILE` to review CSV/TSV/XLSX/JSON data, and `upload FILE --name TABLE_NAME` to import through the existing authenticated Function assets. Reshape a local copy and supply `--schema` when the source needs conversion or explicit SQL types. The scaffold retains exact strings, uses bounded batches and records a receipt; reuse the same receipt for safe retries. Registration and physical storage run on the platform without a service release. Report the returned personal semantic path and verify it with the installed SQL action. Do not put database credentials into a page.
