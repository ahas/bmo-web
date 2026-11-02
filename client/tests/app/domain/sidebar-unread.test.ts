import { expect, test } from "bun:test";

import { countedBundles, countOf } from "../../../apps/web/app/domain/sidebar-unread";

import type { ConsoleScreen } from "../../../apps/web/shared/console-bundles";

// The sidebar counts the bundles declare (docs/web.md, 「Sidebar」; bmo-ui's `docs/console-bundles.md`, the sidebar
// count): which bundles a sidebar reads a count from, and which of an answer's values may stand as one.

function screen(name: string, screenPath: string, unread: ConsoleScreen["unread"] = null): ConsoleScreen {
  return {
    name,
    title: `${name}.title`,
    icon: "i-material-symbols-circle",
    screenPath,
    role: "member",
    module: `/base/api/${name}/bundle.js`,
    stylesheet: null,
    words: {},
    unread
  };
}

test("every bundle that names a count is read, at the screen its count stands on", () => {
  const bundles = countedBundles([
    screen("mail", "/mail", { url: "/base/api/mail/summary", field: "unreadCount" }),
    screen("files", "/files"),
    screen("artifact", "/artifact", { url: "/base/api/artifact/count", field: "unread" })
  ]);

  expect(bundles).toEqual([
    { to: "/mail", url: "/base/api/mail/summary", field: "unreadCount" },
    { to: "/artifact", url: "/base/api/artifact/count", field: "unread" }
  ]);
});

test("an answer's field stands as a count only as a whole number nought or more", () => {
  expect(countOf({ unreadCount: 7 }, "unreadCount")).toBe(7);
  expect(countOf({ unreadCount: 0 }, "unreadCount")).toBe(0);
  for (const answer of [{ unreadCount: -1 }, { unreadCount: 2.5 }, { unreadCount: "7" }, { unreadCount: null }, { other: 7 }, null, [], "7"]) {
    expect(countOf(answer, "unreadCount")).toBeNull();
  }
});
