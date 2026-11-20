<!--VITE PLUS START-->

# Using Vite+, the Unified Toolchain for the Web

This project is using Vite+, a unified toolchain built on top of Vite, Rolldown, Vitest, tsdown, Oxlint, Oxfmt, and Vite Task. Vite+ wraps runtime management, package management, and frontend tooling in a single global CLI called `vp`. Vite+ is distinct from Vite, and it invokes Vite through `vp dev` and `vp build`. Run `vp help` to print a list of commands and `vp <command> --help` for information about a specific command.

Docs are local at `node_modules/vite-plus/docs` or online at https://viteplus.dev/guide/.

## Built-in Commands vs Scripts

`vp <name>` runs a built-in command. `vp run <name>` runs a `package.json` script or a `vite.config.ts` task. Scripts cannot overwrite built-ins, so `vp dev` and `vp run dev` may do different things. Check `package.json` and `vite.config.ts` first, and run `vp run <name>` when the project defines a script or task with that name.

## Running Scripts

Run TypeScript and JavaScript files with `vpx <file>`, for example `vpx ./scripts/seed.ts --dry-run`. It handles enums, decorators, JSX, and tsconfig `paths`, so do not add `tsx` or `ts-node` to run scripts. `vpx --watch <file>` reruns the file when a file it uses changes, in place of `tsx watch`. `vp node <file>` runs plain Node.js.

## Tool Versions

Run `vp toolchain` to show versions and relationships in the active Vite+
release. Add a tool name to select part of the graph. For example, run
`vp toolchain vite`. Use `--global` to ignore the local `vite-plus` package. Use
`vp why <package>` to show the package-manager dependency graph.

## Review Checklist

- [ ] Run `vp install` after pulling remote changes and before getting started.
- [ ] Run `vp check` and `vp test` to format, lint, type check and test changes.
- [ ] Check if there are `vite.config.ts` tasks or `package.json` scripts necessary for validation, run via `vp run <script>`.
- [ ] If setup, runtime, or package-manager behavior looks wrong, run `vp env doctor` and include its output when asking for help.

<!--VITE PLUS END-->

# Wassail Maintainer Guide

## Product and compatibility

- Wassail is the TypeScript/Node.js counterpart to the Python `elf` project. Preserve feature and safety parity while using idiomatic async TypeScript and camelCase public models.
- It ships as both the `wassail` CLI and an ESM library. The supported consumer runtime is Node.js 18 or newer; development and Vitest 5 use Node.js 26.13.1 from `devEngines.runtime`.
- Keep stdout machine-readable for input, JSON, and CSV output. Send errors to stderr. Preserve answer exit codes: `0` for correct/completed, `1` for incorrect or unknown, and `2` for cooldown or CLI usage errors.
- Advent of Code events have 25 days through 2024 and 12 days from 2025 onward. Keep default year/day selection in the America/New_York timezone.

## Architecture

- `src/index.ts` is the public library boundary. Deliberately export stable APIs and types there; internal helpers should remain internal.
- `src/cli.ts` owns argument parsing, terminal rendering, and process exit behavior. Domain logic belongs in focused modules, not command handlers.
- `src/http.ts` is the only low-level AoC transport. GETs may retry transient failures; answer POSTs must never retry automatically.
- `src/cache.ts` owns cache paths, credential fingerprints, atomic writes, private permissions, and cross-process locks. Never persist raw session cookies or view keys, include them in paths, or print them.
- `src/answer.ts` owns submission parsing and guardrails. A cache failure after a POST must not hide the server result and encourage an accidental resubmission.
- `src/events.ts` owns event length, defaults, validation, and unlock calculations. Avoid duplicating date rules elsewhere.
- `src/models.ts` contains the shared public shapes and string-valued status/format constants.
- `src/wassail.test.ts` is the regression suite. Tests must not contact Advent of Code and must isolate cache writes under temporary directories.

## Tooling rules

- All Vite+, Vitest, Oxlint, Oxfmt, and package-build settings live in `vite.config.ts`. Do not recreate standalone tsdown, Vitest, ESLint, or Prettier configs.
- Use `vite-plus/test` imports in tests. Run TypeScript utilities with `vpx`; do not add `tsx` or `ts-node`.
- Treat `dist/` as generated output. Change `src/`, then run `vp pack`; never edit generated JavaScript or declarations directly.
- Keep `package.json` and `src/version.ts` versions aligned. The test suite enforces this.
- Keep the public Node engine separate from the pinned development runtime. Do not raise `engines.node` merely to satisfy the local test runner.

## Change validation

Run these before handing off code changes:

```sh
vp install
vp check
vp test
vp pack
```

For package or export changes, also create and inspect the tarball, install it in a temporary consumer project, and smoke-test both `wassail --version` and an ESM import from `wassail`.

## Release checklist

1. Confirm the worktree contains only intended release changes.
2. Confirm `package.json` and `src/version.ts` have the same unpublished version.
3. Run `vp env current`, `vp check`, `vp test`, and `vp pack`.
4. Run `npm pack --dry-run` and verify only `dist`, package metadata, README, and LICENSE are included.
5. Smoke-test the generated tarball from a clean temporary project.
6. Check `npm view wassail version` and `npm whoami` immediately before release.
7. Review the final commit and tag. Do not run `npm publish`, create a GitHub release, or push tags unless the user explicitly requests it.
8. Publish the public package with `npm publish --access public`; then verify `npm view wassail version` and the installed CLI.
