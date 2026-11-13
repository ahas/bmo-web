import { expect, test } from "bun:test";

import { wording } from "../../../apps/web/shared/wording";

import { broughtScreens, isScreenActive, namedWhenFolded, SCREENS, screenItems, screensWithBundles, tabAddress } from "../../../apps/web/app/domain/screens";

import type { Screen } from "../../../apps/web/app/domain/screens";
import type { ConsoleScreen } from "../../../apps/web/shared/console-bundles";

// The console's own screens, the flat group at the top of the sidebar (docs/web.md, 「Sidebar」): each named
// from the pack, lit on its own address and, where it is nested, on the pages below it.

test("every screen standing in this console is listed, named from the pack", () => {
  expect(SCREENS.map((screen) => screen.to)).toEqual(["/mail", "/siren", "/db", "/files", "/artifact", "/documents", "/code", "/agents", "/research", "/monitor", "/remote", "/organization"]);
  expect(screenItems(wording, "/").map((item) => item.label)).toEqual(SCREENS.map((screen) => wording(screen.label)));
});

test("the console's own screens stand always, and a screen a unit brings only while its manifest names it", () => {
  expect(SCREENS.filter((screen) => screen.brought !== true).map((screen) => screen.to)).toEqual(["/siren", "/db", "/documents", "/agents", "/research", "/monitor", "/organization"]);
  expect(screensWithBundles([]).map((screen) => screen.to)).toEqual(["/siren", "/db", "/documents", "/agents", "/research", "/monitor", "/organization"]);
});

// A screen a unit brings, as the console's list hands it to the browser.
function brought(screenPath: string, name: string, over: Partial<ConsoleScreen> = {}): ConsoleScreen {
  return {
    name,
    title: `${name}.title.screen`,
    icon: "i-material-symbols-circle",
    screenPath,
    role: "member",
    module: `/base/api/${name}/bundle.js`,
    stylesheet: null,
    words: {},
    counted: false,
    ...over
  };
}

test("a bundle's sidebar count stands at the line's end as a count badge, and folded as the number over the icon", () => {
  const screens = screensWithBundles([brought("/mail", "mail", { counted: true, title: "screens.label.mail" })]);
  const counts = { "/mail": 12 };
  const spread = screenItems(wording, "/", undefined, false, screens, counts).find((item) => item.to === "/mail")!;
  const folded = screenItems(wording, "/", undefined, true, screens, counts).find((item) => item.to === "/mail")!;

  expect(spread.badge).toMatchObject({ label: "12", color: "primary" });
  expect(spread.chip).toBeUndefined();
  expect(folded.chip).toMatchObject({ text: "12", color: "primary" });
  expect(folded.badge).toBeUndefined();
  expect(spread["aria-description"]).toBe(wording("screens.aria.screen_unread", { name: wording("screens.label.mail"), count: "12" }));
});

test("no count draws nothing, and a count above ninety-nine reads as ninety-nine and more", () => {
  const screens = screensWithBundles([brought("/mail", "mail", { counted: true, title: "screens.label.mail" })]);
  const none = screenItems(wording, "/", undefined, false, screens, {}).find((item) => item.to === "/mail")!;
  const many = screenItems(wording, "/", undefined, false, screens, { "/mail": 4210 }).find((item) => item.to === "/mail")!;

  expect(none.badge).toBeUndefined();
  expect(none.chip).toBeUndefined();
  expect(many.badge).toMatchObject({ label: "99+" });
});

test("a screen whose bundle names no count never draws one, whatever the counts hold", () => {
  const screens = screensWithBundles([brought("/mail", "mail", { title: "screens.label.mail" })]);

  expect(screens.find((screen) => screen.to === "/mail")!.counted).toBeUndefined();
  expect(screenItems(wording, "/", undefined, false, screens, { "/mail": 3 }).find((item) => item.to === "/mail")!.badge).toBeUndefined();
});

test("a unit's screen takes its manifest's own name and icon, and stands where the console lists it", () => {
  const all = ["/mail", "/files", "/artifact", "/code", "/remote"].map((path) => brought(path, path.slice(1)));
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
  const artifact = SCREENS.find((screen) => screen.to === "/artifact")!;

  expect(isScreenActive(artifact, "/artifact")).toBe(true);
  expect(isScreenActive(artifact, "/artifact/58")).toBe(true);
  expect(isScreenActive(artifact, "/artifacts")).toBe(false);
  expect(screenItems(wording, "/artifact/58").find((item) => item.to === "/artifact")!.active).toBe(true);
});

test("a screen's tab stands at the screen's own address when it is the first, and under its key otherwise", () => {
  const screen: Screen = {
    label: "screens.label.artifact",
    to: "/somewhere",
    icon: "i-material-symbols-circle",
    nested: false,
    tabs: [
      { value: "first", label: "screens.label.artifact", icon: "i-material-symbols-circle" },
      { value: "second one", label: "screens.label.artifact", icon: "i-material-symbols-circle" }
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
