# Builder

Build portable front-end pages, including analytics reports, using existing API assets. The same page opens independently or inside ATS. API calls use the current viewer's identity. Page source stays in the user's chosen directory; only compiled static files and the generated page contract are published.

Use the registered Recruitment Superpower entry for these commands. `new` provides a Talent API starter; edit that project to implement the user's page. It uses the same schema, accept/provide and publication engine as ATS. API orchestration and page logic belong in the frontend; no backend deployment is involved in publishing a page.

```sh
"${RECRUITMENT_PYTHON:-python3}" "${RECRUITMENT_SKILL_DIR:-$HOME/.agents/skills/recruitment-superpower}/builder/build_page.py" new /user/chosen/project
"${RECRUITMENT_PYTHON:-python3}" "${RECRUITMENT_SKILL_DIR:-$HOME/.agents/skills/recruitment-superpower}/builder/build_page.py" build /user/chosen/project
"${RECRUITMENT_PYTHON:-python3}" "${RECRUITMENT_SKILL_DIR:-$HOME/.agents/skills/recruitment-superpower}/builder/build_page.py" publish /user/chosen/project --name talent-explorer
```

`new` requires an empty/nonexistent project directory and copies the starter and SDK. `build` installs dependencies, checks component provenance and builds the MF output. A lockfile is retained for subsequent `npm ci` builds. `publish` uploads only dist files using the daemon's authorized Function execution, verifies hashes, registers the page semantics and activates the build. It returns separate standalone and workspace URLs. No deployment key, Cookie or bearer credential is supplied by the caller. Version defaults to a content digest; an explicit `--version` is immutable. Repeating the same upload can resume identical chunks. After an uncertain activation response, inspect `versions` before retrying; never rerun unrelated business writes.

```sh
"${RECRUITMENT_PYTHON:-python3}" "${RECRUITMENT_SKILL_DIR:-$HOME/.agents/skills/recruitment-superpower}/builder/build_page.py" versions
"${RECRUITMENT_PYTHON:-python3}" "${RECRUITMENT_SKILL_DIR:-$HOME/.agents/skills/recruitment-superpower}/builder/build_page.py" activate BUILD_ID
"${RECRUITMENT_PYTHON:-python3}" "${RECRUITMENT_SKILL_DIR:-$HOME/.agents/skills/recruitment-superpower}/builder/build_page.py" instances
```

Activate an earlier build ID to roll back. Standalone runner instances connect to the same daemon without starting a chat. Select an instance explicitly when outside an ATS conversation:

```sh
"${RECRUITMENT_PYTHON:-python3}" "${RECRUITMENT_SKILL_DIR:-$HOME/.agents/skills/recruitment-superpower}/action/invoke_a_page.py" users/USER_ID/pages/talent-explorer --instance INSTANCE_ID --params '{"q":"engineer"}'
```

ATS conversations retain their originating tab and navigate to the explicit page asset as usual. Human controls and Agent updates change the same state and wait for the real API readback. This initial runtime exposes the main section's parameters and observations; it does not implement Agent form actions. A shared URL loads page code, not its author's credentials or cached business data. The receiving viewer signs in to the API provider. Sharing arbitrary JavaScript retains the code-trust assumptions discussed by the application; MF is not a security sandbox.
