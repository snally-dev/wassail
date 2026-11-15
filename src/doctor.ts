import {
  chmodSync,
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readdirSync,
  rmSync,
  statSync,
} from "node:fs";
import { join } from "node:path";
import { getCacheDir } from "./cache.js";
import { defaultEventDay, defaultEventYear } from "./events.js";
import { validateUserAgent } from "./http.js";
import type { Table } from "./models.js";
import { VERSION } from "./version.js";

export const CheckStatus = {
  OK: "ok",
  WARNING: "warning",
  ERROR: "error",
} as const;
export type CheckStatus = (typeof CheckStatus)[keyof typeof CheckStatus];

export interface DoctorCheck {
  name: string;
  status: CheckStatus;
  detail: string;
}

export interface DoctorReport {
  checks: DoctorCheck[];
  hasErrors: boolean;
}

export function runDoctor(now = new Date()): DoctorReport {
  const year = defaultEventYear(now);
  const day = defaultEventDay(year, now);
  const checks: DoctorCheck[] = [
    { name: "Version", status: CheckStatus.OK, detail: `wassail ${VERSION}` },
    {
      name: "AoC clock",
      status: CheckStatus.OK,
      detail: `${formatAocDateTime(now)}; default puzzle ${year}-12-${String(day).padStart(2, "0")}`,
    },
    process.env["AOC_SESSION"]?.trim()
      ? {
          name: "Session",
          status: CheckStatus.OK,
          detail: "AOC_SESSION is configured (value hidden).",
        }
      : {
          name: "Session",
          status: CheckStatus.WARNING,
          detail:
            "AOC_SESSION is not configured; authenticated commands will fail.",
        },
    validateUserAgent(
      process.env["AOC_USER_AGENT"]?.replace(/[\r\n]/g, "").trim(),
    )
      ? {
          name: "User-Agent",
          status: CheckStatus.OK,
          detail: "AOC_USER_AGENT contains a contact email (value hidden).",
        }
      : {
          name: "User-Agent",
          status: CheckStatus.WARNING,
          detail:
            "Set AOC_USER_AGENT to a contact email recommended by Advent of Code.",
        },
    cacheCheck(getCacheDir()),
  ];
  return {
    checks,
    hasErrors: checks.some((check) => check.status === CheckStatus.ERROR),
  };
}

export function formatAocDateTime(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
    timeZoneName: "longOffset",
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((part) => part.type === type)?.value ?? "";
  const offset = value("timeZoneName").replace("GMT", "");
  return (
    `${value("year")}-${value("month")}-${value("day")}T` +
    `${value("hour")}:${value("minute")}:${value("second")}${offset}` +
    "[America/New_York]"
  );
}

function cacheCheck(cacheDir: string): DoctorCheck {
  try {
    mkdirSync(cacheDir, { recursive: true, mode: 0o700 });
    const probe = join(cacheDir, `.doctor-${process.pid}-${Date.now()}`);
    const descriptor = openSync(probe, "wx", 0o600);
    closeSync(descriptor);
    rmSync(probe);
    if (process.platform !== "win32") {
      const mode = statSync(cacheDir).mode & 0o777;
      if ((mode & 0o077) !== 0) {
        return {
          name: "Cache",
          status: CheckStatus.WARNING,
          detail: `${cacheDir} is writable but permissions are ${mode.toString(8).padStart(4, "0")}; expected 0700.`,
        };
      }
      chmodSync(cacheDir, 0o700);
    }
    return {
      name: "Cache",
      status: CheckStatus.OK,
      detail: `${cacheDir} is writable (${countFiles(cacheDir)} cached files).`,
    };
  } catch (error) {
    return {
      name: "Cache",
      status: CheckStatus.ERROR,
      detail: `${cacheDir} is not writable: ${String(error)}`,
    };
  }
}

function countFiles(path: string): number {
  if (!existsSync(path)) return 0;
  return readdirSync(path, { withFileTypes: true }).reduce(
    (count, entry) =>
      count +
      (entry.isDirectory()
        ? countFiles(join(path, entry.name))
        : entry.isFile()
          ? 1
          : 0),
    0,
  );
}

export function formatDoctorReport(report: DoctorReport): Table {
  return {
    title: "Wassail doctor",
    headers: ["Check", "Status", "Details"],
    rows: report.checks.map((check) => [
      check.name,
      check.status.toUpperCase(),
      check.detail,
    ]),
  };
}
