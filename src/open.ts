import { spawn } from "node:child_process";
import { platform } from "node:os";
import { validateEventDay } from "./events.js";
import { OpenKind } from "./models.js";

export function pageUrl(year: number, day: number, kind: OpenKind): string {
  validateEventDay(year, day);
  if (kind === OpenKind.PUZZLE)
    return `https://adventofcode.com/${year}/day/${day}`;
  if (kind === OpenKind.INPUT)
    return `https://adventofcode.com/${year}/day/${day}/input`;
  return "https://adventofcode.com/";
}

export function openPage(year: number, day: number, kind: OpenKind): string {
  const url = pageUrl(year, day, kind);
  const command =
    platform() === "darwin"
      ? "open"
      : platform() === "win32"
        ? "cmd"
        : "xdg-open";
  const arguments_ = platform() === "win32" ? ["/c", "start", "", url] : [url];
  const child = spawn(command, arguments_, { detached: true, stdio: "ignore" });
  child.on("error", () => {
    // The URL remains useful on headless systems without a browser opener.
  });
  child.unref();
  return `🌟 Opened ${kind} page: ${url}`;
}
