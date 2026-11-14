# Installed release

The Skill and Rust runtime have independent versions. Use `"${RECRUITMENT_PYTHON:-python3}" "${RECRUITMENT_SKILL_DIR:-$HOME/.agents/skills/recruitment-superpower}/setup/scripts/manage_skill_installation.py" status` to inspect their active versions, source commit and runtime status.

Setup discovers updates from the Skill's configured HTTPS channel, verifies the publisher signature and both component checksums, and stages a complete installation before activation. Previous versions remain available for rollback.
