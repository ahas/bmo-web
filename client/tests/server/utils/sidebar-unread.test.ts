import { afterAll, expect, test } from "bun:test";

import { consoleManifest } from "bmo-ui/shared/console-manifest";

import { countOf, readSidebarCounts } from "../../../apps/web/server/utils/sidebar-unread";

import type { AttachedBundle } from "../../../apps/web/server/utils/console-manifests";

// The sidebar counts the console reads as itself (docs/web.md, 「Sidebar」; bmo-ui's `docs/console-bundles.md`, the
// sidebar count): from its own server, at the unit's own address, with the unit's token and the reader's owner key and
// role, for the bundles the reader may open whose manifest names a count.

const asked: { path: string; headers: Headers }[] = [];
const served = Bun.serve({
  hostname: "127.0.0.1",
  port: 0,
  fetch(request) {
    const path = new URL(request.url).pathname;

    asked.push({ path, headers: request.headers });

    if (path === "/summary") return Response.json({ unreadCount: 12 });
    if (path === "/count") return Response.json({ unread: 4 });
    if (path === "/broken") return Response.json({ unreadCount: "many" });

    return Response.json({ code: "forbidden" }, { status: 403 });
  }
});
const address = `http://127.0.0.1:${served.port}`;

afterAll(() => void served.stop(true));

function bundle(name: string, fields: Record<string, unknown> = {}): AttachedBundle {
  return {
    manifest: consoleManifest({ name, title: `${name}.title`, icon: "i-material-symbols-circle", screenPath: `/${name}`, serviceName: name, bundle: "/console/bundle.js", words: "/console/words", role: "member", ...fields }),
    unit: { address, token: `token-${name}` },
    words: {}
  };
}

const member = { name: "member-a", id: 7, administrator: false };

test("each count a reader's screens declare is read from its unit with the unit's token and the reader's owner key and role", async () => {
  asked.length = 0;

  const counts = await readSidebarCounts(member, [
    bundle("mail", { sidebarUnread: { path: "/summary", field: "unreadCount" } }),
    bundle("artifact", { sidebarUnread: { path: "/count", field: "unread" } }),
    bundle("files")
  ]);

  expect(counts).toEqual({ "/mail": 12, "/artifact": 4 });
  expect(asked.map((one) => one.path).toSorted()).toEqual(["/count", "/summary"]);

  const mail = asked.find((one) => one.path === "/summary")!;

  expect(mail.headers.get("authorization")).toBe("Bearer token-mail");
  expect(mail.headers.get("owner-key")).toBe("7");
  expect(mail.headers.get("owner-role")).toBe("member");
  expect(mail.headers.get("referer")).toBeNull();
});

test("a screen the reader may not open is not read, and a count that does not answer or does not read is left out", async () => {
  asked.length = 0;

  const counts = await readSidebarCounts(member, [
    bundle("admin", { role: "administrator", sidebarUnread: { path: "/summary", field: "unreadCount" } }),
    bundle("refused", { sidebarUnread: { path: "/refused", field: "unreadCount" } }),
    bundle("broken", { sidebarUnread: { path: "/broken", field: "unreadCount" } }),
    { ...bundle("gone", { sidebarUnread: { path: "/summary", field: "unreadCount" } }), unit: { address: "http://127.0.0.1:1", token: null } }
  ]);

  expect(counts).toEqual({});
  expect(asked.map((one) => one.path).toSorted()).toEqual(["/broken", "/refused"]);
});

test("an answer's field stands as a count only as a whole number nought or more", () => {
  expect(countOf({ unreadCount: 7 }, "unreadCount")).toBe(7);
  expect(countOf({ unreadCount: 0 }, "unreadCount")).toBe(0);
  for (const answer of [{ unreadCount: -1 }, { unreadCount: 2.5 }, { unreadCount: "7" }, { unreadCount: null }, { other: 7 }, null, [], "7"]) {
    expect(countOf(answer, "unreadCount")).toBeNull();
  }
});
