import { wording } from "#shared/wording";

import { fail } from "./fail";

import type { DesktopRelease, DesktopReleaseChannel, DesktopReleaseFile } from "#shared/desktop-release";

// The desktop app's current release (docs/web.md, 「The desktop app's download page」), read from the release read
// jake publishes (jake's docs/desktop.md, 「The read the console uses」) at the address `DESKTOP_RELEASE_URL` names.
// The read answers 404 until a first stable release is published; where the address is GitHub's latest-release
// address, which never names a pre-release, the newest pre-release of that repository stands in, found through
// GitHub's release list and kept a while, since GitHub limits how often a reader with no token may ask. A console
// whose setting names no address reads no release. The contract only ever adds fields, so a field this read does not
// know is passed over, and an installer entry it cannot read is left out rather than shown half.

// How long the read is waited on before the page is told it could not be read.
const READ_WAIT_MS = 10_000;

const SHA256 = /^[0-9a-f]{64}$/;

// How long the newest pre-release found through GitHub's release list is kept before it is asked again.
const PREVIEW_KEPT_MS = 10 * 60_000;

// The path of GitHub's latest-release address of a release read: `/<owner>/<repo>/releases/latest/download/<file>`.
const LATEST_PATH = /^\/([^/]+)\/([^/]+)\/releases\/latest\/download\/[^/]+$/;

/** Where GitHub's REST API answers; a test names a stand-in. */
export const githubApi = { base: "https://api.github.com" };

// The newest pre-release found, by the release list it was read from, until the moment it is asked again.
const previews = new Map<string, { until: number; release: DesktopRelease | null }>();

/** Forget every pre-release kept, so the next read asks GitHub again; a test starts from nothing. */
export function forgetPreviews(): void {
  previews.clear();
}

/**
 * The current release at `address`: the stable release where one is published, else the newest pre-release where the
 * address is GitHub's latest-release address; null where neither stands or no address is set.
 */
export async function readDesktopRelease(address: string = process.env.DESKTOP_RELEASE_URL?.trim() ?? ""): Promise<DesktopRelease | null> {
  if (address === "") return null;

  const response = await fetched(address);

  if (response.status === 404) return await newestPreview(address);
  if (!response.ok) throw unreadable(`release read answered ${response.status}`);

  const release = releaseOf(await response.json().catch(() => null));

  if (release === null) throw unreadable("release read is not a release");

  return release;
}

async function fetched(address: string, accept = "application/json"): Promise<Response> {
  try {
    return await fetch(address, { headers: { accept }, signal: AbortSignal.timeout(READ_WAIT_MS) });
  } catch (error) {
    throw unreadable(error);
  }
}

// The newest pre-release of the repository a GitHub latest-release address names, read from its own `release.json`;
// null for any other address, and where the repository has none.
async function newestPreview(address: string): Promise<DesktopRelease | null> {
  const named = URL.canParse(address) ? LATEST_PATH.exec(new URL(address).pathname) : null;

  if (named === null) return null;

  const list = `${githubApi.base}/repos/${named[1]}/${named[2]}/releases?per_page=30`;
  const kept = previews.get(list);

  if (kept !== undefined && kept.until > Date.now()) return kept.release;

  const release = await previewFrom(list);

  previews.set(list, { until: Date.now() + PREVIEW_KEPT_MS, release });

  return release;
}

async function previewFrom(list: string): Promise<DesktopRelease | null> {
  const response = await fetched(list, "application/vnd.github+json");

  if (response.status === 404) return null;
  if (!response.ok) throw unreadable(`release list answered ${response.status}`);

  const releases: unknown = await response.json().catch(() => null);

  if (!Array.isArray(releases)) throw unreadable("release list is not a list");

  const asset = releases.flatMap((one) => (isRecord(one) && one.draft !== true && one.prerelease === true ? [readAsset(one)] : [])).find((url) => url !== null);

  if (asset === undefined || asset === null) return null;

  const read = await fetched(asset);

  if (!read.ok) throw unreadable(`pre-release read answered ${read.status}`);

  const release = releaseOf(await read.json().catch(() => null), "preview");

  if (release === null) throw unreadable("pre-release read is not a release");

  return release;
}

// The address of a GitHub release's `release.json` asset, null where it carries none.
function readAsset(release: Record<string, unknown>): string | null {
  const assets = Array.isArray(release.assets) ? release.assets : [];
  const asset = assets.find((one) => isRecord(one) && one.name === "release.json");

  return isRecord(asset) && webAddress(asset.browser_download_url) ? asset.browser_download_url : null;
}

/** A release read as the contract states it, on the channel it was read from, or null where it is not one. */
export function releaseOf(value: unknown, channel: DesktopReleaseChannel = "stable"): DesktopRelease | null {
  if (!isRecord(value)) return null;

  const { version, date, files } = value;

  if (!filled(version) || !filled(date) || Number.isNaN(Date.parse(date)) || !Array.isArray(files)) return null;

  return { version, date, files: files.flatMap((entry) => fileOf(entry) ?? []), channel };
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
