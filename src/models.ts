export const SubmissionStatus = {
  CORRECT: "correct",
  INCORRECT: "incorrect",
  TOO_HIGH: "too_high",
  TOO_LOW: "too_low",
  WAIT: "wait",
  COMPLETED: "completed",
  UNKNOWN: "unknown",
} as const;

export type SubmissionStatus =
  (typeof SubmissionStatus)[keyof typeof SubmissionStatus];

export const OutputFormat = {
  MODEL: "model",
  TABLE: "table",
  JSON: "json",
  CSV: "csv",
} as const;

export type OutputFormat = (typeof OutputFormat)[keyof typeof OutputFormat];

export const OpenKind = {
  WEBSITE: "website",
  PUZZLE: "puzzle",
  INPUT: "input",
} as const;

export type OpenKind = (typeof OpenKind)[keyof typeof OpenKind];

export interface StarCompletion {
  getStarTs: number;
  starIndex: number;
}

export interface Member {
  id: number;
  name: string | null;
  lastStarTs: number;
  stars: number;
  localScore: number;
  completionDayLevel: Record<number, Record<number, StarCompletion>>;
}

export interface Leaderboard {
  numDays: number;
  event: string;
  day1Ts: number;
  ownerId: number;
  members: Record<number, Member>;
}

export interface SubmissionResult {
  guess: number | string;
  result: SubmissionStatus;
  message: string;
  isCorrect: boolean;
  isCached: boolean;
  retryAt?: Date;
}

export interface Guess {
  timestamp: Date;
  part: number;
  guess: number | string;
  status: SubmissionStatus;
  retryAt?: Date;
}

export interface CachedGuessCheck {
  guess: number | string;
  previousGuess: number | string | null;
  previousTimestamp: Date | null;
  status: SubmissionStatus;
  message: string;
  retryAt?: Date;
}

export interface UnlockStatus {
  unlocked: boolean;
  now: Date;
  unlockTime: Date;
}

export interface DayStatus {
  day: number;
  stars: number;
  href: string;
  ariaLabel: string;
  isLocked: boolean;
}

export interface YearStatus {
  year: number;
  username: string;
  isSupporter: boolean;
  totalStars: number;
  days: DayStatus[];
}

export interface Table {
  title: string;
  headers: string[];
  rows: string[][];
}
