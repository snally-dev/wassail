import { submitAnswer } from "./answer.js";
import { getInput } from "./input.js";
import { getLeaderboard } from "./leaderboard.js";
import {
  OutputFormat,
  type Leaderboard,
  type SubmissionResult,
  type Table,
  type YearStatus,
} from "./models.js";
import { getStatus } from "./status.js";

export function getPuzzleInput(
  year: number,
  day: number,
  session?: string,
): Promise<string> {
  return getInput(year, day, session);
}

export function submitPuzzleAnswer(
  year: number,
  day: number,
  part: number,
  answer: number | string,
  session?: string,
): Promise<SubmissionResult> {
  return submitAnswer(year, day, part, answer, session);
}

export function getPrivateLeaderboard(
  year: number,
  boardId: number,
  session?: string,
  viewKey?: string,
  format: OutputFormat = OutputFormat.MODEL,
): Promise<Leaderboard | string | Table> {
  return getLeaderboard(year, session, boardId, viewKey, format);
}

export function getUserStatus(
  year: number,
  session?: string,
  format: OutputFormat = OutputFormat.MODEL,
): Promise<YearStatus | string | Table> {
  return getStatus(year, session, format);
}
