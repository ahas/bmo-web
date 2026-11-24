import { describe, expect, test } from "bun:test";

import { installersFor, readerPlatform, typedCode } from "../../../apps/web/app/domain/join-desktop";

import type { DesktopReleaseFile } from "../../../apps/web/shared/desktop-release";

// The join page's desktop tab (docs/web.md, 「The join page」): the reader's platform as the browser names it, each
// platform's first installer with the reader's own leading, and the code as the person types it.

const file = (platform: string, format: string): DesktopReleaseFile => ({
  platform,
  arch: "x86_64",
  format,
  file: `app-${platform}.${format}`,
  size: 1,
  sha256: "0".repeat(64),
  url: `https://releases.invalid/app-${platform}.${format}`
});

const RELEASE = {
  version: "1.0.0",
  date: "2026-01-01T00:00:00Z",
  files: [file("linux", "appimage"), file("linux", "deb"), file("other", "zip"), file("windows", "nsis")]
};

describe("the reader's platform", () => {
  test("is read off the browser, a phone naming none", () => {
    expect(readerPlatform("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")).toBe("windows");
    expect(readerPlatform("Mozilla/5.0 (X11; Linux x86_64) Gecko/20100101 Firefox/140.0")).toBe("linux");
    expect(readerPlatform("Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15")).toBe("macos");
    expect(readerPlatform("Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 Mobile")).toBeNull();
    expect(readerPlatform("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15")).toBeNull();
  });
});

describe("the installers the desktop tab offers", () => {
  test("are each platform's first, the reader's own leading, then Windows, Linux and any other", () => {
    expect(installersFor(RELEASE, "linux").map((one) => one.file)).toEqual(["app-linux.appimage", "app-windows.nsis", "app-other.zip"]);
    expect(installersFor(RELEASE, null).map((one) => one.file)).toEqual(["app-windows.nsis", "app-linux.appimage", "app-other.zip"]);
    expect(installersFor({ ...RELEASE, files: [] }, "windows")).toEqual([]);
  });
});

describe("the typed code", () => {
  test("loses its spaces and takes capitals, its hyphen kept", () => {
    expect(typedCode(" abcd-efgh ")).toBe("ABCD-EFGH");
    expect(typedCode("ab cd ef gh")).toBe("ABCDEFGH");
    expect(typedCode("   ")).toBe("");
  });
});
