# Wassail

[![npm](https://img.shields.io/npm/v/wassail?logo=npm)](https://www.npmjs.com/package/wassail)
[![Node.js](https://img.shields.io/node/v/wassail)](https://www.npmjs.com/package/wassail)
[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](https://github.com/snally-dev/wassail/blob/main/LICENSE)

[Changelog](https://github.com/snally-dev/wassail/blob/main/CHANGELOG.md) ·
[Issues](https://github.com/snally-dev/wassail/issues) ·
[npm package](https://www.npmjs.com/package/wassail)

A fast, typed Advent of Code toolkit for Node.js. Fetch and cache puzzle inputs,
submit answers with guardrails, inspect progress, explore private leaderboards,
and scaffold TypeScript solutions from either a friendly CLI or a promise-based
library API.

Wassail is the TypeScript/Node.js counterpart to
[elf](https://github.com/typeerror/elf), with the same careful behavior adapted
to modern ESM and TypeScript.

## Why Wassail?

- Fetch personalized puzzle input once and reuse a private local cache.
- Avoid accidental duplicate, known-too-high, and known-too-low submissions.
- Respect puzzle unlocks and Advent of Code's exact answer cooldown.
- View private leaderboards as terminal tables, CSV, JSON, or typed models.
- Inspect yearly stars and offline guess history.
- Start each day with a runnable, cell-based TypeScript template.
- Diagnose configuration without revealing credentials or contacting AoC.
- Use the same functionality from scripts, applications, or the terminal.

## Requirements

- Node.js 18 or newer
- An [Advent of Code](https://adventofcode.com/) account
- An AoC session cookie for authenticated commands

## Install

Install the CLI globally:

```sh
npm install --global wassail
wassail --version
```

Or add the library to a project:

```sh
npm install wassail
```

Wassail is ESM-only.

## Quick start

```sh
export AOC_SESSION="your-session-cookie"
export AOC_USER_AGENT="you@example.com"

# Fetch the latest relevant puzzle input.
wassail input

# Work with an explicit puzzle.
wassail input 2024 2 > day02.txt
wassail new 2025 1

# Submit only after checking the answer.
wassail answer 2025 1 1 12345

# See progress and local submission history.
wassail status 2025
wassail guesses 2025 1
```

## Configuration

### Session cookie

Most commands need the `session` cookie associated with your Advent of Code
account. Sign in at [adventofcode.com](https://adventofcode.com/), open your
browser's developer tools, inspect cookies for `adventofcode.com`, and copy the
value named `session`.

Pass it through the environment:

```sh
export AOC_SESSION="your-session-cookie"
```

Or use `--session` for an individual command. Avoid putting credentials in
shell history, scripts, screenshots, or issue reports.

### Contact User-Agent

Advent of Code asks automated clients to identify a person who can be contacted
if their traffic causes trouble. Set an email address:

```sh
export AOC_USER_AGENT="you@example.com"
```

Wassail strips line breaks and validates this setting before constructing its
User-Agent. If it is absent or invalid, Wassail warns and uses a project URL as
the fallback identity.

### Environment variables

| Variable            | Purpose                                                 |
| ------------------- | ------------------------------------------------------- |
| `AOC_SESSION`       | Default authenticated AoC session cookie                |
| `AOC_USER_AGENT`    | Contact email included in HTTP requests                 |
| `WASSAIL_CACHE_DIR` | Override the entire cache location                      |
| `XDG_CACHE_HOME`    | Override the cache base on Linux and other Unix systems |
| `WASSAIL_DEBUG=1`   | Show full CLI errors instead of friendly messages       |

## CLI reference

```text
Usage: wassail [OPTIONS] COMMAND [ARGS]...

Commands:
  input        Fetch and cache puzzle input
  answer       Submit an answer with safety guardrails
  leaderboard  Fetch and display a private leaderboard
  guesses      Show local guess history
  status       Show yearly star progress
  open         Open a puzzle, input, or the AoC website
  new          Create an interactive TypeScript solution file
  cache        Show cache location and file count
  doctor       Check local configuration without contacting AoC
```

Use `wassail COMMAND --help` for command-specific syntax.

### Input

```sh
wassail input [YEAR] [DAY] [--session COOKIE]
```

Input is returned exactly as Advent of Code provided it, including its trailing
newline. This makes redirection safe:

```sh
wassail input 2024 2 > input.txt
```

Defaults follow AoC time (`America/New_York`):

- During December, the active year and latest available day are selected.
- Outside December, the final day of the latest completed event is selected.
- An explicit archived year defaults to that event's final day.
- Events through 2024 have 25 days; events from 2025 onward have 12.

### Answer

```sh
wassail answer YEAR DAY PART ANSWER [--session COOKIE]
```

Before any POST, Wassail checks the account-specific local guess history. It
can stop a submission when the puzzle is locked, the answer is a duplicate, a
numeric answer is outside known bounds, the part is already complete, or an AoC
cooldown is still active.

Wassail never sleeps and never retries answer submissions automatically. You
remain in control of every POST.

| Exit code | Meaning                                           |
| --------: | ------------------------------------------------- |
|       `0` | Correct answer or part already completed          |
|       `1` | Incorrect, too high, too low, or unknown response |
|       `2` | Active cooldown or invalid CLI usage              |

### Leaderboard

```sh
wassail leaderboard YEAR BOARD_ID \
  [--session COOKIE] \
  [--view-key KEY] \
  [--format table|csv|json|model]
```

A private leaderboard can use an authenticated session or a read-only view key.
Responses are cached for 15 minutes, matching Advent of Code's minimum request
interval. Cache entries are isolated by event, board ID, and a one-way
credential fingerprint.

```sh
wassail leaderboard 2025 123456 --view-key ABCDEF
wassail leaderboard 2025 123456 --view-key ABCDEF --format csv > board.csv
```

### Status and guesses

```sh
wassail status [YEAR] [--format table|json|model] [--session COOKIE]
wassail guesses [YEAR] [DAY] [--session COOKIE]
```

`status` reads your AoC event page and reports earned stars. `guesses` is fully
offline: it reads the local CSV history created by previous submissions. If
more than one account has history for a puzzle, pass `--session` to select the
correct private namespace.

### Scaffold a solution

```sh
wassail new YEAR DAY [--output PATH]
```

The default destination is `YEAR/dayDD.ts`. Wassail will create parent
directories but refuses to overwrite an existing file.

The generated template includes reusable `// %%` cells for setup, input,
parsing, exploration, both parts, and opt-in submission. Run it directly with
Vite+'s TypeScript runner:

```sh
npm install wassail
vpx 2025/day01.ts
```

The template imports the library API, so the project running it needs Wassail
as a local dependency even when the CLI itself was installed globally.

### Open, cache, and doctor

```sh
wassail open [YEAR] [DAY] [--kind puzzle|input|website]
wassail cache
wassail doctor
```

`doctor` is deliberately local-only. It reports the Wassail version, AoC clock,
resolved default puzzle, presence of session/User-Agent settings, and cache
writability without contacting Advent of Code or printing secret values.

## Library API

```ts
import {
  OutputFormat,
  getPrivateLeaderboard,
  getPuzzleInput,
  getUserStatus,
  parseInput,
  submitPuzzleAnswer,
} from "wassail";

const input = await getPuzzleInput(2025, 1);
const lines = parseInput(input);

const result = await submitPuzzleAnswer(2025, 1, 1, 12345);
console.log(result.result, result.message);

const status = await getUserStatus(2025);

const csv = await getPrivateLeaderboard(
  2025,
  123456,
  undefined,
  "read-only-view-key",
  OutputFormat.CSV,
);
```

Public functions are promise-based:

```ts
getPuzzleInput(year, day, session?): Promise<string>

submitPuzzleAnswer(
  year,
  day,
  part,
  answer,
  session?,
): Promise<SubmissionResult>

getPrivateLeaderboard(
  year,
  boardId,
  session?,
  viewKey?,
  format?,
): Promise<Leaderboard | string | Table>

getUserStatus(
  year,
  session?,
  format?,
): Promise<YearStatus | string | Table>
```

Wassail also exports `SubmissionStatus`, `OutputFormat`, `OpenKind`, public
model types, `parseInput`, `readInput`, and specific error classes for callers
that need structured recovery.

### Submission results

```ts
interface SubmissionResult {
  guess: number | string;
  result:
    | "correct"
    | "incorrect"
    | "too_high"
    | "too_low"
    | "wait"
    | "completed"
    | "unknown";
  message: string;
  isCorrect: boolean;
  isCached: boolean;
  retryAt?: Date;
}
```

## Cache and security model

Default cache locations:

- macOS and Linux: `~/.cache/wassail`
- Windows: `%LOCALAPPDATA%\wassail`
- Override: `WASSAIL_CACHE_DIR`

Authenticated inputs and guesses live under an account namespace derived from
a one-way SHA-256 fingerprint. Raw session cookies and leaderboard view keys are
never stored in files, written into paths, or included in diagnostic output.

Wassail also:

- writes new cache files with private permissions where the platform supports
  them;
- replaces files atomically to avoid partial data after interruption;
- uses cross-process lock files around leaderboard refreshes and guess writes;
- keeps different accounts and view keys in separate namespaces; and
- preserves old cache data during one-time migration into private namespaces.

Delete the cache directory manually when you want to clear everything.

## Troubleshooting

Start with:

```sh
wassail doctor
```

Common issues:

- **Missing session:** set `AOC_SESSION` or pass `--session`.
- **Expired session:** copy a fresh `session` cookie after signing in to AoC.
- **User-Agent warning:** set `AOC_USER_AGENT` to a contact email.
- **Multiple cached accounts:** pass the intended account's `--session` when
  reading guesses.
- **Locked puzzle:** check the reported unlock timestamp in AoC time.
- **Unexpected stack needed:** rerun with `--debug` or `WASSAIL_DEBUG=1`.

Please report reproducible bugs through
[GitHub Issues](https://github.com/snally-dev/wassail/issues), without including
session cookies, view keys, or private puzzle input.

## Development

Wassail uses [Vite+ 1.6](https://viteplus.dev/guide/) for runtime management,
dependencies, formatting, linting, type checking, testing, and packaging. The
published library supports Node.js 18+, while development and Vitest 5 use the
separately pinned Node.js 26.13.1 runtime.

```sh
git clone https://github.com/snally-dev/wassail.git
cd wassail
vp install
vp env current
vp check
vp test
vp pack
```

All tool configuration lives in `vite.config.ts`. Run TypeScript utilities with
`vpx`, and use `vp toolchain` to inspect the bundled versions.

Before publishing, `npm` automatically runs the Vite+ checks, tests, and pack
build through package lifecycle scripts. Maintainers should still inspect
`npm pack --dry-run` and smoke-test the tarball from a clean project.

## Acknowledgements

Advent of Code is created by [Eric Wastl](https://adventofcode.com/about). Please
support the project, respect its automation guidance, and avoid unnecessary
requests.

## License

[MIT](https://github.com/snally-dev/wassail/blob/main/LICENSE) © 2025–2026
snally-dev.
