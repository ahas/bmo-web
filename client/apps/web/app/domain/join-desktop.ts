import type { DesktopRelease, DesktopReleaseFile } from "#shared/desktop-release";

// The join page's desktop tab (docs/web.md, 「The join page」): which platform the reader's browser runs on, the
// installers it offers with the reader's own first, and the code the person types from the app's title bar.

/** The platforms the release names, in the order the page lists them after the reader's own. */
const PLATFORM_ORDER = ["windows", "linux"];

/**
 * The platform the reader's browser names, as the release names its platforms; none for a phone, whose own platform
 * the app is never for, and for one the browser does not say.
 */
export function readerPlatform(userAgent: string): string | null {
  if (/Android|iPhone|iPad|iPod/i.test(userAgent)) return null;
  if (/Windows/i.test(userAgent)) return "windows";
  if (/Macintosh|Mac OS X/i.test(userAgent)) return "macos";
  if (/Linux|X11|CrOS/i.test(userAgent)) return "linux";

  return null;
}

/** Each platform's first installer, the reader's own platform first, then Windows, Linux and any other by name. */
export function installersFor(release: DesktopRelease, platform: string | null): DesktopReleaseFile[] {
  const rank = (name: string): number => {
    if (name === platform) return -1;

    const at = PLATFORM_ORDER.indexOf(name);

    return at === -1 ? PLATFORM_ORDER.length : at;
  };
  const firsts = new Map<string, DesktopReleaseFile>();

  for (const file of release.files) if (!firsts.has(file.platform)) firsts.set(file.platform, file);

  return [...firsts.values()].sort((a, b) => rank(a.platform) - rank(b.platform) || a.platform.localeCompare(b.platform));
}

/** The code as typed, its spaces dropped and its letters made capital; empty where nothing was typed. */
export function typedCode(typed: string): string {
  return typed.replace(/\s+/g, "").toUpperCase();
}
