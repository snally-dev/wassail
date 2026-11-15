import { existsSync, readFileSync } from "node:fs";
import {
  atomicWrite,
  getCacheGuessFile,
  migrateLegacyCacheFile,
  withCacheLock,
} from "./cache.js";
import { aocDateParts, getUnlockStatus, validateEventDay } from "./events.js";
import {
  CacheLockTimeoutError,
  PuzzleLockedError,
  SubmissionError,
} from "./errors.js";
import { AocClient } from "./http.js";
import {
  alreadyCompletedMessage,
  answerTooHighMessage,
  answerTooLowMessage,
  cachedDuplicateMessage,
  cachedHighMessage,
  cachedLowMessage,
  correctAnswerMessage,
  incorrectAnswerMessage,
  recentSubmissionMessage,
  unexpectedResponseMessage,
  wrongLevelMessage,
} from "./messages.js";
import {
  SubmissionStatus,
  type CachedGuessCheck,
  type Guess,
  type SubmissionResult,
} from "./models.js";
import {
  csvEscape,
  looksLikeLoginContent,
  parseCsvLine,
  readGuesses,
  resolveSession,
} from "./utils.js";

const WAIT_CACHE_TTL_MS = 60_000;
const CACHE_FIELDS = ["timestamp", "part", "guess", "status", "retry_at"];
const REQUIRED_FIELDS = ["timestamp", "part", "guess", "status"];

export function normalizeAnswer(answer: number | string): {
  answer: number | string;
  numericAnswer: number | null;
} {
  if (typeof answer === "string") {
    const stripped = answer.trim();
    if (!stripped) throw new RangeError("Answer cannot be empty.");
    const numeric = /^[+-]?\d+$/.test(stripped) ? Number(stripped) : Number.NaN;
    return {
      answer: stripped,
      numericAnswer: Number.isSafeInteger(numeric) ? numeric : null,
    };
  }
  if (!Number.isFinite(answer)) throw new RangeError("Answer must be finite.");
  return {
    answer,
    numericAnswer: Number.isSafeInteger(answer) ? answer : null,
  };
}

export async function submitAnswer(
  year: number,
  day: number,
  level: number,
  answer: number | string,
  session?: string,
): Promise<SubmissionResult> {
  const normalized = normalizeAnswer(answer);
  validateEventDay(year, day);
  if (level !== 1 && level !== 2) {
    throw new RangeError(`Invalid level ${level}. Puzzle parts are 1 or 2.`);
  }
  if (year >= aocDateParts().year) {
    const status = getUnlockStatus(year, day);
    if (!status.unlocked) {
      throw new PuzzleLockedError(year, day, status.now, status.unlockTime);
    }
  }
  const sessionToken = resolveSession(session);
  const legacyCacheFile = getCacheGuessFile(year, day);
  const cacheFile = getCacheGuessFile(year, day, sessionToken);
  try {
    migrateLegacyCacheFile(legacyCacheFile, cacheFile);
  } catch {
    throw new SubmissionError(
      `Failed to migrate guess cache at ${legacyCacheFile}.`,
    );
  }
  const submissionLock = `${cacheFile}.submission`;
  try {
    return await withCacheLock(
      submissionLock,
      async () => {
        if (existsSync(cacheFile)) {
          const cached = checkCachedGuesses(
            year,
            day,
            level,
            normalized.answer,
            normalized.numericAnswer,
            sessionToken,
          );
          if (cached.status !== SubmissionStatus.UNKNOWN) {
            return {
              guess: normalized.answer,
              result: cached.status,
              message: cached.message,
              isCorrect: cached.status === SubmissionStatus.CORRECT,
              isCached: true,
              ...(cached.retryAt ? { retryAt: cached.retryAt } : {}),
            };
          }
        }
        return submitToAoc(year, day, level, normalized.answer, sessionToken);
      },
      { timeoutMs: 30_000, staleAfterMs: 60_000 },
    );
  } catch (error) {
    if (error instanceof CacheLockTimeoutError) {
      throw new SubmissionError(
        "Timed out waiting for another wassail process to finish submitting an answer.",
      );
    }
    throw error;
  }
}

export async function submitToAoc(
  year: number,
  day: number,
  level: number,
  answer: number | string,
  sessionToken: string,
): Promise<SubmissionResult> {
  let response: Response;
  try {
    response = await new AocClient(sessionToken).submitAnswer(
      year,
      day,
      String(answer),
      level,
    );
  } catch (error) {
    if ((error as Error).name === "TimeoutError") {
      throw new SubmissionError(
        "Timed out while submitting answer. Try again or check your network.",
      );
    }
    throw new SubmissionError(
      `Network error while connecting to Advent of Code: ${String(error)}`,
    );
  }
  const responseText = await response.text();
  if (response.status === 404) {
    if (responseText.includes("unlocks it for you")) {
      throw new SubmissionError("Puzzle not yet unlocked.");
    }
    if (
      responseText.includes("Please don't repeatedly request this endpoint")
    ) {
      throw new SubmissionError(
        "Submitting answers too quickly. Please wait before trying again.",
      );
    }
    throw new SubmissionError(
      `Answer endpoint not found for year=${year}, day=${day} (HTTP 404).`,
    );
  }
  if (response.status === 400) {
    throw new SubmissionError(
      "Bad request (HTTP 400). Your session token may be invalid.",
    );
  }
  if (response.status >= 500) {
    throw new SubmissionError(
      `Server error from Advent of Code (HTTP ${response.status}).`,
    );
  }
  if (!response.ok) {
    throw new SubmissionError(
      `Unexpected HTTP status ${response.status} from Advent of Code.`,
    );
  }
  if (looksLikeLoginContent(responseText)) {
    throw new SubmissionError(
      "Session cookie invalid or expired. Update AOC_SESSION with a valid 'session' cookie from your browser.",
    );
  }
  const content = extractArticleText(responseText);
  const classified = classifyMessage(content, answer);
  try {
    await writeGuessCache(
      year,
      day,
      level,
      answer,
      classified.status,
      sessionToken,
      classified.retryAt,
    );
  } catch (error) {
    process.emitWarning(
      `Answer was submitted, but wassail could not update the guess cache: ${String(error)}`,
      { type: "RuntimeWarning" },
    );
  }
  return {
    guess: answer,
    result: classified.status,
    message: classified.message,
    isCorrect: classified.status === SubmissionStatus.CORRECT,
    isCached: false,
    ...(classified.retryAt ? { retryAt: classified.retryAt } : {}),
  };
}

function extractArticleText(html: string): string {
  const article =
    /<article\b[^>]*>([\s\S]*?)<\/article>/i.exec(html)?.[1] ?? "";
  return article
    .replace(/<[^>]+>/g, "")
    .replaceAll("&apos;", "'")
    .replaceAll("&#39;", "'")
    .replaceAll("&quot;", '"')
    .replaceAll("&amp;", "&")
    .trim();
}

export function classifyMessage(
  content: string,
  answer: number | string,
  now = new Date(),
): { status: SubmissionStatus; message: string; retryAt?: Date } {
  if (!content) {
    return {
      status: SubmissionStatus.UNKNOWN,
      message: "Answer submitted, but no response message found.",
    };
  }
  if (content.includes("That's the right answer")) {
    return {
      status: SubmissionStatus.CORRECT,
      message: correctAnswerMessage(answer),
    };
  }
  if (content.includes("too high")) {
    return {
      status: SubmissionStatus.TOO_HIGH,
      message: answerTooHighMessage(answer),
    };
  }
  if (content.includes("too low")) {
    return {
      status: SubmissionStatus.TOO_LOW,
      message: answerTooLowMessage(answer),
    };
  }
  if (content.includes("You gave an answer too recently")) {
    const match = /You have (?:(\d+)m )?(\d+)s left to wait/.exec(content);
    const retryAt = new Date(
      now.valueOf() +
        (match
          ? (Number(match[1] ?? 0) * 60 + Number(match[2])) * 1000
          : WAIT_CACHE_TTL_MS),
    );
    return {
      status: SubmissionStatus.WAIT,
      message: waitMessage(retryAt, false),
      retryAt,
    };
  }
  if (content.includes("Did you already complete it")) {
    return {
      status: SubmissionStatus.COMPLETED,
      message: alreadyCompletedMessage(),
    };
  }
  if (content.includes("You don't seem to be solving the right level")) {
    return { status: SubmissionStatus.INCORRECT, message: wrongLevelMessage() };
  }
  if (content.includes("That's not the right answer")) {
    return {
      status: SubmissionStatus.INCORRECT,
      message: incorrectAnswerMessage(answer),
    };
  }
  return {
    status: SubmissionStatus.UNKNOWN,
    message: unexpectedResponseMessage(),
  };
}

export async function writeGuessCache(
  year: number,
  day: number,
  part: number,
  guess: number | string,
  status: SubmissionStatus,
  sessionToken?: string,
  retryAt?: Date,
): Promise<void> {
  const cacheFile = getCacheGuessFile(year, day, sessionToken);
  const normalized = normalizeAnswer(guess).answer;
  try {
    await withCacheLock(
      cacheFile,
      () => {
        const existing = existsSync(cacheFile)
          ? readFileSync(cacheFile, "utf8")
          : "";
        atomicWrite(
          cacheFile,
          updatedGuessCache(existing, {
            timestamp: new Date().toISOString(),
            part: String(part),
            guess: String(normalized),
            status: status.toUpperCase(),
            retry_at: retryAt?.toISOString() ?? "",
          }),
        );
      },
      { timeoutMs: 10_000, staleAfterMs: 30_000 },
    );
  } catch (error) {
    throw new Error(
      `Failed to write guess cache ${cacheFile}: ${String(error)}`,
    );
  }
}

function updatedGuessCache(
  existing: string,
  row: Record<string, string>,
): string {
  let fields = [...CACHE_FIELDS];
  const rows: Record<string, string>[] = [];
  if (existing) {
    const lines = existing.split(/\r?\n/).filter(Boolean);
    fields = parseCsvLine(lines.shift() ?? "");
    if (
      new Set(fields).size !== fields.length ||
      !REQUIRED_FIELDS.every((field) => fields.includes(field))
    ) {
      throw new Error(
        "Guess cache has a malformed header; refusing to overwrite it.",
      );
    }
    if (!fields.includes("retry_at")) fields.push("retry_at");
    for (const line of lines) {
      const values = parseCsvLine(line);
      if (values.length > fields.length) {
        throw new Error(
          "Guess cache has a malformed row; refusing to overwrite it.",
        );
      }
      rows.push(
        Object.fromEntries(
          fields.map((field, index) => [field, values[index] ?? ""]),
        ),
      );
    }
  }
  rows.push(row);
  return `${fields.join(",")}\n${rows
    .map((item) =>
      fields.map((field) => csvEscape(item[field] ?? "")).join(","),
    )
    .join("\n")}\n`;
}

export function checkCachedGuesses(
  year: number,
  day: number,
  level: number,
  answer: number | string,
  numericAnswer: number | null,
  sessionToken?: string,
): CachedGuessCheck {
  const guesses = readGuesses(year, day, sessionToken);
  const now = new Date();
  let highestLow: Guess | undefined;
  let lowestHigh: Guess | undefined;
  let completed: Guess | undefined;
  let wait: Guess | undefined;
  let duplicate: Guess | undefined;
  for (const guess of guesses) {
    if (guess.part !== level) continue;
    if (guess.status === SubmissionStatus.WAIT && retryAtFor(guess) > now)
      wait = guess;
    else if (wait && guess.timestamp >= wait.timestamp) wait = undefined;
    const same =
      guess.guess === answer ||
      (numericAnswer !== null &&
        typeof guess.guess === "number" &&
        guess.guess === numericAnswer);
    if (same && guess.status !== SubmissionStatus.WAIT) duplicate = guess;
    if (
      guess.status === SubmissionStatus.CORRECT ||
      guess.status === SubmissionStatus.COMPLETED
    ) {
      completed = guess;
    } else if (
      guess.status === SubmissionStatus.TOO_LOW &&
      numericAnswer !== null &&
      typeof guess.guess === "number" &&
      (!highestLow || guess.guess > Number(highestLow.guess))
    ) {
      highestLow = guess;
    } else if (
      guess.status === SubmissionStatus.TOO_HIGH &&
      numericAnswer !== null &&
      typeof guess.guess === "number" &&
      (!lowestHigh || guess.guess < Number(lowestHigh.guess))
    ) {
      lowestHigh = guess;
    }
  }
  if (duplicate?.status === SubmissionStatus.CORRECT) {
    return cachedCheck(
      answer,
      duplicate.status,
      cachedDuplicateMessage(answer, duplicate),
      duplicate,
    );
  }
  if (completed) {
    return {
      guess: answer,
      previousGuess: null,
      previousTimestamp: completed.timestamp,
      status: SubmissionStatus.COMPLETED,
      message: alreadyCompletedMessage(),
    };
  }
  if (wait) {
    const retryAt = retryAtFor(wait);
    return {
      guess: answer,
      previousGuess: null,
      previousTimestamp: wait.timestamp,
      status: SubmissionStatus.WAIT,
      message: waitMessage(retryAt, true),
      retryAt,
    };
  }
  if (duplicate) {
    return cachedCheck(
      answer,
      duplicate.status,
      cachedDuplicateMessage(answer, duplicate),
      duplicate,
    );
  }
  if (
    numericAnswer !== null &&
    highestLow &&
    typeof highestLow.guess === "number" &&
    numericAnswer <= highestLow.guess
  ) {
    return cachedCheck(
      answer,
      SubmissionStatus.TOO_LOW,
      cachedLowMessage(answer, highestLow),
      highestLow,
    );
  }
  if (
    numericAnswer !== null &&
    lowestHigh &&
    typeof lowestHigh.guess === "number" &&
    numericAnswer >= lowestHigh.guess
  ) {
    return cachedCheck(
      answer,
      SubmissionStatus.TOO_HIGH,
      cachedHighMessage(answer, lowestHigh),
      lowestHigh,
    );
  }
  return {
    guess: answer,
    previousGuess: null,
    previousTimestamp: null,
    status: SubmissionStatus.UNKNOWN,
    message: "This is a unique guess.",
  };
}

function cachedCheck(
  answer: number | string,
  status: SubmissionStatus,
  message: string,
  previous: Guess,
): CachedGuessCheck {
  return {
    guess: answer,
    previousGuess: previous.guess,
    previousTimestamp: previous.timestamp,
    status,
    message,
  };
}

const retryAtFor = (guess: Guess) =>
  guess.retryAt ?? new Date(guess.timestamp.valueOf() + WAIT_CACHE_TTL_MS);

function waitMessage(retryAt: Date, cached: boolean): string {
  const timestamp = retryAt
    .toISOString()
    .replace("T", " ")
    .replace(/\.\d{3}Z$/, " UTC");
  return `${recentSubmissionMessage()} ${cached ? "Cached locally; " : ""}try again after ${timestamp}.`;
}
