import { describe, expect, test } from "bun:test";
import { createMemoryHistory, createRouter } from "vue-router";

import { standUnavailable } from "../../../apps/web/app/domain/screen-unavailable";

import type { ConsoleScreen } from "../../../apps/web/shared/console-bundles";

// A screen whose module could not be read (docs/web.md, 「Screens a unit brings」): its addresses open onto the
// console's own page under the screen's title, never onto nothing and never onto a page that says it is absent.

const screen: ConsoleScreen = { name: "unit-a", title: "unit-a.title", icon: "i-material-symbols-apps", screenPath: "/unit-a", role: "member", module: "/console/api/unit-a/console/bundle.js", stylesheet: null, words: {}, counted: false, sidebarSection: "application" };

function router() {
  return createRouter({ history: createMemoryHistory(), routes: [{ path: "/", component: {} }] });
}

describe("a screen whose module could not be read", () => {
  test("stands the console's page at the screen's path and every address under it, with the console's bar", () => {
    const held = router();

    standUnavailable(held, screen);

    for (const path of ["/unit-a", "/unit-a/board/one/list"]) {
      const resolved = held.resolve(path);

      expect(resolved.name).toBe("console-screen-unavailable:unit-a");
      expect(resolved.meta.consoleTitleBar).toBe(true);
    }

    expect(held.resolve("/elsewhere").matched).toHaveLength(0);
  });

  test("is stood once however often the module fails", () => {
    const held = router();

    standUnavailable(held, screen);
    standUnavailable(held, screen);

    expect(held.getRoutes().filter((route) => route.name === "console-screen-unavailable:unit-a")).toHaveLength(1);
  });
});
