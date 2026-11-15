# Changelog

Notable user-facing changes to Wassail are documented here.

## 1.2.0 — 2026-11-15

Wassail is now the complete TypeScript/Node.js counterpart to the Python
[`elf`](https://github.com/typeerror/elf) project.

### Added

- A typed, promise-based ESM library API for puzzle input, answer submission,
  private leaderboards, and yearly status.
- `answer`, `leaderboard`, `guesses`, `status`, `open`, `new`, `cache`, and
  `doctor` CLI commands.
- Calendar-aware defaults for archived, active, and reduced-length Advent of
  Code events.
- Account-scoped input and guess caches using one-way credential fingerprints.
- Atomic cache replacement, private permissions, cross-process locks, and safe
  migration of legacy cache files.
- Duplicate, numeric-bound, completed-part, locked-puzzle, and cooldown answer
  guardrails.
- Exact server-provided cooldown deadlines in `SubmissionResult.retryAt`.
- Fifteen-minute private-leaderboard caching with table, CSV, JSON, and model
  output.
- TypeScript solution scaffolding with interactive `// %%` cells.
- Local-only diagnostics that never print credential values.
- Vite+ formatting, linting, type checking, testing, packaging, and managed
  development runtimes.

### Changed

- `input` now preserves the response exactly while caching it privately per
  account.
- Event defaults follow America/New_York and select the latest relevant puzzle
  outside December.
- The npm package now includes an ESM library entry point, generated type
  declarations, and a rebuilt executable CLI.
- Package and repository metadata now point to
  [`snally-dev/wassail`](https://github.com/snally-dev/wassail).

### Compatibility

- The public consumer requirement remains Node.js 18 or newer.
- The original `wassail@0.0.1` input-fetching behavior is available through the
  richer `wassail input [YEAR] [DAY]` command.
- Existing unscoped input and guess caches are preserved during migration.

## 0.0.1 — 2025-09-27

- Initial npm release with a minimal Advent of Code input-fetching CLI.
