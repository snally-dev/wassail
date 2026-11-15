import { existsSync, readFileSync, statSync } from "node:fs";
import {
  atomicWrite,
  getCacheLeaderboardFile,
  withCacheLock,
} from "./cache.js";
import {
  CacheLockTimeoutError,
  LeaderboardFetchError,
  MissingSessionTokenError,
} from "./errors.js";
import { AocClient } from "./http.js";
import {
  OutputFormat,
  type Leaderboard,
  type Member,
  type Table,
} from "./models.js";
import { csvEscape, handleHttpErrors, resolveSession } from "./utils.js";

export const LEADERBOARD_CACHE_TTL_MS = 15 * 60 * 1000;
type JsonObject = Record<string, unknown>;

export async function getLeaderboard(
  year: number,
  session: string | undefined,
  boardId: number,
  viewKey?: string,
  format: OutputFormat = OutputFormat.MODEL,
): Promise<Leaderboard | string | Table> {
  if (!Number.isInteger(year) || year < 2015) {
    throw new RangeError(
      `Invalid year ${year}. Advent of Code started in 2015.`,
    );
  }
  if (!Number.isInteger(boardId) || boardId <= 0) {
    throw new RangeError("Board ID must be a positive integer.");
  }
  const sessionToken = viewKey
    ? (session ?? process.env["AOC_SESSION"])
    : resolveSession(session);
  if (!sessionToken && !viewKey) throw new MissingSessionTokenError();
  const cacheFile = getCacheLeaderboardFile(year, boardId, {
    ...(sessionToken ? { sessionToken } : {}),
    ...(viewKey ? { viewKey } : {}),
  });
  let payload = readFreshCache(cacheFile);
  if (!payload) {
    try {
      payload = await withCacheLock(
        cacheFile,
        async () => {
          const fresh = readFreshCache(cacheFile);
          if (fresh) return fresh;
          const fetched = await fetchLeaderboardPayload(
            year,
            boardId,
            sessionToken,
            viewKey,
          );
          try {
            atomicWrite(cacheFile, JSON.stringify(fetched));
          } catch (error) {
            process.emitWarning(
              `Could not write leaderboard cache ${cacheFile}: ${String(error)}`,
              { type: "RuntimeWarning" },
            );
          }
          return fetched;
        },
        { timeoutMs: 60_000, staleAfterMs: 120_000 },
      );
    } catch (error) {
      if (error instanceof CacheLockTimeoutError) {
        throw new LeaderboardFetchError(
          "Timed out waiting for another wassail process to refresh the leaderboard cache.",
        );
      }
      throw error;
    }
  }
  const leaderboard = parseLeaderboard(payload);
  switch (format) {
    case OutputFormat.MODEL:
      return leaderboard;
    case OutputFormat.JSON:
      return JSON.stringify(payload, null, 2);
    case OutputFormat.CSV:
      return formatLeaderboardAsCsv(leaderboard, year, boardId);
    case OutputFormat.TABLE:
      return formatLeaderboardAsTable(leaderboard);
    default:
      throw new RangeError(`Unsupported output format: ${String(format)}`);
  }
}

async function fetchLeaderboardPayload(
  year: number,
  boardId: number,
  sessionToken?: string,
  viewKey?: string,
): Promise<JsonObject> {
  let response: Response;
  try {
    response = await new AocClient(sessionToken).fetchLeaderboard(
      year,
      boardId,
      viewKey,
    );
  } catch (error) {
    if ((error as Error).name === "TimeoutError") {
      throw new LeaderboardFetchError(
        "Timed out while fetching leaderboard. Try again or check your network.",
      );
    }
    throw new LeaderboardFetchError(
      `Network error while connecting to Advent of Code: ${String(error)}`,
    );
  }
  await handleHttpErrors(response, LeaderboardFetchError, {
    notFound: `Leaderboard not found for year=${year}, board_id=${boardId} (HTTP 404).`,
    badRequest:
      "Bad request (HTTP 400). Your session token or view key may be invalid.",
    serverError:
      "Server error from Advent of Code (HTTP {statusCode}). Your session token may be invalid.",
  });
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new LeaderboardFetchError(
      "Failed to decode leaderboard JSON. Your session/view key may be invalid.",
    );
  }
  if (!isObject(payload)) {
    throw new LeaderboardFetchError(
      "Unexpected leaderboard schema from Advent of Code.",
    );
  }
  parseLeaderboard(payload);
  return payload;
}

function readFreshCache(cacheFile: string): JsonObject | undefined {
  if (!existsSync(cacheFile)) return undefined;
  let age: number;
  try {
    age = Date.now() - statSync(cacheFile).mtimeMs;
  } catch {
    throw new LeaderboardFetchError(
      `Could not inspect leaderboard cache ${cacheFile}.`,
    );
  }
  if (age > LEADERBOARD_CACHE_TTL_MS) return undefined;
  try {
    const payload: unknown = JSON.parse(readFileSync(cacheFile, "utf8"));
    if (!isObject(payload)) throw new Error("Expected an object");
    parseLeaderboard(payload);
    return payload;
  } catch (error) {
    throw new LeaderboardFetchError(
      "The fresh leaderboard cache is unreadable or malformed. " +
        "Wassail will not request the leaderboard again within AoC's 15-minute interval; " +
        `retry after the interval has elapsed. Cache: ${cacheFile}. Cause: ${String(error)}`,
    );
  }
}

export function parseLeaderboard(payload: JsonObject): Leaderboard {
  try {
    const membersValue = requiredObject(payload, "members");
    const members: Record<number, Member> = {};
    for (const [key, rawMember] of Object.entries(membersValue)) {
      if (!isObject(rawMember)) throw new TypeError("Invalid member");
      const completionRaw = requiredObject(rawMember, "completion_day_level");
      const completionDayLevel: Member["completionDayLevel"] = {};
      for (const [day, rawParts] of Object.entries(completionRaw)) {
        if (!isObject(rawParts)) throw new TypeError("Invalid day completion");
        const parts: Record<number, { getStarTs: number; starIndex: number }> =
          {};
        for (const [part, rawCompletion] of Object.entries(rawParts)) {
          if (!isObject(rawCompletion))
            throw new TypeError("Invalid star completion");
          parts[Number(part)] = {
            getStarTs: requiredNumber(rawCompletion, "get_star_ts"),
            starIndex: requiredNumber(rawCompletion, "star_index"),
          };
        }
        completionDayLevel[Number(day)] = parts;
      }
      members[Number(key)] = {
        id: requiredNumber(rawMember, "id"),
        name:
          rawMember["name"] === null ? null : requiredString(rawMember, "name"),
        lastStarTs: requiredNumber(rawMember, "last_star_ts"),
        stars: requiredNumber(rawMember, "stars"),
        localScore: requiredNumber(rawMember, "local_score"),
        completionDayLevel,
      };
    }
    return {
      numDays: requiredNumber(payload, "num_days"),
      event: requiredString(payload, "event"),
      day1Ts: requiredNumber(payload, "day1_ts"),
      ownerId: requiredNumber(payload, "owner_id"),
      members,
    };
  } catch {
    throw new LeaderboardFetchError(
      "Unexpected leaderboard schema from Advent of Code.",
    );
  }
}

function rankedMembers(leaderboard: Leaderboard): Member[] {
  return Object.values(leaderboard.members).sort(
    (left, right) =>
      right.localScore - left.localScore ||
      right.stars - left.stars ||
      left.id - right.id,
  );
}

function firstStarTimestamp(member: Member): number | undefined {
  const timestamps = Object.values(member.completionDayLevel).flatMap((parts) =>
    Object.values(parts).map((completion) => completion.getStarTs),
  );
  return timestamps.length > 0 ? Math.min(...timestamps) : undefined;
}

const formatTimestamp = (timestamp: number | undefined, csv = false) => {
  if (!timestamp) return csv ? "" : "-";
  const iso = new Date(timestamp * 1000).toISOString();
  return csv
    ? iso.replace(".000Z", "Z")
    : iso.replace("T", " ").replace(".000Z", "");
};

export function formatLeaderboardAsCsv(
  leaderboard: Leaderboard,
  year: number,
  boardId: number,
): string {
  const headers = [
    "year",
    "board_id",
    "rank",
    "member_id",
    "name",
    "stars",
    "local_score",
    "first_star_utc",
    "last_star_utc",
  ];
  const rows = rankedMembers(leaderboard).map((member, index) => [
    year,
    boardId,
    index + 1,
    member.id,
    member.name ?? "<anonymous>",
    member.stars,
    member.localScore,
    formatTimestamp(firstStarTimestamp(member), true),
    formatTimestamp(member.lastStarTs, true),
  ]);
  return `${headers.join(",")}\n${rows.map((row) => row.map(csvEscape).join(",")).join("\n")}\n`;
}

export function formatLeaderboardAsTable(leaderboard: Leaderboard): Table {
  return {
    title: `Advent of Code ${leaderboard.event} – Private Leaderboard`,
    headers: [
      "Rank",
      "Name",
      "Stars",
      "Local Score",
      "First Star (UTC)",
      "Last Star (UTC)",
    ],
    rows: rankedMembers(leaderboard).map((member, index) => [
      String(index + 1),
      member.name ?? "<anonymous>",
      String(member.stars),
      String(member.localScore),
      formatTimestamp(firstStarTimestamp(member)),
      formatTimestamp(member.lastStarTs),
    ]),
  };
}

const isObject = (value: unknown): value is JsonObject =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const requiredObject = (value: JsonObject, key: string): JsonObject => {
  const found = value[key];
  if (!isObject(found)) throw new TypeError(key);
  return found;
};
const requiredNumber = (value: JsonObject, key: string): number => {
  const found = value[key];
  if (typeof found !== "number" || !Number.isFinite(found))
    throw new TypeError(key);
  return found;
};
const requiredString = (value: JsonObject, key: string): string => {
  const found = value[key];
  if (typeof found !== "string") throw new TypeError(key);
  return found;
};
