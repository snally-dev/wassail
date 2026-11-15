import { createHash, randomBytes } from "node:crypto";
import {
  chmodSync,
  closeSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { homedir, platform } from "node:os";
import { dirname, join, resolve } from "node:path";
import { CacheLockTimeoutError } from "./errors.js";

const PRIVATE_DIRECTORY_MODE = 0o700;
const PRIVATE_FILE_MODE = 0o600;

export function getCacheDir(): string {
  const override = process.env["WASSAIL_CACHE_DIR"];
  if (override) return resolve(expandHome(override));
  if (platform() === "win32") {
    return join(
      process.env["LOCALAPPDATA"] ?? join(homedir(), "AppData", "Local"),
      "wassail",
    );
  }
  return join(
    process.env["XDG_CACHE_HOME"] ?? join(homedir(), ".cache"),
    "wassail",
  );
}

function expandHome(value: string): string {
  if (value === "~") return homedir();
  return value.startsWith(`~${process.platform === "win32" ? "\\" : "/"}`)
    ? join(homedir(), value.slice(2))
    : value;
}

export function credentialFingerprint(
  kind: string,
  credential: string,
): string {
  return createHash("sha256")
    .update(`wassail-cache-v2\0${kind}\0${credential}`)
    .digest("hex")
    .slice(0, 24);
}

export function getAccountCacheDir(sessionToken: string): string {
  return join(
    getCacheDir(),
    "accounts",
    credentialFingerprint("session", sessionToken),
  );
}

function puzzleCacheFile(
  year: number,
  day: number,
  filename: string,
  sessionToken?: string,
): string {
  const root = sessionToken ? getAccountCacheDir(sessionToken) : getCacheDir();
  return join(
    root,
    String(year).padStart(4, "0"),
    String(day).padStart(2, "0"),
    filename,
  );
}

export const getCacheGuessFile = (
  year: number,
  day: number,
  sessionToken?: string,
) => puzzleCacheFile(year, day, "guesses.csv", sessionToken);

export const getCacheInputFile = (
  year: number,
  day: number,
  sessionToken?: string,
) => puzzleCacheFile(year, day, "input.txt", sessionToken);

export function getCacheLeaderboardFile(
  year: number,
  boardId: number,
  credentials: { sessionToken?: string; viewKey?: string },
): string {
  const { sessionToken, viewKey } = credentials;
  if (!viewKey && !sessionToken) {
    throw new TypeError("A session token or view key is required for caching.");
  }
  const scope = viewKey ? "views" : "accounts";
  const fingerprint = credentialFingerprint(
    viewKey ? "view-key" : "session",
    viewKey ?? sessionToken ?? "",
  );
  return join(
    getCacheDir(),
    "leaderboards",
    scope,
    fingerprint,
    String(year).padStart(4, "0"),
    `${boardId}.json`,
  );
}

function makePrivate(path: string, mode: number): void {
  try {
    chmodSync(path, mode);
  } catch {
    // chmod is best-effort on platforms without POSIX permissions.
  }
}

export function ensurePrivateDirectory(path: string): void {
  mkdirSync(path, { recursive: true, mode: PRIVATE_DIRECTORY_MODE });
  makePrivate(path, PRIVATE_DIRECTORY_MODE);
}

export function atomicWrite(path: string, content: string | Uint8Array): void {
  ensurePrivateDirectory(dirname(path));
  const temporary = join(
    dirname(path),
    `.${path.split(/[\\/]/).at(-1) ?? "cache"}.${process.pid}.${randomBytes(8).toString("hex")}`,
  );
  try {
    writeFileSync(temporary, content, { mode: PRIVATE_FILE_MODE });
    renameSync(temporary, path);
    makePrivate(path, PRIVATE_FILE_MODE);
  } catch (error) {
    rmSync(temporary, { force: true });
    throw error;
  }
}

export function migrateLegacyCacheFile(
  legacyFile: string,
  scopedFile: string,
): boolean {
  if (!existsSync(legacyFile)) return false;
  makePrivate(legacyFile, PRIVATE_FILE_MODE);
  const marker = join(
    dirname(legacyFile),
    `.${legacyFile.split(/[\\/]/).at(-1)}.migrated`,
  );
  const claim = scopedFile.startsWith(getCacheDir())
    ? scopedFile.slice(getCacheDir().length + 1)
    : scopedFile;
  try {
    ensurePrivateDirectory(dirname(marker));
    const descriptor = openSync(marker, "wx", PRIVATE_FILE_MODE);
    writeFileSync(descriptor, `${claim}\n`);
    closeSync(descriptor);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== "EEXIST" || readFileSync(marker, "utf8").trim() !== claim)
      return false;
  }
  if (existsSync(scopedFile)) return false;
  ensurePrivateDirectory(dirname(scopedFile));
  copyFileSync(legacyFile, scopedFile);
  makePrivate(scopedFile, PRIVATE_FILE_MODE);
  return true;
}

const delay = (milliseconds: number) =>
  new Promise<void>((resolveDelay) => setTimeout(resolveDelay, milliseconds));

export async function withCacheLock<T>(
  cacheFile: string,
  callback: () => T | Promise<T>,
  options: {
    timeoutMs?: number;
    staleAfterMs?: number;
    pollIntervalMs?: number;
  } = {},
): Promise<T> {
  const timeoutMs = options.timeoutMs ?? 30_000;
  const staleAfterMs = options.staleAfterMs ?? 120_000;
  const pollIntervalMs = options.pollIntervalMs ?? 50;
  const lockFile = join(
    dirname(cacheFile),
    `.${cacheFile.split(/[\\/]/).at(-1)}.lock`,
  );
  ensurePrivateDirectory(dirname(lockFile));
  const deadline = Date.now() + timeoutMs;
  let descriptor: number | undefined;

  while (descriptor === undefined) {
    try {
      descriptor = openSync(lockFile, "wx", PRIVATE_FILE_MODE);
      writeFileSync(descriptor, `${process.pid} ${Date.now()}\n`);
      closeSync(descriptor);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== "EEXIST") throw error;
      try {
        if (Date.now() - statSync(lockFile).mtimeMs > staleAfterMs) {
          rmSync(lockFile);
          continue;
        }
      } catch {
        continue;
      }
      if (Date.now() >= deadline) {
        throw new CacheLockTimeoutError(
          `Timed out waiting for cache lock ${lockFile}.`,
        );
      }
      await delay(pollIntervalMs);
    }
  }

  try {
    return await callback();
  } finally {
    rmSync(lockFile, { force: true });
  }
}
