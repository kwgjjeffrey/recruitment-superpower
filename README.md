# Recruitment Superpower

This repository distributes the verified consumer Skill artifact. The authoring source and Rust runtime remain in the ATS project's `skill/recruitment-superpower/`; `distribution.json` records its source commit and exact artifact hashes. The Rust runtime is downloaded separately from the signed release channel, without replacing the npx-owned Skill entry.

```sh
npx --yes skills add kwgjjeffrey/recruitment-superpower --global --agent codex --skill recruitment-superpower --yes
sh "$HOME/.agents/skills/recruitment-superpower/setup.sh"
```

Check and apply updates with `npx --yes skills update recruitment-superpower --global --yes`, then run setup. Chat history stays owned by the local agent runtime; credentials and runtime data stay outside this repository and the Skill directory.
