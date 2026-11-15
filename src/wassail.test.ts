import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vite-plus/test";
import {
  checkCachedGuesses,
  classifyMessage,
  submitToAoc,
  writeGuessCache,
} from "./answer.js";
import {
  getCacheGuessFile,
  getCacheInputFile,
  getCacheLeaderboardFile,
} from "./cache.js";
import {
  defaultEventDay,
  defaultEventYear,
  eventDayCount,
  validateEventDay,
} from "./events.js";
import { MissingSessionTokenError, SubmissionError } from "./errors.js";
import { getInput } from "./input.js";
import {
  formatLeaderboardAsCsv,
  formatLeaderboardAsTable,
  getLeaderboard,
  parseLeaderboard,
} from "./leaderboard.js";
import { OutputFormat, SubmissionStatus } from "./models.js";
import { createDayTemplate, renderDayTemplate } from "./scaffold.js";
import {
  buildYearStatusTable,
  parseLoginState,
  parseYearStatus,
} from "./status.js";
import { parseInput, readGuesses } from "./utils.js";
import { VERSION } from "./version.js";

let temporaryCache: string;
let originalFetch: typeof globalThis.fetch;

beforeEach(() => {
  temporaryCache = mkdtempSync(join(tmpdir(), "wassail-test-"));
  process.env["WASSAIL_CACHE_DIR"] = temporaryCache;
  process.env["AOC_USER_AGENT"] = "maintainer@example.com";
  delete process.env["AOC_SESSION"];
  originalFetch = globalThis.fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  delete process.env["WASSAIL_CACHE_DIR"];
  delete process.env["AOC_USER_AGENT"];
  delete process.env["AOC_SESSION"];
  rmSync(temporaryCache, { recursive: true, force: true });
  vi.restoreAllMocks();
});

describe("events", () => {
  it("matches elf's full and reduced event lengths", () => {
    expect(eventDayCount(2015)).toBe(25);
    expect(eventDayCount(2024)).toBe(25);
    expect(eventDayCount(2025)).toBe(12);
    expect(() => validateEventDay(2025, 13)).toThrow("days 1–12");
  });

  it("selects year-round defaults in AoC time", () => {
    const july = new Date("2026-07-01T16:00:00Z");
    expect(defaultEventYear(july)).toBe(2025);
    expect(defaultEventDay(undefined, july)).toBe(12);
    expect(defaultEventDay(2024, july)).toBe(25);
    expect(defaultEventDay(undefined, new Date("2026-12-20T17:00:00Z"))).toBe(
      12,
    );
  });
});

describe("release metadata", () => {
  it("keeps the public runtime version aligned with package.json", () => {
    const packageJson = JSON.parse(
      readFileSync(new URL("../package.json", import.meta.url), "utf8"),
    ) as { version: string };
    expect(VERSION).toBe(packageJson.version);
  });
});

describe("input helpers", () => {
  it("matches Python splitlines behavior for trailing and blank rows", () => {
    expect(parseInput("")).toEqual([]);
    expect(parseInput("one\n")).toEqual(["one"]);
    expect(parseInput("one\n\ntwo\n")).toEqual(["one", "", "two"]);
  });
});

const leaderboardPayload = {
  num_days: 25,
  event: "2024",
  day1_ts: 1_700_000_000,
  owner_id: 123,
  members: {
    "123": {
      id: 123,
      name: "Elf, One",
      last_star_ts: 1_700_000_123,
      stars: 45,
      local_score: 900,
      completion_day_level: {
        "1": { "1": { get_star_ts: 1_700_000_001, star_index: 1 } },
      },
    },
    "456": {
      id: 456,
      name: null,
      last_star_ts: 0,
      stars: 38,
      local_score: 750,
      completion_day_level: {},
    },
  },
};

describe("leaderboards", () => {
  it("validates models and creates deterministic table and CSV formats", () => {
    const leaderboard = parseLeaderboard(leaderboardPayload);
    expect(
      leaderboard.members[123]?.completionDayLevel[1]?.[1]?.starIndex,
    ).toBe(1);
    expect(formatLeaderboardAsTable(leaderboard).rows).toHaveLength(2);
    const csv = formatLeaderboardAsCsv(leaderboard, 2024, 99);
    expect(csv).toContain('"Elf, One"');
    expect(csv.split("\n")[1]).toContain("123");
  });

  it("caches by credential and reuses a fresh response", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify(leaderboardPayload), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );
    globalThis.fetch = fetchMock as typeof fetch;
    const first = await getLeaderboard(
      2024,
      "session-a",
      99,
      undefined,
      OutputFormat.MODEL,
    );
    const second = await getLeaderboard(
      2024,
      "session-a",
      99,
      undefined,
      OutputFormat.JSON,
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect((first as ReturnType<typeof parseLeaderboard>).ownerId).toBe(123);
    expect(JSON.parse(second as string).owner_id).toBe(123);
    expect(
      getCacheLeaderboardFile(2024, 99, { sessionToken: "session-a" }),
    ).not.toBe(
      getCacheLeaderboardFile(2024, 99, { sessionToken: "session-b" }),
    );
  });
});

describe("status parsing", () => {
  const html = `
    <header><div class="user">current-user
      <a class="supporter-badge">AoC++</a><span class="star-count">3*</span>
    </div><a href="/settings">Settings</a></header>
    <h1 class="title-event"><a>2024</a></h1>
    <pre class="calendar">
      <a class="calendar-verycomplete calendar-day1" href="/2024/day/1">
        <span class="calendar-day">1</span>
      </a>
      <a class="calendar-day2 calendar-complete" aria-label="Day 2, one star">
        <span class="calendar-day">2</span>
      </a>
      <span aria-hidden="true" class="calendar-day25"><span class="calendar-day">25</span></span>
    </pre>`;

  it("parses authentication, stars, supporter state, and locked days", () => {
    expect(parseLoginState(html)).toBe(true);
    const status = parseYearStatus(html);
    expect(status.username).toBe("current-user");
    expect(status.isSupporter).toBe(true);
    expect(
      status.days.map((day) => [day.day, day.stars, day.isLocked]),
    ).toEqual([
      [1, 2, false],
      [2, 1, false],
      [25, 0, true],
    ]);
    expect(buildYearStatusTable(status).rows).toHaveLength(3);
  });
});

describe("input caching", () => {
  it("returns exact input and avoids a second request", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response("one\ntwo\n", {
          status: 200,
          headers: { "content-type": "text/plain" },
        }),
    );
    globalThis.fetch = fetchMock as typeof fetch;
    expect(await getInput(2024, 1, "account-a")).toBe("one\ntwo\n");
    expect(await getInput(2024, 1, "account-a")).toBe("one\ntwo\n");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(readFileSync(getCacheInputFile(2024, 1, "account-a"), "utf8")).toBe(
      "one\ntwo\n",
    );
  });

  it("requires a session and rejects login HTML", async () => {
    await expect(getInput(2024, 1)).rejects.toBeInstanceOf(
      MissingSessionTokenError,
    );
    globalThis.fetch = vi.fn(
      async () =>
        new Response(
          '<form action="/auth/login"><input name="session"></form>',
          {
            status: 200,
            headers: { "content-type": "text/html" },
          },
        ),
    ) as typeof fetch;
    await expect(getInput(2024, 1, "expired")).rejects.toThrow(
      "invalid or expired",
    );
  });
});

describe("answer guardrails", () => {
  it("detects duplicate, bounds, completion, and cooldown entries", async () => {
    await writeGuessCache(2025, 1, 1, 10, SubmissionStatus.TOO_LOW);
    await writeGuessCache(2025, 1, 1, 20, SubmissionStatus.TOO_HIGH);
    expect(checkCachedGuesses(2025, 1, 1, 9, 9).status).toBe(
      SubmissionStatus.TOO_LOW,
    );
    expect(checkCachedGuesses(2025, 1, 1, 20, 20).status).toBe(
      SubmissionStatus.TOO_HIGH,
    );
    await writeGuessCache(2025, 1, 1, 15, SubmissionStatus.CORRECT);
    expect(checkCachedGuesses(2025, 1, 1, 16, 16).status).toBe(
      SubmissionStatus.COMPLETED,
    );

    await writeGuessCache(2025, 2, 1, 4, SubmissionStatus.WAIT);
    expect(checkCachedGuesses(2025, 2, 1, 5, 5).status).toBe(
      SubmissionStatus.WAIT,
    );
  });

  it("upgrades legacy four-column guess caches", async () => {
    const file = getCacheGuessFile(2025, 1);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(
      file,
      `timestamp,part,guess,status\n${new Date().toISOString()},1,41,INCORRECT\n`,
      { flag: "w" },
    );
    await writeGuessCache(2025, 1, 1, 42, SubmissionStatus.WAIT);
    const guesses = readGuesses(2025, 1);
    expect(guesses.map((guess) => guess.guess)).toEqual([41, 42]);
    expect(readFileSync(file, "utf8").split("\n")[0]).toContain("retry_at");
  });

  it("parses and persists server cooldown deadlines", async () => {
    globalThis.fetch = vi.fn(
      async () =>
        new Response(
          "<article>You gave an answer too recently. You have 2m 5s left to wait.</article>",
          { status: 200 },
        ),
    ) as typeof fetch;
    const before = Date.now();
    const result = await submitToAoc(2025, 1, 1, "42", "account-a");
    expect(result.result).toBe(SubmissionStatus.WAIT);
    expect(result.retryAt?.valueOf()).toBeGreaterThanOrEqual(before + 124_000);
    expect(readGuesses(2025, 1, "account-a")[0]?.retryAt).toEqual(
      result.retryAt,
    );
  });

  it("classifies AoC messages and rejects expired sessions", async () => {
    expect(classifyMessage("That's the right answer", 42).status).toBe(
      SubmissionStatus.CORRECT,
    );
    globalThis.fetch = vi.fn(
      async () =>
        new Response("<article>To play, please identify yourself.</article>", {
          status: 200,
        }),
    ) as typeof fetch;
    await expect(
      submitToAoc(2025, 1, 1, "42", "expired"),
    ).rejects.toBeInstanceOf(SubmissionError);
  });
});

describe("TypeScript scaffolding", () => {
  it("renders the interactive cells and refuses to overwrite", () => {
    const source = renderDayTemplate(2024, 25);
    expect(source).toContain("const YEAR = 2024");
    expect(source).toContain("const DAY = 25");
    expect(source.match(/^\/\/ %%/gm)).toHaveLength(7);
    const destination = join(temporaryCache, "solutions", "day25.ts");
    expect(createDayTemplate(2024, 25, destination)).toBe(destination);
    expect(() => createDayTemplate(2024, 25, destination)).toThrow(
      "Refusing to overwrite",
    );
  });
});
