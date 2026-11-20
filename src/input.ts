import { existsSync, readFileSync } from "node:fs";
import {
  atomicWrite,
  getCacheInputFile,
  migrateLegacyCacheFile,
} from "./cache.js";
import { aocDateParts, getUnlockStatus, validateEventDay } from "./events.js";
import { InputFetchError, PuzzleLockedError } from "./errors.js";
import { AocClient, isTimeoutError } from "./http.js";
import {
  handleHttpErrors,
  looksLikeLoginContent,
  resolveSession,
} from "./utils.js";

export async function getInput(
  year: number,
  day: number,
  session?: string,
): Promise<string> {
  validateEventDay(year, day);
  const sessionToken = resolveSession(session);
  const legacyCacheFile = getCacheInputFile(year, day);
  const cacheFile = getCacheInputFile(year, day, sessionToken);
  try {
    migrateLegacyCacheFile(legacyCacheFile, cacheFile);
    if (existsSync(cacheFile)) {
      const cachedInput = readFileSync(cacheFile, "utf8");
      if (!looksLikeLoginContent(cachedInput)) return cachedInput;
    }
  } catch {
    // A damaged cache should not prevent a fresh fetch.
  }

  if (year >= aocDateParts().year) {
    const status = getUnlockStatus(year, day);
    if (!status.unlocked) {
      throw new PuzzleLockedError(year, day, status.now, status.unlockTime);
    }
  }

  let response: Response;
  try {
    response = await new AocClient(sessionToken).fetchInput(year, day);
  } catch (error) {
    if (isTimeoutError(error)) {
      throw new InputFetchError(
        "Timed out while fetching puzzle input. Try again or check your network.",
      );
    }
    throw new InputFetchError(
      `Network error while connecting to Advent of Code: ${String(error)}`,
    );
  }
  await handleHttpErrors(response, InputFetchError, {
    notFound: `Input not found for year=${year}, day=${day} (HTTP 404).`,
    badRequest: "Bad request (HTTP 400). Your session token may be invalid.",
    serverError:
      "Server error from Advent of Code (HTTP {statusCode}). Your session token may be invalid.",
  });
  let input: string;
  try {
    input = await response.text();
  } catch (error) {
    const detail = isTimeoutError(error)
      ? "Timed out while reading the puzzle input response."
      : `Failed while reading the puzzle input response: ${String(error)}`;
    throw new InputFetchError(detail);
  }
  if (looksLikeLoginContent(input)) {
    throw new InputFetchError(
      "Session cookie invalid or expired. Update AOC_SESSION with a valid 'session' cookie from your browser.",
    );
  }
  try {
    atomicWrite(cacheFile, input);
  } catch {
    throw new InputFetchError(`Failed to cache puzzle input at ${cacheFile}.`);
  }
  return input;
}
