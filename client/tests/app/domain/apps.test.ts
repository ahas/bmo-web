import { expect, test } from "bun:test";

import { appTitle, choiceWord, flagChoices, ON_WORDS, ownAppLine, platformAppLine, unitAppChoice, unitAppChoices, unitAppLine, wordFor } from "../../../apps/web/app/domain/apps";

import type { OwnApp, PlatformApp, UnitApp } from "../../../apps/web/shared/apps";

// The apps a reader turns on and off as their rows read (docs/web.md, 「System and organisation」, the apps tab at a unit, at the
// platform and at the reader's own node): the line saying how an app stands and the choice a word stands at.

const t = (key: string, named?: Record<string, unknown>) => (named === undefined ? key : `${key} ${JSON.stringify(named)}`);

const UNIT: UnitApp = { app: "app-a", title: null, icon: null, offered: true, on: true, own: null, locks: false, lockedAbove: false, locker: null, writable: true };
const OWN: OwnApp = { app: "app-a", title: "App A", icon: null, on: true, own: null, decided: null };

test("an app reads by its screen's title, else by its key", () => {
  expect(appTitle(UNIT)).toBe("app-a");
  expect(appTitle(OWN)).toBe("App A");
});

test("a unit's row says how the app stands there, not offered and a lock above before its own word", () => {
  expect(unitAppLine(t, { ...UNIT, offered: false, own: true }, false)).toBe("apps.label.not_offered");
  expect(unitAppLine(t, { ...UNIT, lockedAbove: true, locker: { by: "unit", name: "team-a" }, own: true }, false)).toBe('org_agents.label.decided_named {"name":"team-a"}');
  expect(unitAppLine(t, { ...UNIT, lockedAbove: true, locker: { by: "platform" }, own: true }, false)).toBe("org_agents.label.decided_platform");
  expect(unitAppLine(t, { ...UNIT, own: false, on: false }, false)).toBe("apps.label.own");
  expect(unitAppLine(t, UNIT, false)).toBe("apps.label.follows_above_on");
  expect(unitAppLine(t, { ...UNIT, on: false }, false)).toBe("apps.label.follows_above_off");
  expect(unitAppLine(t, UNIT, true)).toBe("apps.label.follows_platform_on");
  expect(unitAppLine(t, { ...UNIT, on: false }, true)).toBe("apps.label.follows_platform_off");
});

test("a unit's word stands as a choice of on, off or following, and writes back as it reads", () => {
  expect(unitAppChoice(UNIT)).toBe("follow");
  expect(unitAppChoice({ ...UNIT, own: true })).toBe("on");
  expect(unitAppChoice({ ...UNIT, own: false })).toBe("off");
  expect(choiceWord("follow")).toBeNull();
  expect(choiceWord("on")).toBe(true);
  expect(choiceWord("off")).toBe(false);
  expect(unitAppChoices(t, true).map((one) => one.label)).toEqual(["apps.label.on", "apps.label.off", "apps.label.follow_platform"]);
  expect(unitAppChoices(t, false).map((one) => one.label)).toEqual(["apps.label.on", "apps.label.off", "apps.label.follow_above"]);
});

test("a reader's row says who decides it above them, or that they set it or follow it", () => {
  expect(ownAppLine(t, { ...OWN, decided: { by: "unit", name: "team-a" }, own: null })).toBe('org_agents.label.decided_named {"name":"team-a"}');
  expect(ownAppLine(t, { ...OWN, decided: { by: "unit", name: null }, own: true, on: false })).toBe("org_agents.label.decided_unit");
  expect(ownAppLine(t, { ...OWN, decided: { by: "platform" }, own: null })).toBe("org_agents.label.decided_platform");
  expect(ownAppLine(t, { ...OWN, own: false })).toBe("apps.label.own");
  expect(ownAppLine(t, OWN)).toBe("apps.label.follows_organization");
});

const PLATFORM: PlatformApp = {
  app: "app-a",
  title: "App A",
  icon: null,
  offered: { value: true, own: null, declared: true },
  on: { value: true, own: null, declared: true },
  locks: false,
  recalled: false
};

test("the platform's row says whether it sets the app itself or follows what its publisher declared, a recall before all", () => {
  expect(platformAppLine(t, PLATFORM)).toBe("apps.label.follows_declared");
  expect(platformAppLine(t, { ...PLATFORM, on: { value: false, own: false, declared: true } })).toBe("apps.label.own");
  expect(platformAppLine(t, { ...PLATFORM, offered: { value: false, own: false, declared: true } })).toBe("apps.label.own");
  expect(platformAppLine(t, { ...PLATFORM, offered: null })).toBe("apps.label.follows_declared");
  expect(platformAppLine(t, { ...PLATFORM, recalled: true, locks: true, on: { value: false, own: false, declared: true } })).toBe("apps.label.recalled");
});

test("a flag's choices hold the real values alone, the default marked, and choosing it takes the word away", () => {
  const choices = flagChoices(t, ON_WORDS, false);

  expect(choices.map((one) => one.value)).toEqual([true, false]);
  expect(choices[0]!.label).toBe("apps.label.on");
  expect(choices[1]!.label).toBe('organization.label.default_mark {"label":"apps.label.off"}');
  expect(wordFor(false, false)).toBeNull();
  expect(wordFor(true, false)).toBe(true);
  expect(wordFor(false, true)).toBe(false);
});
