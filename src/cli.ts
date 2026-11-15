import { existsSync, readdirSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { submitAnswer } from "./answer.js";
import { getCacheDir } from "./cache.js";
import { formatDoctorReport, runDoctor } from "./doctor.js";
import { defaultEventDay, defaultEventYear } from "./events.js";
import { WassailError } from "./errors.js";
import { getGuesses } from "./guesses.js";
import { getInput } from "./input.js";
import { getLeaderboard } from "./leaderboard.js";
import {
  OpenKind,
  OutputFormat,
  SubmissionStatus,
  type Table,
} from "./models.js";
import { openPage } from "./open.js";
import { createDayTemplate } from "./scaffold.js";
import { getStatus } from "./status.js";
import { renderTable } from "./table.js";
import { VERSION } from "./version.js";

const HELP = `Usage: wassail [OPTIONS] COMMAND [ARGS]...

Advent of Code CLI

Options:
  --version, -V  Show the CLI version and exit
  --debug        Show error stack traces
  --help, -h     Show this message and exit

Commands:
  input        Fetch the input for a given year/day
  answer       Submit an answer
  leaderboard  Fetch/display a private leaderboard
  guesses      Show cached guesses
  status       Show yearly star status
  open         Open puzzle/input/website
  new          Create an interactive TypeScript solution file
  cache        Show cache information
  doctor       Check local configuration without contacting Advent of Code
`;

const COMMAND_HELP: Record<string, string> = {
  input: "Usage: wassail input [YEAR] [DAY] [--session TEXT]",
  answer: "Usage: wassail answer YEAR DAY PART ANSWER [--session TEXT]",
  leaderboard:
    "Usage: wassail leaderboard YEAR BOARD_ID [--view-key TEXT] [--session TEXT] [--format table|csv|json|model]",
  guesses: "Usage: wassail guesses [YEAR] [DAY] [--session TEXT]",
  status:
    "Usage: wassail status [YEAR] [--session TEXT] [--format table|json|model]",
  open: "Usage: wassail open [YEAR] [DAY] [--kind puzzle|input|website]",
  new: "Usage: wassail new YEAR DAY [--output PATH]",
  cache: "Usage: wassail cache",
  doctor: "Usage: wassail doctor",
};

interface ParsedCommand {
  positionals: string[];
  session?: string;
  format?: string;
  viewKey?: string;
  kind?: string;
  output?: string;
  help: boolean;
}

function parseCommand(arguments_: string[]): ParsedCommand {
  const parsed = parseArgs({
    args: arguments_,
    allowPositionals: true,
    strict: true,
    options: {
      session: { type: "string", short: "s" },
      format: { type: "string", short: "f" },
      "view-key": { type: "string" },
      kind: { type: "string", short: "k" },
      output: { type: "string", short: "o" },
      help: { type: "boolean", short: "h" },
    },
  });
  return {
    positionals: parsed.positionals,
    ...(parsed.values.session ? { session: parsed.values.session } : {}),
    ...(parsed.values.format ? { format: parsed.values.format } : {}),
    ...(parsed.values["view-key"]
      ? { viewKey: parsed.values["view-key"] }
      : {}),
    ...(parsed.values.kind ? { kind: parsed.values.kind } : {}),
    ...(parsed.values.output ? { output: parsed.values.output } : {}),
    help: parsed.values.help ?? false,
  };
}

const integer = (value: string | undefined, label: string): number => {
  const parsed = Number(value);
  if (!value || !Number.isInteger(parsed))
    throw new RangeError(`${label} must be an integer.`);
  return parsed;
};

function output(data: unknown, format?: OutputFormat): void {
  if (typeof data === "string") {
    process.stdout.write(
      data + (format === OutputFormat.CSV || data.endsWith("\n") ? "" : "\n"),
    );
  } else if (isTable(data)) {
    process.stdout.write(`${renderTable(data)}\n`);
  } else if (Array.isArray(data) && data.every(isTable)) {
    process.stdout.write(`${data.map(renderTable).join("\n\n")}\n`);
  } else {
    process.stdout.write(`${JSON.stringify(data, null, 2)}\n`);
  }
}

const isTable = (value: unknown): value is Table =>
  typeof value === "object" &&
  value !== null &&
  "headers" in value &&
  "rows" in value &&
  Array.isArray((value as Table).rows);

function formatOption(
  value: string | undefined,
  leaderboard: boolean,
): OutputFormat {
  const format = (value ?? "table").toLowerCase();
  const allowed = leaderboard
    ? Object.values(OutputFormat)
    : [OutputFormat.MODEL, OutputFormat.TABLE, OutputFormat.JSON];
  if (!(allowed as string[]).includes(format)) {
    throw new RangeError(
      `Invalid format '${format}'. Choose ${allowed.join(", ")}.`,
    );
  }
  return format as OutputFormat;
}

async function runCommand(
  command: string,
  commandArguments: string[],
): Promise<number> {
  const parsed = parseCommand(commandArguments);
  if (parsed.help) {
    process.stdout.write(`${COMMAND_HELP[command] ?? HELP}\n`);
    return 0;
  }
  validateCommandArity(command, parsed.positionals);
  const currentYear = defaultEventYear();
  switch (command) {
    case "input": {
      const year = parsed.positionals[0]
        ? integer(parsed.positionals[0], "Year")
        : currentYear;
      const day = parsed.positionals[1]
        ? integer(parsed.positionals[1], "Day")
        : defaultEventDay(year);
      process.stdout.write(await getInput(year, day, parsed.session));
      return 0;
    }
    case "answer": {
      const year = integer(parsed.positionals[0], "Year");
      const day = integer(parsed.positionals[1], "Day");
      const part = integer(parsed.positionals[2], "Part");
      const answer = parsed.positionals[3];
      if (answer === undefined) throw new RangeError("Answer is required.");
      const result = await submitAnswer(
        year,
        day,
        part,
        answer,
        parsed.session,
      );
      process.stdout.write(`${result.message}\n`);
      if (result.result === SubmissionStatus.WAIT) return 2;
      return result.result === SubmissionStatus.CORRECT ||
        result.result === SubmissionStatus.COMPLETED
        ? 0
        : 1;
    }
    case "leaderboard": {
      const year = integer(parsed.positionals[0], "Year");
      const boardId = integer(parsed.positionals[1], "Board ID");
      const format = formatOption(parsed.format, true);
      output(
        await getLeaderboard(
          year,
          parsed.session,
          boardId,
          parsed.viewKey,
          format,
        ),
        format,
      );
      return 0;
    }
    case "guesses": {
      const year = parsed.positionals[0]
        ? integer(parsed.positionals[0], "Year")
        : currentYear;
      const day = parsed.positionals[1]
        ? integer(parsed.positionals[1], "Day")
        : defaultEventDay(year);
      output(getGuesses(year, day, parsed.session));
      return 0;
    }
    case "status": {
      const year = parsed.positionals[0]
        ? integer(parsed.positionals[0], "Year")
        : currentYear;
      const format = formatOption(parsed.format, false);
      output(await getStatus(year, parsed.session, format), format);
      return 0;
    }
    case "open": {
      const year = parsed.positionals[0]
        ? integer(parsed.positionals[0], "Year")
        : currentYear;
      const day = parsed.positionals[1]
        ? integer(parsed.positionals[1], "Day")
        : defaultEventDay(year);
      const kind = (parsed.kind ?? OpenKind.PUZZLE).toLowerCase();
      if (!(Object.values(OpenKind) as string[]).includes(kind)) {
        throw new RangeError(
          `Invalid kind '${kind}'. Choose puzzle, input, website.`,
        );
      }
      output(openPage(year, day, kind as OpenKind));
      return 0;
    }
    case "new": {
      const year = integer(parsed.positionals[0], "Year");
      const day = integer(parsed.positionals[1], "Day");
      output(`Created ${createDayTemplate(year, day, parsed.output)}`);
      return 0;
    }
    case "cache": {
      const cacheDir = getCacheDir();
      if (!existsSync(cacheDir)) {
        output(`No cache directory found yet.\nExpected location: ${cacheDir}`);
      } else {
        output(
          `Cache directory: ${cacheDir}\nCached files: ${countFiles(cacheDir)}\n` +
            "To clear the cache, delete this directory manually.",
        );
      }
      return 0;
    }
    case "doctor": {
      const report = runDoctor();
      output(formatDoctorReport(report));
      return report.hasErrors ? 1 : 0;
    }
    default:
      throw new RangeError(`Unknown command: ${command}`);
  }
}

export function validateCommandArity(
  command: string,
  positionals: string[],
): void {
  const ranges: Record<string, readonly [minimum: number, maximum: number]> = {
    input: [0, 2],
    answer: [4, 4],
    leaderboard: [2, 2],
    guesses: [0, 2],
    status: [0, 1],
    open: [0, 2],
    new: [2, 2],
    cache: [0, 0],
    doctor: [0, 0],
  };
  const range = ranges[command];
  if (!range) return;
  const [minimum, maximum] = range;
  if (positionals.length < minimum || positionals.length > maximum) {
    const expected =
      minimum === maximum ? String(minimum) : `${minimum}–${maximum}`;
    throw new RangeError(
      `Command '${command}' expects ${expected} positional arguments; received ${positionals.length}.`,
    );
  }
}

function countFiles(path: string): number {
  return readdirSync(path, { withFileTypes: true }).reduce(
    (count, entry) =>
      count +
      (entry.isDirectory()
        ? countFiles(join(path, entry.name))
        : entry.isFile()
          ? 1
          : 0),
    0,
  );
}

export async function main(
  arguments_: string[] = process.argv.slice(2),
): Promise<number> {
  if (arguments_.includes("--version") || arguments_.includes("-V")) {
    process.stdout.write(`wassail ${VERSION}\n`);
    return 0;
  }
  if (
    arguments_.length === 0 ||
    arguments_[0] === "--help" ||
    arguments_[0] === "-h"
  ) {
    process.stdout.write(HELP);
    return 0;
  }
  const debug =
    arguments_.includes("--debug") || process.env["WASSAIL_DEBUG"] === "1";
  const filtered = arguments_.filter((argument) => argument !== "--debug");
  const command = filtered.shift() ?? "";
  try {
    return await runCommand(command, filtered);
  } catch (error) {
    if (debug) throw error;
    const prefix = error instanceof WassailError ? "❄️ " : "";
    process.stderr.write(
      `${prefix}${(error as Error).message ?? String(error)}\n`,
    );
    const code = (error as NodeJS.ErrnoException).code;
    return error instanceof RangeError || code?.startsWith("ERR_PARSE_ARGS")
      ? 2
      : 1;
  }
}

export function isEntryPoint(
  moduleUrl: string,
  entryPoint: string | undefined,
): boolean {
  if (!entryPoint) return false;
  try {
    return realpathSync(entryPoint) === realpathSync(fileURLToPath(moduleUrl));
  } catch {
    return false;
  }
}

if (isEntryPoint(import.meta.url, process.argv[1])) {
  process.exitCode = await main();
}
