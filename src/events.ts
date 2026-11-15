export const FIRST_EVENT_YEAR = 2015;
export const LAST_FULL_LENGTH_EVENT_YEAR = 2024;
export const FULL_EVENT_DAYS = 25;
export const REDUCED_EVENT_DAYS = 12;

interface AocDateParts {
  year: number;
  month: number;
  day: number;
}

export function aocDateParts(now = new Date()): AocDateParts {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.find((part) => part.type === type)?.value);
  return { year: value("year"), month: value("month"), day: value("day") };
}

export function eventDayCount(year: number): number {
  if (!Number.isInteger(year) || year < FIRST_EVENT_YEAR) {
    throw new RangeError(
      `Invalid year ${String(year)}. Advent of Code started in ${FIRST_EVENT_YEAR}.`,
    );
  }
  return year <= LAST_FULL_LENGTH_EVENT_YEAR
    ? FULL_EVENT_DAYS
    : REDUCED_EVENT_DAYS;
}

export function validateEventDay(year: number, day: number): void {
  const lastDay = eventDayCount(year);
  if (!Number.isInteger(day) || day < 1 || day > lastDay) {
    throw new RangeError(
      `Invalid day ${String(day)} for Advent of Code ${year}. That event has days 1–${lastDay}.`,
    );
  }
}

export function defaultEventYear(now = new Date()): number {
  const current = aocDateParts(now);
  return current.month === 12 ? current.year : current.year - 1;
}

export function defaultEventDay(year?: number, now = new Date()): number {
  const current = aocDateParts(now);
  const selectedYear = year ?? defaultEventYear(now);
  const lastDay = eventDayCount(selectedYear);
  if (selectedYear < current.year) return lastDay;
  if (selectedYear > current.year || current.month < 12) return 1;
  return Math.min(current.day, lastDay);
}

export function getUnlockStatus(
  year: number,
  day: number,
  now = new Date(),
): {
  unlocked: boolean;
  now: Date;
  unlockTime: Date;
} {
  validateEventDay(year, day);
  // December is always EST, so AoC midnight is 05:00 UTC.
  const unlockTime = new Date(Date.UTC(year, 11, day, 5));
  return { unlocked: now >= unlockTime, now, unlockTime };
}
