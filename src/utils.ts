import { existsSync, readFileSync } from "node:fs";
import { getCacheGuessFile } from "./cache.js";
import { MissingSessionTokenError, WassailError } from "./errors.js";
import { SubmissionStatus, type Guess } from "./models.js";

export function resolveSession(session?: string): string {
  if (session) return session;
  const environmentSession = process.env["AOC_SESSION"];
  if (environmentSession) return environmentSession;
  throw new MissingSessionTokenError();
}

export function looksLikeLoginContent(content: string): boolean {
  return [
    "To play, please identify yourself",
    "/auth/login",
    'name="session"',
  ].some((marker) => content.includes(marker));
}

export async function handleHttpErrors(
  response: Response,
  ErrorClass: new (message: string) => WassailError,
  messages: {
    notFound: string;
    badRequest: string;
    serverError: string;
    unexpected?: string;
  },
): Promise<void> {
  const format = (message: string) =>
    message.replaceAll("{statusCode}", String(response.status));
  if (response.status === 404) throw new ErrorClass(format(messages.notFound));
  if (response.status === 400)
    throw new ErrorClass(format(messages.badRequest));
  if (response.status >= 500)
    throw new ErrorClass(format(messages.serverError));
  if (!response.ok) {
    throw new ErrorClass(
      format(messages.unexpected ?? "Unexpected HTTP error: {statusCode}."),
    );
  }
}

export function parseInput(input: string): string[] {
  if (input === "") return [];
  const lines = input.split(/\r?\n|\r/);
  if (input.endsWith("\n") || input.endsWith("\r")) lines.pop();
  return lines;
}

export function readInput(path: string): string {
  if (!existsSync(path)) {
    throw new Error(
      `Input file not found: ${path}. Please add the missing file.`,
    );
  }
  return readFileSync(path, "utf8").trim();
}

export function parseCsvLine(line: string): string[] {
  const values: string[] = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') {
        value += '"';
        index += 1;
      } else quoted = !quoted;
    } else if (character === "," && !quoted) {
      values.push(value);
      value = "";
    } else value += character;
  }
  values.push(value);
  return values;
}

export function csvEscape(
  value: string | number | boolean | null | undefined,
): string {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function readGuesses(
  year: number,
  day: number,
  sessionToken?: string,
  cacheFile: string = getCacheGuessFile(year, day, sessionToken),
): Guess[] {
  if (!existsSync(cacheFile)) return [];
  let content: string;
  try {
    content = readFileSync(cacheFile, "utf8");
  } catch (error) {
    throw new WassailError(
      `Failed reading guess cache ${cacheFile}: ${String(error)}`,
    );
  }
  const lines = content.split(/\r?\n/).filter(Boolean);
  const headers = parseCsvLine(lines.shift() ?? "");
  const guesses: Guess[] = [];
  let skipped = 0;
  for (const line of lines) {
    const values = parseCsvLine(line);
    const row = Object.fromEntries(
      headers.map((header, index) => [header, values[index] ?? ""]),
    );
    const part = Number(row["part"]);
    const timestamp = new Date(row["timestamp"] ?? "");
    if (!Number.isInteger(part) || Number.isNaN(timestamp.valueOf())) {
      skipped += 1;
      continue;
    }
    const guessText = (row["guess"] ?? "").trim();
    const numeric = /^[+-]?\d+$/.test(guessText)
      ? Number(guessText)
      : Number.NaN;
    const statusValue = (row["status"] ?? "unknown").toLowerCase();
    const knownStatuses = Object.values(SubmissionStatus) as string[];
    const status = knownStatuses.includes(statusValue)
      ? (statusValue as SubmissionStatus)
      : SubmissionStatus.UNKNOWN;
    const retryText = row["retry_at"];
    const retryAt = retryText ? new Date(retryText) : undefined;
    guesses.push({
      timestamp,
      part,
      guess: Number.isSafeInteger(numeric) ? numeric : guessText,
      status,
      ...(retryAt && !Number.isNaN(retryAt.valueOf()) ? { retryAt } : {}),
    });
  }
  if (skipped > 0) {
    process.emitWarning(
      `Skipped ${skipped} malformed guess cache rows in ${cacheFile}.`,
    );
  }
  return guesses.sort(
    (left, right) =>
      left.timestamp.valueOf() - right.timestamp.valueOf() ||
      left.part - right.part ||
      String(left.guess).localeCompare(String(right.guess)),
  );
}
