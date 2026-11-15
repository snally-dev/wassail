import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { getCacheDir, getCacheGuessFile } from "./cache.js";
import { WassailError } from "./errors.js";
import { SubmissionStatus, type Guess, type Table } from "./models.js";
import { readGuesses } from "./utils.js";

export function getGuesses(
  year: number,
  day: number,
  session?: string,
): Table[] {
  const cacheFile = resolveGuessFile(year, day, session);
  if (!existsSync(cacheFile)) {
    throw new WassailError(
      `No cached guesses found yet for ${year}-12-${String(day).padStart(2, "0")}. ` +
        "Submit an answer before viewing guess history.",
    );
  }
  return renderGuessTables(readGuesses(year, day, session, cacheFile));
}

function resolveGuessFile(year: number, day: number, session?: string): string {
  if (session) return getCacheGuessFile(year, day, session);
  const legacy = getCacheGuessFile(year, day);
  if (existsSync(legacy)) return legacy;
  const accounts = join(getCacheDir(), "accounts");
  const matches = existsSync(accounts)
    ? readdirSync(accounts)
        .map((account) =>
          join(
            accounts,
            account,
            String(year).padStart(4, "0"),
            String(day).padStart(2, "0"),
            "guesses.csv",
          ),
        )
        .filter(existsSync)
    : [];
  if (matches.length === 1) return matches[0] ?? legacy;
  if (matches.length > 1) {
    throw new WassailError(
      "Guess history exists for multiple accounts. Set AOC_SESSION or pass --session to choose one.",
    );
  }
  return legacy;
}

export function renderGuessTables(guesses: Guess[]): Table[] {
  const sorted = [...guesses].sort(
    (left, right) => left.timestamp.valueOf() - right.timestamp.valueOf(),
  );
  return [1, 2].map((part) => ({
    title: `Guess History – Part ${part}`,
    headers: ["Time (UTC)", "Guess", "Status"],
    rows: sorted
      .filter((guess) => guess.part === part)
      .map((guess) => [
        guess.timestamp.toISOString().replace("T", " ").slice(0, 19),
        String(guess.guess),
        statusLabel(guess),
      ]),
  }));
}

function statusLabel(guess: Guess): string {
  switch (guess.status) {
    case SubmissionStatus.CORRECT:
      return "Correct";
    case SubmissionStatus.COMPLETED:
      return "Completed";
    case SubmissionStatus.INCORRECT:
      return "Incorrect";
    case SubmissionStatus.TOO_HIGH:
      return "Too High";
    case SubmissionStatus.TOO_LOW:
      return "Too Low";
    case SubmissionStatus.WAIT:
      return guess.retryAt
        ? `Wait until ${guess.retryAt.toISOString().slice(11, 19)} UTC`
        : "Wait";
    default:
      return "Unknown";
  }
}
