import { describe, expect, test } from "bun:test";

import { packEntries } from "../../../apps/web/shared/wording";
import KO from "../../fixtures/app/layouts/default.test.ko.json";

// The keys whose words carry a phrase, so a check that a screen never says it reads the keys.
const keysSaying = (phrase: string) => packEntries().filter(([, value]) => value.includes(phrase)).map(([key]) => key);

// The persistent layout owns the TODO panel beside each page, never below it.

const layout = await Bun.file(new URL("../../../apps/web/app/layouts/default.vue", import.meta.url)).text();

// The class list of the element the page's roots are handed to.
function slotWrapperClass(): string {
  const at = layout.indexOf("<slot />");

  expect(at).toBeGreaterThan(-1);

  const before = layout.slice(0, at);
  const opened = before.lastIndexOf("<div");
  const attributes = before.slice(opened);
  const found = /class="([^"]*)"/.exec(attributes);

  expect(found).not.toBeNull();

  return (found as RegExpExecArray)[1] as string;
}

describe("where the layout hands a page its own space", () => {
  test("does not show a warning when the event stream reconnects", () => {
    expect(layout).not.toContain("LIVE_DISCONNECTED");
    expect(layout).not.toContain("i-material-symbols-wifi-off");
    for (const key of keysSaying(KO.line_32)) {
      expect(layout).not.toContain(key);
    }
  });

  test("lays the page's roots out in a row, so a second root stands beside the first", () => {
    const classes = slotWrapperClass().split(/\s+/);

    expect(classes).toContain("flex");
    // A column here drops the owner's TODO panel below the conversation and off the screen.
    expect(classes).not.toContain("flex-col");
  });

  test("lets the roots shrink, so a wide conversation cannot push the panel out", () => {
    const classes = slotWrapperClass().split(/\s+/);

    expect(classes).toContain("min-w-0");
    expect(classes).toContain("min-h-0");
  });

});

describe("the console search in the sidebar", () => {
  test("stands at the top of the sidebar and opens the palette the layout holds once", () => {
    const body = layout.slice(layout.indexOf("#default="), layout.indexOf("</template>", layout.indexOf("#default=")));

    expect(body.trim().split("\n")[1]).toContain("<UContentSearchButton");
    expect(layout.match(/<UContentSearch\b/g)?.length).toBe(1);
    expect(layout).toContain(':color-mode="false"');
    expect(layout).not.toContain("useBackClose");
  });

  test("reads the sidebar counts the bundles declare, and hands them to the screen entries", () => {
    expect(layout).toContain("const unread = useSidebarUnread(bundles.value);");
    expect(layout).toContain("screenItems(t, route.path, undefined, sidebarFolded.value, screens, unread.value)");
  });

  test("lists the screens the search lists, one list of them both", () => {
    expect(layout).toContain("screenItems(t, route.path, ");
    expect(layout).toContain("screenGroup(t, screens)");
    expect(layout).toContain("screensWithBundles(bundles.value)");
  });
});

describe("the mark at the top of the sidebar", () => {
  test("is the console's own, and no stock icon out of the set the rest of the screens draw from", () => {
    const header = layout.slice(layout.indexOf("#header="), layout.indexOf("#default="));

    expect(header).toContain("<BmoMark");
    expect(header).not.toContain("i-material-symbols-smart-toy-outline");
  });

  test("keeps the mascot's own colours, the tab's icon's, with no theme colour laid over them", () => {
    const header = layout.slice(layout.indexOf("#header="), layout.indexOf("#default="));
    const mark = header.slice(header.indexOf("<BmoMark"), header.indexOf(">", header.indexOf("<BmoMark")));

    expect(mark).not.toMatch(/\btext-/);
    expect(mark).toContain("size-5");
  });
});
describe("the sidebar folded to its icons", () => {
  test("names every row of every menu in a tooltip", () => {
    const menus = layout.match(/<UNavigationMenu[^>]*>/g) ?? [];

    expect(menus.length).toBeGreaterThan(0);

    for (const menu of menus) {
      expect(menu).toMatch(/\stooltip\s/);
    }
  });

  test("names its fold button in a tooltip", () => {
    expect(layout).toContain("<UTooltip :text=\"collapsed ? $t('common.action.expand') : $t('common.action.collapse')\"");
  });
});
