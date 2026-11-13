import { describe, expect, test } from "bun:test";

import {
  accessMap, accessOf, agentSectionsRead, homeFor, inConsoleSections, isConsoleSection, mayRead, mayReadAny, mayWrite, screenMayRead, sectionsOfPath
} from "../../../apps/web/shared/sections";
import { permissionSections } from "../../../apps/web/app/domain/permissions";

// The console's sections (docs/accounts.md, 「Console sections」; docs/web.md, 「Access」): the sections a
// screen's path stands under, what a person's permission opens, and the list the administrator's screen
// stands.

describe("the sections a screen's path stands under", () => {
  test("is the path's first part, and agent management's five parts where its screen stands", () => {
    expect(sectionsOfPath("/live")).toEqual(["live"]);
    expect(sectionsOfPath("/agents")).toEqual(["supervisors", "roles", "repositories", "models", "model-files"]);
    expect(sectionsOfPath("/rooms/-100")).toEqual(["rooms"]);
    expect(sectionsOfPath("/account")).toEqual(["account"]);
  });

  test("is the three whose rows open an agent's own page, monitor for the card board, account for a person's page, and none for the front door and the login", () => {
    expect(sectionsOfPath("/agents/agent-a")).toEqual(["supervisors", "roles", "repositories"]);
    expect(sectionsOfPath("/cards")).toEqual(["monitor"]);
    expect(sectionsOfPath("/people/7")).toEqual(["account"]);
    expect(sectionsOfPath("/")).toEqual([]);
    expect(sectionsOfPath("/login")).toEqual([]);
  });

  test("names the console's own sections alone, so a unit's screen keeps its manifest's role", () => {
    expect(isConsoleSection("supervisors")).toBe(true);
    expect(isConsoleSection("model-files")).toBe(true);
    expect(isConsoleSection("mail")).toBe(true);
    expect(isConsoleSection("brain")).toBe(true);
    expect(isConsoleSection("agents")).toBe(false);
    expect(isConsoleSection("a-unit-screen")).toBe(false);
  });
});

describe("a person's permission on a section", () => {
  const access = accessMap([
    { section: "rooms", read: true, write: false },
    { section: "supervisors", read: true, write: false },
    { section: "roles", read: true, write: true }
  ]);

  test("a read opens reading and not writing", () => {
    expect(mayRead(access, "rooms")).toBe(true);
    expect(mayWrite(access, "rooms")).toBe(false);
  });

  test("a write opens both", () => {
    expect(mayRead(access, "roles")).toBe(true);
    expect(mayWrite(access, "roles")).toBe(true);
  });

  test("a section with no grant opens nothing, and the front door is no section", () => {
    expect(accessOf(access, "live")).toEqual({ read: false, write: false });
    expect(mayRead(access, null)).toBe(false);
  });

  test("the parts of agent management open apart, and its screen and an agent's page open on any one of them", () => {
    expect(agentSectionsRead(access)).toEqual(["supervisors", "roles"]);
    expect(mayReadAny(access, ["repositories", "models", "roles"])).toBe(true);
    expect(screenMayRead(access, "/agents")).toBe(true);
    expect(screenMayRead(access, "/agents/agent-a")).toBe(true);
    expect(screenMayRead(access, "/live")).toBe(false);
    // A screen a unit brings names no console section and keeps its manifest's role.
    expect(screenMayRead(access, "/a-unit-screen")).toBe(true);
  });

  test("the home is the first screen of the navigation under a section the person reads, else their rooms", () => {
    const navigation = ["/mail", "/db", "/agents", "/research", "/monitor"];

    expect(homeFor(access, navigation)).toBe("/agents");
    expect(homeFor(accessMap([{ section: "research", read: true, write: false }]), navigation)).toBe("/research");
    expect(homeFor(accessMap([{ section: "rooms", read: true, write: false }]), navigation)).toBe("/rooms");
    // A section no screen of the navigation stands for is never answered as one.
    expect(homeFor(accessMap([{ section: "live", read: true, write: false }]), navigation)).toBe("/rooms");
  });

  test("a path stands under the console's sections where every section it names is the console's", () => {
    expect(inConsoleSections("/research")).toBe(true);
    expect(inConsoleSections("/agents/agent-a")).toBe(true);
    expect(inConsoleSections("/")).toBe(false);
    expect(inConsoleSections("/organization")).toBe(false);
  });
});

describe("the sections the administrator's screen lists", () => {
  test("stands every console section in its navigation order, with agent management's five parts where its screen stands", () => {
    const listed = permissionSections([]);

    expect(listed.map((section) => section.id)).toEqual([
      "live", "mail", "siren", "db", "files", "artifact", "documents", "code", "supervisors", "roles",
      "repositories", "models", "model-files", "research", "monitor", "remote", "brain", "rooms", "account"
    ]);
    expect(listed.find((section) => section.id === "supervisors")?.label).toBe("agents.label.tab_supervisors");
    expect(listed.find((section) => section.id === "model-files")?.label).toBe("agents.label.tab_model_files");
    expect(listed.find((section) => section.id === "brain")?.label).toBe("screens.label.brain");
    expect(listed.find((section) => section.id === "account")?.label).toBe("settings.label.account");
  });
});
