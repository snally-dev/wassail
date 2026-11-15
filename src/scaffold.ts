import { mkdirSync, openSync, closeSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { validateEventDay } from "./events.js";
import { TemplateCreationError } from "./errors.js";

const TEMPLATE = `// %% Setup
import { getPuzzleInput, parseInput } from "wassail";

const YEAR = 2025;
const DAY = 1;
const USE_SAMPLE = false;

// %% Load Input
const sample = \`\`.trim();
const raw = USE_SAMPLE ? sample : await getPuzzleInput(YEAR, DAY);
const lines = parseInput(raw);

// %% Parse Input
// Adapt this to the puzzle.
const data = lines;

// %% Explore
// Keep scratch variables here so they are easy to inspect and reuse.
// const preview = data.slice(0, 5);

// %% Part 1
function solvePart1(input: string[]): number | string | undefined {
  void input;
  // Implement your solution.
  return undefined;
}

const part1Answer = solvePart1(data);
console.log("Part 1:", part1Answer);

// %% Part 2
function solvePart2(input: string[]): number | string | undefined {
  void input;
  // Implement your solution, reusing the parsed data where helpful.
  return undefined;
}

const part2Answer = solvePart2(data);
console.log("Part 2:", part2Answer);

// %% Submit Answers
// Run either line manually only after checking the corresponding answer.
// import { submitPuzzleAnswer } from "wassail";
// if (part1Answer !== undefined) await submitPuzzleAnswer(YEAR, DAY, 1, part1Answer);
// if (part2Answer !== undefined) await submitPuzzleAnswer(YEAR, DAY, 2, part2Answer);
`;

export function renderDayTemplate(year: number, day: number): string {
  try {
    validateEventDay(year, day);
  } catch (error) {
    throw new TemplateCreationError((error as Error).message);
  }
  return TEMPLATE.replace("const YEAR = 2025", `const YEAR = ${year}`).replace(
    "const DAY = 1",
    `const DAY = ${day}`,
  );
}

export function createDayTemplate(
  year: number,
  day: number,
  output?: string,
): string {
  const destination =
    output ?? join(String(year), `day${String(day).padStart(2, "0")}.ts`);
  const source = renderDayTemplate(year, day);
  let descriptor: number | undefined;
  try {
    mkdirSync(dirname(destination), { recursive: true });
    descriptor = openSync(destination, "wx");
    writeFileSync(descriptor, source, "utf8");
    closeSync(descriptor);
  } catch (error) {
    if (descriptor !== undefined) closeSync(descriptor);
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      throw new TemplateCreationError(
        `Refusing to overwrite existing path: ${destination}`,
      );
    }
    throw new TemplateCreationError(
      `Could not create puzzle template at ${destination}: ${String(error)}`,
    );
  }
  return destination;
}
