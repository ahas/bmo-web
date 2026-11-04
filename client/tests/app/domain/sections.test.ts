import { describe, expect, test } from "bun:test";

import { accessMap, accessOf, homeFor, isConsoleSection, mayRead, mayWrite, sectionOfPath } from "../../../apps/web/shared/sections";
import { permissionSections } from "../../../apps/web/app/domain/permissions";

// The console's sections (docs/accounts.md, 「Console sections」; docs/web.md, 「Access」): the section a
// screen's path stands under, what a person's permission opens, and the list the administrator's screen
// stands.

describe("the section a screen's path stands under", () => {
  test("is the first part of the path", () => {
    expect(sectionOfPath("/live")).toBe("live");
    expect(sectionOfPath("/agents/agent-a")).toBe("agents");
    expect(sectionOfPath("/rooms/-100")).toBe("rooms");
    expect(sectionOfPath("/account")).toBe("account");
  });

  test("is monitor for the card board, account for a person's page, and none for the front door and the login", () => {
    expect(sectionOfPath("/cards")).toBe("monitor");
    expect(sectionOfPath("/people/7")).toBe("account");
    expect(sectionOfPath("/")).toBeNull();
    expect(sectionOfPath("/login")).toBeNull();
  });

  test("names the console's own sections alone, so a unit's screen keeps its manifest's role", () => {
    expect(isConsoleSection("agents")).toBe(true);
    expect(isConsoleSection("mail")).toBe(true);
    expect(isConsoleSection("brain")).toBe(true);
    expect(isConsoleSection("a-unit-screen")).toBe(false);
  });
});

describe("a person's permission on a section", () => {
  const access = accessMap([
    { section: "rooms", read: true, write: false },
    { section: "agents", read: true, write: true }
  ]);

  test("a read opens reading and not writing", () => {
    expect(mayRead(access, "rooms")).toBe(true);
    expect(mayWrite(access, "rooms")).toBe(false);
  });

  test("a write opens both", () => {
    expect(mayRead(access, "agents")).toBe(true);
    expect(mayWrite(access, "agents")).toBe(true);
  });

  test("a section with no grant opens nothing, and the front door is no section", () => {
    expect(accessOf(access, "live")).toEqual({ read: false, write: false });
    expect(mayRead(access, null)).toBe(false);
  });

  test("the home is the first section the person reads", () => {
    expect(homeFor(access)).toBe("/agents");
    expect(homeFor(accessMap([{ section: "agents", read: true, write: false }]))).toBe("/agents");
    expect(homeFor(accessMap([{ section: "rooms", read: true, write: false }]))).toBe("/rooms");
  });
});

describe("the sections the administrator's screen lists", () => {
  test("stands every console section in its navigation order, and the brain and rooms and the account among them", () => {
    const listed = permissionSections([]);

    expect(listed.map((section) => section.id)).toEqual([
      "live", "mail", "siren", "db", "files", "artifact", "documents", "code", "agents", "research", "monitor",
      "remote", "brain", "rooms", "account"
    ]);
    expect(listed.find((section) => section.id === "brain")?.label).toBe("screens.label.brain");
    expect(listed.find((section) => section.id === "rooms")?.label).toBe("screens.label.rooms");
    expect(listed.find((section) => section.id === "account")?.label).toBe("settings.label.account");
  });
});
