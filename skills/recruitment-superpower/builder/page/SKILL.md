# Portable page development and release

Build a frontend that calls existing registered APIs; API orchestration belongs in the frontend. The same compiled MF module runs in the independent page runner and inside ATS. Analytics reports are one use of this mechanism. Read the relevant API contracts before implementing calls. The scaffold includes Talent search as a working example; replace its schema/view for another purpose.

## Create and develop

Run the installed tool through the registered Skill entry. Node/npm are local build dependencies. The local daemon owns application authentication. Use the user's preferred project directory; the location has no effect on the published namespace.

```sh
"${RECRUITMENT_PYTHON:-python3}" "${RECRUITMENT_SKILL_DIR:-$HOME/.agents/skills/recruitment-superpower}/builder/page/build_page.py" new /user/chosen/project --name talent-explorer --title "Talent Explorer"
```

Edit `src/page.schema.ts` for parameters, observed results and descriptions; edit `src/page.tsx` for the visible frontend/API logic. `src/sdk/runtime.ts` defines `PageContext` and the `mount(element, context)` module ABI. The SDK's schema, publication and accept/provide engine are copied from the same canonical source used by ATS, not separately authored. Keep the component source manifest when using copied controls.

Human controls call `context.accept(patch)`. Subscribe to parameter changes, mark requests pending, and call `context.provide(actualState)` only after the corresponding API result arrives. Report failures with `context.fail(message)`; ignore stale asynchronous results. `context.api<T>(assetPath, params)` calls registered API assets as the current viewer. `mount` must return cleanup that unmounts the UI and stops its subscriptions/effects. The starter demonstrates these rules. There is no separate Agent state.

`package.json.recruitmentPage` stores the local project ID and default page name. Keep the ID while maintaining the project. It contributes to the compiled MF remote name; it does not choose a user account or grant publish authority. Schema asset/route placeholders are rewritten by the server to the authenticated user's real asset path.

## Check and compile locally

```sh
"${RECRUITMENT_PYTHON:-python3}" "${RECRUITMENT_SKILL_DIR:-$HOME/.agents/skills/recruitment-superpower}/builder/page/build_page.py" build /user/chosen/project
"${RECRUITMENT_PYTHON:-python3}" "${RECRUITMENT_SKILL_DIR:-$HOME/.agents/skills/recruitment-superpower}/builder/page/build_page.py" check /user/chosen/project
```

`build` installs locked dependencies (`npm ci` after the first lockfile), checks component provenance and TypeScript, validates the page schemas, and runs Vite/MF. It validates the generated `mf-manifest.json`, ES module entry, exposed `Page`, chunk/CSS references and generated `page.json`. `.recruitment/build.json` records source/output hashes. `check` rechecks source types and component provenance after dependencies are installed; it does not produce a releasable build.

Only compiled JS/CSS/static assets and generated contracts enter `dist`. Runtime code contains no Vite, TypeScript/JSX transpiler, package installer, build server or compile-on-load path. Changing source or compiled output invalidates the build receipt and publishing fails until `build` runs again.

## Publish as the user

```sh
"${RECRUITMENT_PYTHON:-python3}" "${RECRUITMENT_SKILL_DIR:-$HOME/.agents/skills/recruitment-superpower}/builder/page/build_page.py" publish /user/chosen/project
```

The name defaults to `package.json.recruitmentPage.name`; `--name another-page` publishes a separate page in the same user's namespace. The version defaults to the output digest; an explicit `--version` is immutable. The tool verifies the build receipt and then calls the registered begin/upload/activate Functions through the daemon. The caller supplies no Cookie, token, owner ID or deployment key. Repeated identical uploads resume; repeating an already published version skips writes and reactivates it.

The server derives `users/<immutable-user-id>/pages/<name>`. Different users may use the same name/version without collision. Immutable files are keyed by server-generated build IDs; the active page binding selects a build. Responses include `namespace`, `assetPath`, `buildId`, `version`, independent `url` and ATS `workspaceUrl`. ATS **Custom pages** lists the user's published pages. Page publication never restarts or redeploys ATS. `.recruitment/publication.json` stores the resulting identity and expected hashes locally.

```sh
"${RECRUITMENT_PYTHON:-python3}" "${RECRUITMENT_SKILL_DIR:-$HOME/.agents/skills/recruitment-superpower}/builder/page/build_page.py" versions
"${RECRUITMENT_PYTHON:-python3}" "${RECRUITMENT_SKILL_DIR:-$HOME/.agents/skills/recruitment-superpower}/builder/page/build_page.py" activate BUILD_ID
```

`versions` includes `active` for each owned build. Activating an earlier build rolls back that page; existing documents keep their loaded module and reloads load the active build. After an uncertain publication result, inspect versions before retrying. A failure is not evidence of successful activation.

## Verify the publication and visible page

```sh
"${RECRUITMENT_PYTHON:-python3}" "${RECRUITMENT_SKILL_DIR:-$HOME/.agents/skills/recruitment-superpower}/builder/page/build_page.py" verify /user/chosen/project
```

This verifies the authenticated user's active build identity, compares the server/local file manifests, downloads the published static files and checks every size/SHA-256. `status: static_verified` explicitly does not claim a browser workflow passed. No raw business data is persisted in verification receipts.

Open the returned independent URL and select its connected instance:

```sh
"${RECRUITMENT_PYTHON:-python3}" "${RECRUITMENT_SKILL_DIR:-$HOME/.agents/skills/recruitment-superpower}/builder/page/build_page.py" instances
"${RECRUITMENT_PYTHON:-python3}" "${RECRUITMENT_SKILL_DIR:-$HOME/.agents/skills/recruitment-superpower}/builder/page/build_page.py" verify /user/chosen/project --instance INSTANCE_ID --params '{"q":"engineer"}'
```

Inside the ATS conversation that owns the open browser tab, use `verify ... --browser --params '{"q":"engineer"}'`. Both modes call the same `action.page` and wait for actual observed API state. `status: verified` additionally confirms that browser readback. Parameters are optional; omit them to read without changing filters. Independently check the requested business outcomes, manual controls and reload; this generic verification cannot prove every possible workflow. Outside a conversation, an instance must be explicit; the tool never guesses a browser tab. ATS conversations cannot switch their originating tab.

Already published pages can be operated through the ordinary `action/invoke_a_page.py ASSET_PATH` command; Builder is not needed for everyday use. The initial ABI supports `main` parameters and observations. Agent form actions remain outside this version. Sharing a URL shares compiled page code and contract; API requests use the receiving viewer's identity.

For a project from the earlier trial scaffold, create a fresh project in a new chosen directory, port its schema/view and dependencies, then build and publish under the existing page name. Do not overwrite a user's modified project to upgrade tooling. Existing published trial pages remain loadable by the runner.
