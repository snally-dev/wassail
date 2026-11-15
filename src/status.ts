import { aocDateParts } from "./events.js";
import { StatusFetchError } from "./errors.js";
import { AocClient } from "./http.js";
import {
  OutputFormat,
  type DayStatus,
  type Table,
  type YearStatus,
} from "./models.js";
import { handleHttpErrors, resolveSession } from "./utils.js";

export async function getStatus(
  year: number,
  session: string | undefined,
  format: OutputFormat,
): Promise<YearStatus | string | Table> {
  if (format === OutputFormat.CSV) {
    throw new RangeError(
      "CSV output is only supported for private leaderboards.",
    );
  }
  const sessionToken = resolveSession(session);
  const currentYear = aocDateParts().year;
  if (!Number.isInteger(year) || year > currentYear) {
    throw new RangeError(
      `Invalid year ${year}. Advent of Code years are up to ${currentYear}.`,
    );
  }
  if (year < 2015) {
    throw new RangeError(
      `Invalid year ${year}. Advent of Code started in 2015.`,
    );
  }
  let response: Response;
  try {
    response = await new AocClient(sessionToken).fetchEvent(year);
  } catch (error) {
    if ((error as Error).name === "TimeoutError") {
      throw new StatusFetchError(
        "Timed out while fetching status. Try again or check your network.",
      );
    }
    throw new StatusFetchError(
      `Network error while connecting to Advent of Code: ${String(error)}`,
    );
  }
  await handleHttpErrors(response, StatusFetchError, {
    notFound: `Event page not found for year=${year} (HTTP 404).`,
    badRequest: "Bad request (HTTP 400). Your session token may be invalid.",
    serverError:
      "Server error from Advent of Code (HTTP {statusCode}). Your session token may be invalid.",
  });
  const html = await response.text();
  if (!parseLoginState(html)) {
    throw new StatusFetchError(
      "Session cookie invalid or expired. Update AOC_SESSION with a valid 'session' cookie from your browser.",
    );
  }
  let status: YearStatus;
  try {
    status = parseYearStatus(html);
  } catch {
    throw new StatusFetchError("Failed to parse Advent of Code status page.");
  }
  switch (format) {
    case OutputFormat.MODEL:
      return status;
    case OutputFormat.JSON:
      return JSON.stringify(status, null, 2);
    case OutputFormat.TABLE:
      return buildYearStatusTable(status);
    default:
      throw new RangeError(`Unsupported output format: ${String(format)}`);
  }
}

export const parseLoginState = (html: string): boolean =>
  html.includes("/settings") && !html.includes("/auth/login");

export function parseYearStatus(html: string): YearStatus {
  const userBlock =
    /<div\b[^>]*class=["'][^"']*\buser\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/i.exec(
      html,
    )?.[1];
  if (userBlock === undefined)
    throw new Error("Could not find user info in header");
  const username = decodeHtml((userBlock.split("<", 1)[0] ?? "").trim());
  const totalStars = Number(
    /class=["'][^"']*star-count[^"']*["'][^>]*>\s*(\d+)/i.exec(
      userBlock,
    )?.[1] ?? 0,
  );
  const isSupporter = /class=["'][^"']*supporter-badge/i.test(userBlock);
  const year = Number(
    /<h1\b[^>]*class=["'][^"']*title-event[^"']*["'][^>]*>[\s\S]*?<a\b[^>]*>\s*(\d{4})\s*<\/a>/i.exec(
      html,
    )?.[1],
  );
  if (!year) throw new Error("Could not find year in header");
  const calendar =
    /<pre\b[^>]*class=["'][^"']*calendar[^"']*["'][^>]*>([\s\S]*?)<\/pre>/i.exec(
      html,
    )?.[1];
  if (calendar === undefined) throw new Error("Could not find calendar");
  const days: DayStatus[] = [];
  const elements =
    /<(a|span)\b([^>]*\bclass=["'][^"']*\bcalendar-day\d+\b[^"']*["'][^>]*)>/gi;
  for (const match of calendar.matchAll(elements)) {
    const tag = match[1]?.toLowerCase();
    const attributes = match[2] ?? "";
    const classes = attribute(attributes, "class")?.split(/\s+/) ?? [];
    const ariaLabel = attribute(attributes, "aria-label") ?? "";
    const classDay = classes
      .map((className) => /^calendar-day(\d+)$/.exec(className)?.[1])
      .find(Boolean);
    const day = Number(/Day\s+(\d+)/i.exec(ariaLabel)?.[1] ?? classDay);
    if (!day) continue;
    let stars = 0;
    if (
      ariaLabel.includes("two stars") ||
      classes.includes("calendar-verycomplete")
    )
      stars = 2;
    else if (
      ariaLabel.includes("one star") ||
      classes.includes("calendar-complete")
    )
      stars = 1;
    days.push({
      day,
      stars,
      href: attribute(attributes, "href") ?? "",
      ariaLabel,
      isLocked: tag === "span",
    });
  }
  return {
    year,
    username,
    isSupporter,
    totalStars,
    days: days.sort((left, right) => left.day - right.day),
  };
}

function attribute(attributes: string, name: string): string | undefined {
  return new RegExp(`\\b${name}=["']([^"']*)["']`, "i").exec(attributes)?.[1];
}

function decodeHtml(value: string): string {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'");
}

export function buildYearStatusTable(status: YearStatus): Table {
  return {
    title:
      `Advent of Code ${status.year} – ${status.username}` +
      `${status.isSupporter ? " (AoC++)" : ""} [${status.totalStars}⭐]`,
    headers: ["Day", "Stars"],
    rows: [...status.days]
      .sort((left, right) => left.day - right.day)
      .map((day) => [
        String(day.day),
        day.isLocked
          ? "🔒"
          : `${"★".repeat(day.stars)}${"☆".repeat(2 - day.stars)}`,
      ]),
  };
}
