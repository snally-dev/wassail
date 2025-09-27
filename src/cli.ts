import { parseArgs } from "node:util";
import { fetchInput } from "./aoc.js";

const HELP = `wassail

Usage:
  wassail [--year <yyyy>] [--day <d>]        # defaults to 'fetch'
  wassail <command> [options]

Commands:
  fetch      Fetch puzzle input (default)
  submit     Submit an answer (coming soon)
  board      Show private leaderboard (coming soon)

Options:
  -y, --year   Year (defaults to current year)
  -d, --day    Day  (defaults to 1)
  -h, --help   Show help

Examples:
  wassail --year 2025 --day 1
  wassail fetch --year 2025 --day 1
`;

async function main() {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: {
      year: { type: "string", short: "y" },
      day: { type: "string", short: "d" },
      help: { type: "boolean", short: "h" },
    },
  });

  if (values.help) {
    console.log(HELP);
    return;
  }

  const [maybeCmd] = positionals;
  const cmd = maybeCmd && !maybeCmd.startsWith("-") ? maybeCmd : "fetch";

  const now = new Date();
  const year = values.year ? Number(values.year) : now.getFullYear();
  const day = values.day ? Number(values.day) : 1;

  if (!Number.isFinite(year) || year < 2015) {
    console.error("Invalid year. Example: --year 2025");
    process.exit(1);
  }
  if (!Number.isFinite(day) || day < 1 || day > 25) {
    console.error("Invalid day. Use 1 - 25.");
    process.exit(1);
  }

  switch (cmd) {
    case "fetch": {
      const session = process.env["AOC_SESSION"];
      if (!session) {
        console.error("Missing AOC_SESSION in environment.");
        process.exit(1);
      }
      try {
        const text = await fetchInput(session, year, day);
        process.stdout.write(text + "\n");
      } catch (err: unknown) {
        console.error(err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
      break;
    }

    case "submit":
    case "board": {
      console.error(
        `'${cmd}' is not implemented yet. Try: wassail fetch --year ${year} --day ${day}`,
      );
      process.exit(2);
      break;
    }

    default: {
      console.error(`Unknown command: ${cmd}\n`);
      console.log(HELP);
      process.exit(1);
    }
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
