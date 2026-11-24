import { afterAll, describe, expect, test } from "bun:test";

import { forgetPreviews, githubApi, readDesktopRelease } from "../../../apps/web/server/utils/desktop-release";
import { wording } from "../../../apps/web/shared/wording";

// The desktop app's release as the console's server reads it (docs/web.md, 「The desktop app's download page」;
// jake's docs/desktop.md, 「The read the console uses」): a release read whole, a field the contract added passed
// over, an installer entry that cannot be read whole left out, no release where the read answers 404 or no address is
// set, and a read that fails or is not a release told to the page as unreadable. Where GitHub's latest-release
// address answers 404, as it does while only pre-releases are published, the newest pre-release of that repository
// stands in on the preview channel, read once and kept.

const DIGEST = "a".repeat(64);
const WINDOWS = { platform: "windows", arch: "x86_64", format: "nsis", file: "App_1.0.0_x64-setup.exe", size: 4_082_645, sha256: DIGEST };

// The release reads a stand-in host answers, by path.
const reads: Record<string, () => Response> = {
  "/release.json": () => Response.json({ version: "1.0.0", date: "2026-11-16T11:55:30.048Z", files: [{ ...WINDOWS, url: `${origin}/1.0.0/${WINDOWS.file}` }] }),
  "/added.json": () =>
    Response.json({
      version: "1.0.1",
      date: "2026-11-17T00:00:00Z",
      notes: "added later",
      files: [{ ...WINDOWS, url: `${origin}/1.0.1/${WINDOWS.file}`, signature: "sig" }]
    }),
  "/partial.json": () =>
    Response.json({
      version: "1.0.2",
      date: "2026-11-18T00:00:00Z",
      files: [
        { ...WINDOWS, url: `${origin}/1.0.2/${WINDOWS.file}` },
        { ...WINDOWS, file: "upper.exe", sha256: DIGEST.toUpperCase(), url: `${origin}/upper.exe` },
        { ...WINDOWS, file: "nosize.exe", size: "big", url: `${origin}/nosize.exe` },
        { ...WINDOWS, file: "script.exe", url: "javascript:alert(1)" },
        "not an entry"
      ]
    }),
  "/no-files.json": () => Response.json({ version: "1.0.0", date: "2026-11-16T11:55:30Z" }),
  "/bad-date.json": () => Response.json({ version: "1.0.0", date: "yesterday", files: [] }),
  "/page.html": () => new Response("<html></html>", { headers: { "content-type": "text/html" } }),
  "/broken.json": () => new Response("upstream failed", { status: 500 }),
  // A repository whose only releases are pre-releases, a draft newest of all, as GitHub's release list answers it.
  "/repos/acme/app/releases": () => {
    listed += 1;

    return Response.json([
      { draft: true, prerelease: true, assets: [{ name: "release.json", browser_download_url: `${origin}/draft/release.json` }] },
      { draft: false, prerelease: true, assets: [{ name: "release.json", browser_download_url: `${origin}/beta-2/release.json` }] },
      { draft: false, prerelease: true, assets: [{ name: "release.json", browser_download_url: `${origin}/beta-1/release.json` }] }
    ]);
  },
  "/beta-2/release.json": () => Response.json({ version: "1.0.0-beta.2", date: "2026-11-20T00:00:00Z", files: [{ ...WINDOWS, url: `${origin}/beta-2/${WINDOWS.file}` }] }),
  // A repository with no pre-release either.
  "/repos/acme/none/releases": () => Response.json([{ draft: false, prerelease: false, assets: [] }])
};

// How often the release list was asked.
let listed = 0;

const host = Bun.serve({
  hostname: "127.0.0.1",
  port: 0,
  fetch: (request) => reads[new URL(request.url).pathname]?.() ?? new Response("not found", { status: 404 })
});
const origin = `http://127.0.0.1:${host.port}`;

afterAll(() => {
  void host.stop(true);
});

async function refusal(address: string): Promise<{ statusCode?: number; message?: string }> {
  return (await readDesktopRelease(address).then(
    () => ({}),
    (error: unknown) => error
  )) as { statusCode?: number; message?: string };
}

describe("the desktop app's release read", () => {
  test("a release is read whole", async () => {
    expect(await readDesktopRelease(`${origin}/release.json`)).toEqual({
      version: "1.0.0",
      date: "2026-11-16T11:55:30.048Z",
      files: [{ ...WINDOWS, url: `${origin}/1.0.0/${WINDOWS.file}` }],
      channel: "stable"
    });
  });

  test("a field the contract added is passed over", async () => {
    const release = await readDesktopRelease(`${origin}/added.json`);

    expect(release).not.toHaveProperty("notes");
    expect(release?.channel).toBe("stable");
    expect(release?.files).toEqual([{ ...WINDOWS, url: `${origin}/1.0.1/${WINDOWS.file}` }]);
  });

  test("an installer entry that cannot be read whole is left out", async () => {
    expect((await readDesktopRelease(`${origin}/partial.json`))?.files.map((file) => file.file)).toEqual([WINDOWS.file]);
  });

  test("no release stands where the read answers 404 or no address is set", async () => {
    expect(await readDesktopRelease(`${origin}/missing.json`)).toBeNull();
    expect(await readDesktopRelease("")).toBeNull();
  });

  test("a read that fails or is no release is unreadable", async () => {
    for (const path of ["/broken.json", "/page.html", "/no-files.json", "/bad-date.json"]) {
      expect(await refusal(`${origin}${path}`)).toMatchObject({ statusCode: 502, message: wording("desktop.error.unreadable") });
    }
  });

  test("with only pre-releases published, the newest one stands in on the preview channel and is kept", async () => {
    githubApi.base = origin;
    forgetPreviews();
    listed = 0;
    try {
      const latest = `${origin}/acme/app/releases/latest/download/release.json`;
      const release = await readDesktopRelease(latest);

      expect(release).toEqual({
        version: "1.0.0-beta.2",
        date: "2026-11-20T00:00:00Z",
        files: [{ ...WINDOWS, url: `${origin}/beta-2/${WINDOWS.file}` }],
        channel: "preview"
      });
      expect(await readDesktopRelease(latest)).toEqual(release);
      expect(listed).toBe(1);

      // A repository with no pre-release, and an address that is no latest-release address, read as none.
      expect(await readDesktopRelease(`${origin}/acme/none/releases/latest/download/release.json`)).toBeNull();
      expect(await readDesktopRelease(`${origin}/missing.json`)).toBeNull();
    } finally {
      githubApi.base = "https://api.github.com";
      forgetPreviews();
    }
  });
});
