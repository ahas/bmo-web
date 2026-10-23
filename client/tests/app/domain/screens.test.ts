import { expect, test } from "bun:test";

import { wording } from "../../../apps/web/shared/wording";

import { isScreenActive, namedWhenFolded, SCREENS, screenItems, screensWithBundles, tabAddress } from "../../../apps/web/app/domain/screens";

import type { Screen } from "../../../apps/web/app/domain/screens";
import type { ConsoleBundleView } from "../../../apps/web/shared/console-bundles";

// The console's own screens, the flat group at the top of the sidebar (docs/web.md, 「Sidebar」): each named
// from the pack, lit on its own address and, where it is nested, on the pages below it.

test("every screen standing in this console is listed, named from the pack", () => {
  expect(SCREENS.map((screen) => screen.to)).toEqual(["/live", "/mail", "/siren", "/db", "/files", "/archive", "/documents", "/memories", "/graph", "/code", "/agents", "/monitor", "/gates", "/briefing", "/remote"]);
  expect(screenItems(wording, "/").map((item) => item.label)).toEqual(SCREENS.map((screen) => wording(screen.label)));
});

test("the screens this console carries stand whole and the units not yet split are placeholders", () => {
  expect(SCREENS.filter((screen) => screen.placeholder !== true).map((screen) => screen.to)).toEqual(["/live", "/mail", "/siren", "/db", "/files", "/archive", "/documents", "/memories", "/code", "/agents", "/monitor", "/remote"]);
  expect(SCREENS.filter((screen) => screen.placeholder === true).map((screen) => screen.to)).toEqual(["/graph", "/gates", "/briefing"]);
});

test("a bundle's screen takes the bundle's own name and icon, and stands where the console lists it", () => {
  const mail = {
    name: "mail",
    title: "mail.title.screen",
    icon: "i-material-symbols-mail-outline",
    screenPath: "/mail",
    serviceName: "mail",
    languagePack: "i18n/locales",
    events: true,
    websocket: false,
    pushKinds: ["message.created"]
  } satisfies ConsoleBundleView;

  const screens = screensWithBundles([mail]);
  const screen = screens.find((entry) => entry.to === "/mail")!;

  expect(screen.label).toBe("mail.title.screen");
  expect(screen.icon).toBe("i-material-symbols-mail-outline");
  expect(screen.placeholder).toBeUndefined();
  expect(screens.map((entry) => entry.to)).toEqual(SCREENS.map((entry) => entry.to));
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
