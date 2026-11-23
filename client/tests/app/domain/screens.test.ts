import { expect, test } from "bun:test";

import { wording } from "../../../apps/web/shared/wording";

import { ACCOUNT_ITEM_SLOT, accountItems, accountScreens, accountUnread, broughtScreens, isScreenActive, namedWhenFolded, SCREENS, screenItems, screenSections, screensWithBundles, sectionItems, sidebarOrder, tabAddress } from "../../../apps/web/app/domain/screens";

import type { Screen } from "../../../apps/web/app/domain/screens";
import KO from "../../fixtures/app/domain/screens.test.ko.json";
import type { ConsoleScreen } from "../../../apps/web/shared/console-bundles";

// The console's screens at the top of the sidebar (docs/web.md, 「Sidebar」): each named from the pack, standing in
// its section by the name the reader sees, lit on its own address and, where it is nested, on the pages below it.

test("every screen of the console's own is listed, named from the pack, and stands always", () => {
  expect(SCREENS.map((screen) => screen.to).sort()).toEqual(["/admin", "/agents", "/app-catalogue", "/db", "/documents", "/monitor", "/organization", "/research", "/siren"]);
  expect(SCREENS.some((screen) => screen.brought === true)).toBe(false);
  expect(screensWithBundles([]).map((screen) => screen.to)).toEqual(SCREENS.map((screen) => screen.to));
  expect(screenItems(wording, "/").map((item) => item.label)).toEqual(SCREENS.map((screen) => wording(screen.label)));
});

// The organisation screen, an entry of the administrator services among the others.
const ORGANIZATION = SCREENS.find((screen) => screen.to === "/organization")!;

test("the organisation screen stands among the administrator services by its name, and alone under their heading where it is the reader's only one, lit on any of its tabs", () => {
  const menus = sectionItems(wording, "/", undefined, false, SCREENS);
  const alone = sectionItems(wording, "/organization", undefined, false, [ORGANIZATION]);
  const administration = SCREENS.filter((screen) => screen.section === "administration").map((screen) => wording(screen.label));

  expect(ORGANIZATION.section).toBe("administration");
  expect(menus.map((menu) => menu.name)).toEqual(["screens.label.section_administration", "screens.label.section_application"].map((key) => wording(key)));
  expect(menus[0]!.items.slice(1).map((item) => item.label)).toEqual([...administration].sort(new Intl.Collator("en").compare));
  expect(menus[0]!.items.map((item) => item.to)).toContain("/organization");
  expect(alone).toEqual([
    {
      name: wording("screens.label.section_administration"),
      items: [
        { label: wording("screens.label.section_administration"), type: "label" },
        { label: wording("screens.label.organization"), to: "/organization", icon: ORGANIZATION.icon, active: true }
      ]
    }
  ]);
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
    sidebarSection: "application",
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

test("a unit's screen takes its manifest's own name and icon, and stands only while a manifest names it", () => {
  const screens = screensWithBundles([brought("/mail", "mail")]);
  const screen = screens.find((entry) => entry.to === "/mail")!;

  expect(screen.label).toBe("mail.title.screen");
  expect(screen.icon).toBe("i-material-symbols-circle");
  expect(screen.brought).toBe(true);
  expect(screens.some((entry) => entry.to === "/files")).toBe(false);
});

test("the console's own screens all stand under the administrator services, the organisation screen among them, and the app catalogue among the applications", () => {
  expect(SCREENS.filter((screen) => screen.section !== "administration").map((screen) => [screen.to, screen.section])).toEqual([["/app-catalogue", "application"]]);
});

test("a screen a unit brings stands under the administrator services where its manifest names them, and is an application where it names the applications", () => {
  const screens = screensWithBundles([brought("/elsewhere", "elsewhere", { sidebarSection: "administration" }), brought("/mail", "mail")]);
  const sectionOf = (path: string) => screens.find((entry) => entry.to === path)!.section;

  expect([sectionOf("/elsewhere"), sectionOf("/mail")]).toEqual(["administration", "application"]);
});

test("a screen a unit brings into the reader's own menu stands in no section of the sidebar, and in the user menu by its name", () => {
  const screens = screensWithBundles([brought("/voc", "voc", { sidebarSection: "account" }), brought("/files", "files", { sidebarSection: "account" }), brought("/mail", "mail")]);
  const t = named({ "voc.title.screen": "Voice", "files.title.screen": "files" });

  expect(sectionItems(t, "/", undefined, false, screens).flatMap((menu) => menu.items).map((item) => item.to)).not.toContain("/voc");
  expect(sectionItems(t, "/", undefined, false, screens).flatMap((menu) => menu.items).map((item) => item.to)).toContain("/mail");
  expect(accountScreens(t, screens).map((screen) => screen.to)).toEqual(["/files", "/voc"]);
});

test("the user menu's screen stands under its name and icon, leads to its address, and carries a positive count as a badge said with it", () => {
  const screens = screensWithBundles([brought("/voc", "voc", { sidebarSection: "account", counted: true, title: "screens.label.mail" })]);
  const [quiet] = accountItems(wording, screens, {});
  const [counted] = accountItems(wording, screens, { "/voc": 3 });

  expect(quiet).toEqual({ label: wording("screens.label.mail"), icon: "i-material-symbols-circle", to: "/voc", slot: ACCOUNT_ITEM_SLOT });
  expect(counted!.badge).toMatchObject({ label: "3", color: "primary" });
  expect(counted!["aria-description"]).toBe(wording("screens.aria.screen_unread", { name: wording("screens.label.mail"), count: "3" }));
  expect(accountUnread(wording, screens, {})).toBeNull();
  expect(accountUnread(wording, screens, { "/voc": 3 })).toBe(counted!["aria-description"]);
});

test("a count on a screen of the sidebar puts nothing on the user menu", () => {
  const screens = screensWithBundles([brought("/mail", "mail", { counted: true })]);

  expect(accountItems(wording, screens, { "/mail": 5 })).toEqual([]);
  expect(accountUnread(wording, screens, { "/mail": 5 })).toBeNull();
});

test("a manifest at the address of a screen of the list keeps that screen's section", () => {
  const screen = screensWithBundles([brought("/siren", "siren")]).find((entry) => entry.to === "/siren")!;

  expect(screen.label).toBe("siren.title.screen");
  expect(screen.section).toBe("administration");
});

// A translation that names each screen by the words a test gives it, so the order is read off names chosen for it.
function named(names: Record<string, string>) {
  return (key: string) => names[key] ?? key;
}

test("within a section the screens stand by their names, Latin a to z with case set aside first, then Hangul in its own order", () => {
  const screens = screensWithBundles(
    [
      ...["/brain", "/code", "/remote"].map((path) => brought(path, path.slice(1), { sidebarSection: "administration" })),
      ...["/mail", "/note", "/theater"].map((path) => brought(path, path.slice(1)))
    ],
    [SCREENS.find((screen) => screen.to === "/db")!, SCREENS.find((screen) => screen.to === "/siren")!]
  );
  const t = named({
    "screens.label.db": "DB",
    "screens.label.siren": KO.ha_na,
    "brain.title.screen": KO.ga_na,
    "code.title.screen": "alpha",
    "remote.title.screen": "Zulu",
    "mail.title.screen": KO.da_ra,
    "note.title.screen": "beta",
    "theater.title.screen": KO.ga
  });

  expect(screenSections(t, screens).map((section) => [section.name, section.screens.map((screen) => t(screen.label))])).toEqual([
    ["screens.label.section_administration", ["alpha", "DB", "Zulu", KO.ga_na, KO.ha_na]],
    ["screens.label.section_application", ["beta", KO.ga, KO.da_ra]]
  ]);
  expect(sidebarOrder(t, screens).map((screen) => t(screen.label))).toEqual(["alpha", "DB", "Zulu", KO.ga_na, KO.ha_na, "beta", KO.ga, KO.da_ra]);
});

test("each section is a menu of its own named from the pack under its name, and a section with no screen does not stand", () => {
  const mail = brought("/mail", "mail", { title: "screens.label.mail" });
  const both = sectionItems(wording, "/", undefined, false, screensWithBundles([mail]));
  const names = (menus: typeof both) => menus.map((menu) => menu.name);

  expect(names(both)).toEqual([wording("screens.label.section_administration"), wording("screens.label.section_application")]);
  expect(both.map((menu) => menu.items.filter((item) => item.type === "label"))).toEqual([[{ label: names(both)[0], type: "label" }], [{ label: names(both)[1], type: "label" }]]);
  expect(both[1]!.items.slice(1).map((item) => item.to)).toEqual(["/mail", "/app-catalogue"]);
  expect(names(sectionItems(wording, "/", undefined, false, screensWithBundles([mail], [])))).toEqual([wording("screens.label.section_application")]);
  expect(sectionItems(wording, "/", undefined, false, [])).toEqual([]);
});

test("a member's shell lists the screens units bring alone", () => {
  expect(broughtScreens([brought("/mail", "mail")]).map((entry) => entry.to)).toEqual(["/mail"]);
});

test("a nested screen is lit on its own address and on the pages below it, and nowhere else", () => {
  const artifact = screensWithBundles([brought("/artifact", "artifact", { title: "screens.label.artifact" })]).find((screen) => screen.to === "/artifact")!;

  expect(isScreenActive(artifact, "/artifact")).toBe(true);
  expect(isScreenActive(artifact, "/artifact/58")).toBe(true);
  expect(isScreenActive(artifact, "/artifacts")).toBe(false);
  expect(screenItems(wording, "/artifact/58", undefined, false, [artifact]).find((item) => item.to === "/artifact")!.active).toBe(true);
});

test("a screen's tab stands at the screen's own address when it is the first, and under its key otherwise", () => {
  const screen: Screen = {
    label: "screens.label.artifact",
    to: "/somewhere",
    icon: "i-material-symbols-circle",
    nested: false,
    section: "application",
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
