import { VERSION } from "./version.js";

const DEFAULT_USER_AGENT = "+https://github.com/snally-labs/wassail";

export function validateUserAgent(value: string | undefined): boolean {
  return value !== undefined && /[^@\s]+@[^.\s]+\.[^\s]+/.test(value);
}

export function constructUserAgent(value: string): string {
  return `wassail/${VERSION} (${value})`;
}

export function resolveUserAgent(): string {
  const configured = process.env["AOC_USER_AGENT"]
    ?.replace(/[\r\n]/g, "")
    .trim();
  if (!validateUserAgent(configured)) {
    const reason = configured
      ? "AOC_USER_AGENT is invalid (value hidden)."
      : "User-Agent should include an email address.";
    process.emitWarning(
      `${reason} Please set AOC_USER_AGENT in your environment.`,
      { type: "RuntimeWarning" },
    );
    return constructUserAgent(DEFAULT_USER_AGENT);
  }
  return constructUserAgent(configured ?? DEFAULT_USER_AGENT);
}

export interface AocClientOptions {
  baseUrl?: string;
  fetch?: typeof fetch;
  userAgent?: string;
  retries?: number;
}

export class AocClient {
  readonly baseUrl: string;
  private readonly fetchImplementation: typeof fetch;
  private readonly userAgent: string;
  private readonly retries: number;

  constructor(
    readonly sessionToken?: string,
    options: AocClientOptions = {},
  ) {
    this.baseUrl = options.baseUrl ?? "https://adventofcode.com";
    this.fetchImplementation = options.fetch ?? globalThis.fetch;
    this.userAgent = options.userAgent ?? resolveUserAgent();
    this.retries = options.retries ?? 2;
  }

  private async request(
    path: string,
    options: RequestInit = {},
    retry = false,
  ): Promise<Response> {
    const headers = new Headers(options.headers);
    headers.set("user-agent", this.userAgent);
    if (this.sessionToken)
      headers.set("cookie", `session=${this.sessionToken}`);
    let attempt = 0;
    while (true) {
      try {
        return await this.fetchImplementation(`${this.baseUrl}${path}`, {
          ...options,
          headers,
          redirect: "follow",
          signal: AbortSignal.timeout(20_000),
        });
      } catch (error) {
        if (!retry || attempt >= this.retries) throw error;
        await new Promise<void>((resolveDelay) =>
          setTimeout(resolveDelay, 500 * 2 ** attempt),
        );
        attempt += 1;
      }
    }
  }

  fetchInput(year: number, day: number): Promise<Response> {
    return this.request(`/${year}/day/${day}/input`, {}, true);
  }

  submitAnswer(
    year: number,
    day: number,
    answer: string,
    part: number,
  ): Promise<Response> {
    const body = new URLSearchParams({ level: String(part), answer });
    return this.request(`/${year}/day/${day}/answer`, {
      method: "POST",
      body,
      headers: { "content-type": "application/x-www-form-urlencoded" },
    });
  }

  fetchLeaderboard(
    year: number,
    boardId: number,
    viewKey?: string,
  ): Promise<Response> {
    const query = viewKey ? `?view_key=${encodeURIComponent(viewKey)}` : "";
    return this.request(
      `/${year}/leaderboard/private/view/${boardId}.json${query}`,
      {},
      true,
    );
  }

  fetchEvent(year: number): Promise<Response> {
    return this.request(`/${year}`, {}, true);
  }
}
