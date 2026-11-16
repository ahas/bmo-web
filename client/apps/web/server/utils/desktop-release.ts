import { wording } from "#shared/wording";

import { fail } from "./fail";

import type { DesktopRelease, DesktopReleaseFile } from "#shared/desktop-release";

// The desktop app's current release (docs/web.md, 「The desktop app's download page」), read from the release read
// jake publishes (jake's docs/desktop.md, 「The read the console uses」) at the address `DESKTOP_RELEASE_URL` names.
// The read answers 404 until a first release is published, and a console whose setting names no address reads no
// release either; both are a release not yet published. The contract only ever adds fields, so a field this read
// does not know is passed over, and an installer entry it cannot read is left out rather than shown half.

// How long the read is waited on before the page is told it could not be read.
const READ_WAIT_MS = 10_000;

const SHA256 = /^[0-9a-f]{64}$/;

/** The current release at `address`, null where none is published or no address is set. */
export async function readDesktopRelease(address: string = process.env.DESKTOP_RELEASE_URL?.trim() ?? ""): Promise<DesktopRelease | null> {
  if (address === "") return null;

  let response: Response;

  try {
    response = await fetch(address, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(READ_WAIT_MS) });
  } catch (error) {
    throw unreadable(error);
  }

  if (response.status === 404) return null;
  if (!response.ok) throw unreadable(`release read answered ${response.status}`);

  const release = releaseOf(await response.json().catch(() => null));

  if (release === null) throw unreadable("release read is not a release");

  return release;
}

/** A release read as the contract states it, or null where it is not one. */
export function releaseOf(value: unknown): DesktopRelease | null {
  if (!isRecord(value)) return null;

  const { version, date, files } = value;

  if (!filled(version) || !filled(date) || Number.isNaN(Date.parse(date)) || !Array.isArray(files)) return null;

  return { version, date, files: files.flatMap((entry) => fileOf(entry) ?? []) };
}

function fileOf(value: unknown): DesktopReleaseFile | null {
  if (!isRecord(value)) return null;

  const { platform, arch, format, file, size, sha256, url } = value;

  if (!filled(platform) || !filled(arch) || !filled(format) || !filled(file)) return null;
  if (typeof size !== "number" || !Number.isSafeInteger(size) || size < 0) return null;
  if (typeof sha256 !== "string" || !SHA256.test(sha256) || !webAddress(url)) return null;

  return { platform, arch, format, file, size, sha256, url };
}

function webAddress(value: unknown): value is string {
  if (typeof value !== "string" || !URL.canParse(value)) return false;

  const { protocol } = new URL(value);

  return protocol === "https:" || protocol === "http:";
}

function filled(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// The page is told the release could not be read; what went wrong stays on the server as the error's cause.
function unreadable(cause: unknown): Error {
  const error = fail(502, wording("desktop.error.unreadable"));

  error.cause = cause;

  return error;
}
