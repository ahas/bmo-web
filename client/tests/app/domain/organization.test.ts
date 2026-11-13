import { describe, expect, test } from "bun:test";

import { ORGANIZATION_PATH, ORGANIZATION_TABS, organizationAddress, organizationTabNamed, organizationTabOf, organizationTabsFor } from "../../../apps/web/app/domain/organization";
import { SETTINGS_SECTIONS, sectionsFor } from "../../../apps/web/app/domain/settings-dialog";
import { SCREENS, tabAddress } from "../../../apps/web/app/domain/screens";

// The settings dialog holds what a person sets for themselves alone, and the organisation settings screen what is set
// for the whole deployment or for other people, a tab to a section (docs/web.md, 「Settings」 and 「Organisation
// settings」).

describe("the settings dialog", () => {
  test("holds the personal sections alone", () => {
    expect(SETTINGS_SECTIONS.map((section) => section.key)).toEqual(["account", "theme", "palette", "notifications", "briefing"]);
  });

  test("shows a member their account, theme and palette, and the administrator the notifications and the player too", () => {
    expect(sectionsFor(false).map((section) => section.key)).toEqual(["account", "theme", "palette"]);
    expect(sectionsFor(true).map((section) => section.key)).toEqual(["account", "theme", "palette", "notifications", "briefing"]);
  });

  test("leads every key that moved to its tab of the organisation settings screen, and keeps its own keys", () => {
    for (const key of ["organization", "invites", "permissions", "providers", "research", "secrets"]) {
      expect({ key, moved: organizationTabNamed(key)?.value ?? null }).toEqual({ key, moved: key });
    }

    expect(organizationTabNamed("account")).toBeNull();
  });
});

describe("the organisation settings screen", () => {
  test("stands its tabs in order, the units first", () => {
    expect(ORGANIZATION_TABS.map((tab) => tab.value)).toEqual(["organization", "invites", "permissions", "providers", "research", "briefing", "secrets"]);
  });

  test("opens every tab to the administrator and the invitations tab alone to a member", () => {
    expect(organizationTabsFor(true)).toHaveLength(ORGANIZATION_TABS.length);
    expect(organizationTabsFor(false).map((tab) => tab.value)).toEqual(["invites"]);
  });

  test("opens the first tab a reader may for a key naming none of theirs", () => {
    expect(organizationTabOf("secrets", organizationTabsFor(true)).value).toBe("secrets");
    expect(organizationTabOf("secrets", organizationTabsFor(false)).value).toBe("invites");
    expect(organizationTabOf(undefined, organizationTabsFor(true)).value).toBe("organization");
  });

  test("keeps a tab in the address, the first being the screen's own, and lets the chosen unit go with the tab it stood on", () => {
    expect(organizationAddress("organization", { unit: "3" })).toEqual({ path: ORGANIZATION_PATH, query: {} });
    expect(organizationAddress("secrets", { unit: "3", tab: "invites" })).toEqual({ path: ORGANIZATION_PATH, query: { tab: "secrets" } });
  });

  test("stands in the sidebar and the search with its tabs, after the console's other screens", () => {
    const screen = SCREENS.at(-1)!;

    expect(screen.to).toBe(ORGANIZATION_PATH);
    expect(screen.inviters).toBe(true);
    expect(screen.tabs?.map((tab) => tabAddress(screen, tab))).toEqual([
      "/organization",
      "/organization?tab=invites",
      "/organization?tab=permissions",
      "/organization?tab=providers",
      "/organization?tab=research",
      "/organization?tab=briefing",
      "/organization?tab=secrets"
    ]);
  });
});
