# Setup

Install and update the Skill through GitHub with npx skills. The Rust runtime is downloaded independently from the signed HTTPS release channel. Installation needs Node.js/npx; runtime lifecycle scripts need Python 3.9+, curl and OpenSSL. Chat additionally requires the user's installed and signed-in Codex CLI.

```sh
npx --yes skills add kwgjjeffrey/recruitment-superpower --global --agent codex --skill recruitment-superpower --yes
sh "$HOME/.agents/skills/recruitment-superpower/setup.sh"
```

To check for and install a Skill update, use `npx --yes skills update recruitment-superpower --global --yes`, then run setup again. The next CLI invocation also prepares a missing or mismatching runtime. The signed runtime installer preserves the npx-owned Skill directory and registration; runtime data stays in its external store.

In a normal terminal, run `sh "$HOME/.agents/skills/recruitment-superpower/setup.sh"`. It checks the installation, opens the recruiting application and starts the runtime. Repeating it reuses a healthy matching runtime. A conflicting port is reported with the owning process when available.

Use `"${RECRUITMENT_PYTHON:-python3}" "$HOME/.agents/skills/recruitment-superpower/setup/scripts/manage_skill_installation.py" check` to inspect the signed runtime channel. It does not replace the npx Skill update check. Legacy signed-bundle installations retain their `upgrade` and `rollback` recovery commands. An npx-owned Skill is updated or pinned through npx; runtime recovery does not overwrite it. After a runtime update, run start or restart to load the selected components. start reuses an exact matching daemon and restarts its own older components or prior origin/port configuration.

Use `start`, `status`, `stop` or `restart` for the runtime lifecycle. `start --no-open` starts in the background without opening another browser tab. `start --foreground` keeps the process attached for diagnosis. Search, view and action scripts install or start a missing runtime before execution. The first authenticated request opens the application connection page; sign in and connect there. A live runtime is stopped only when its process identity matches the saved discovery record.

Each command prints the installed Skill and runtime versions. Download, validation or activation failure preserves the current installation and reports an error. If setup reports a Skill-version mismatch, update that Skill through npx first; it never replaces a different directory automatically.
