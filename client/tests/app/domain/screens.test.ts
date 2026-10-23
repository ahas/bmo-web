import { expect, test } from "bun:test";

import { wording } from "../../../apps/web/shared/wording";

import { broughtScreens, isScreenActive, namedWhenFolded, SCREENS, screenItems, screensWithBundles, tabAddress } from "../../../apps/web/app/domain/screens";

import type { Screen } from "../../../apps/web/app/domain/screens";
import type { ConsoleScreen } from "../../../apps/web/shared/console-bundles";

// The console's own screens, the flat group at the top of the sidebar (docs/web.md, 「Sidebar」): each named
// from the pack, lit on its own address and, where it is nested, on the pages below it.

test("every screen standing in this console is listed, named from the pack", () => {
  expect(SCREENS.map((screen) => screen.to)).toEqual(["/live", "/mail", "/siren", "/db", "/files", "/archive", "/documents", "/code", "/agents", "/monitor", "/gates", "/remote"]);
  expect(screenItems(wording, "/").map((item) => item.label)).toEqual(SCREENS.map((screen) => wording(screen.label)));
});

test("the console's own screens stand always, and a screen a unit brings only while its manifest names it", () => {
  expect(SCREENS.filter((screen) => screen.brought !== true).map((screen) => screen.to)).toEqual(["/live", "/siren", "/db", "/documents", "/agents", "/monitor"]);
  expect(screensWithBundles([]).map((screen) => screen.to)).toEqual(["/live", "/siren", "/db", "/documents", "/agents", "/monitor"]);
});

// A screen a unit brings, as the console's list hands it to the browser.
function brought(screenPath: string, name: string): ConsoleScreen {
  return {
    name,
    title: `${name}.title.screen`,
    icon: "i-material-symbols-circle",
    screenPath,
    role: "member",
    module: `/base/api/${name}/bundle.js`,
    stylesheet: null,
    words: {}
  };
}

test("a unit's screen takes its manifest's own name and icon, and stands where the console lists it", () => {
  const all = ["/mail", "/files", "/archive", "/code", "/gates", "/remote"].map((path) => brought(path, path.slice(1)));
  const screens = screensWithBundles(all);
  const screen = screens.find((entry) => entry.to === "/mail")!;

  expect(screen.label).toBe("mail.title.screen");
  expect(screen.icon).toBe("i-material-symbols-circle");
  expect(screens.map((entry) => entry.to)).toEqual(SCREENS.map((entry) => entry.to));
});

test("a screen a unit brings stands only while a manifest names it, and one the list lacks stands after it", () => {
  const screens = screensWithBundles([brought("/mail", "mail"), brought("/elsewhere", "elsewhere")]);

  expect(screens.some((entry) => entry.to === "/files")).toBe(false);
  expect(screens.some((entry) => entry.to === "/mail")).toBe(true);
  expect(screens.at(-1)!.to).toBe("/elsewhere");
});

test("a manifest at a screen's address names the screen by its own title", () => {
  const screen = screensWithBundles([brought("/gates", "gates")]).find((entry) => entry.to === "/gates")!;

  expect(screen.label).toBe("gates.title.screen");
});

test("a member's shell lists the screens units bring alone", () => {
  expect(broughtScreens([brought("/mail", "mail")]).map((entry) => entry.to)).toEqual(["/mail"]);
});

test("a nested screen is lit on its own address and on the pages below it, and nowhere else", () => {
  const archive = SCREENS.find((screen) => screen.to === "/archive")!;

  expect(isScreenActive(archive, "/archive")).toBe(true);
  expect(isScreenActive(archive, "/archive/58")).toBe(true);
  expect(isScreenActive(archive, "/archived")).toBe(false);
  expect(screenItems(wording, "/archive/58").find((item) => item.to === "/archive")!.active).toBe(true);
});

test("a screen's tab stands at the screen's own address when it is the first, and under its key otherwise", () => {
  const screen: Screen = {
    label: "screens.label.archive",
    to: "/somewhere",
    icon: "i-material-symbols-circle",
    nested: false,
    tabs: [
      { value: "first", label: "screens.label.archive", icon: "i-material-symbols-circle" },
      { value: "second one", label: "screens.label.archive", icon: "i-material-symbols-circle" }
    ]
  };

  expect(tabAddress(screen, screen.tabs![0]!)).toBe("/somewhere");
  expect(tabAddress(screen, screen.tabs![1]!)).toBe("/somewhere?tab=second%20one");
});

test("folded, a row is named by its label for a reader that cannot see its words, and a heading is left alone", () => {
  const items = namedWhenFolded([{ label: "a heading", type: "label" }, ...screenItems(wording, "/")], true);

  expect(items[0]).toEqual({ label: "a heading", type: "label" });
  expect(items[1]!["aria-label"]).toBe(wording(SCREENS[0]!.label));
  expect(namedWhenFolded(screenItems(wording, "/"), false)[0]!["aria-label"]).toBeUndefined();
});
