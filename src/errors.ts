export class WassailError extends Error {
  override name = "WassailError";
}

export class InputFetchError extends WassailError {
  override name = "InputFetchError";
}

export class LeaderboardFetchError extends WassailError {
  override name = "LeaderboardFetchError";
}

export class StatusFetchError extends WassailError {
  override name = "StatusFetchError";
}

export class SubmissionError extends WassailError {
  override name = "SubmissionError";
}

export class TemplateCreationError extends WassailError {
  override name = "TemplateCreationError";
}

export class MissingSessionTokenError extends WassailError {
  override name = "MissingSessionTokenError";

  constructor(environmentVariable = "AOC_SESSION") {
    super(
      `Session token is missing. Set the '${environmentVariable}' environment variable or pass the session token explicitly.`,
    );
  }
}

export class PuzzleLockedError extends WassailError {
  override name = "PuzzleLockedError";

  constructor(
    public readonly year: number,
    public readonly day: number,
    public readonly now: Date,
    public readonly unlockTime: Date,
  ) {
    super(
      `Puzzle ${year}-12-${String(day).padStart(2, "0")} is not unlocked yet. ` +
        `Current AoC time is ${now.toISOString()}, unlocks at ${unlockTime.toISOString()}.`,
    );
  }
}

export class CacheLockTimeoutError extends Error {
  override name = "CacheLockTimeoutError";
}
