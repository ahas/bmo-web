import { expect, test } from "bun:test";

import { appTitle, choiceWord, ownAppLine, unitAppChoice, unitAppChoices, unitAppLine } from "../../../apps/web/app/domain/apps";
import { sectionsFor } from "../../../apps/web/app/domain/settings-dialog";

import type { OwnApp, UnitApp } from "../../../apps/web/shared/apps";

// The apps a reader turns on and off as their rows read (docs/web.md, 「Organisation」, the apps tab, and 「Settings」,
// the own apps section): the line saying how an app stands, the choice a unit's word stands at, and the section shown
// to a reader with a user alone.

const t = (key: string) => key;

const UNIT: UnitApp = { app: "app-a", title: null, icon: null, offered: true, on: true, own: null, locks: false, lockedAbove: false, writable: true };
const OWN: OwnApp = { app: "app-a", title: "App A", icon: null, on: true, own: null, locked: false };

test("an app reads by its screen's title, else by its key", () => {
  expect(appTitle(UNIT)).toBe("app-a");
  expect(appTitle(OWN)).toBe("App A");
});

test("a unit's row says how the app stands there, not offered and a lock above before its own word", () => {
  expect(unitAppLine(t, { ...UNIT, offered: false, own: true }, false)).toBe("apps.label.not_offered");
  expect(unitAppLine(t, { ...UNIT, lockedAbove: true, own: true }, false)).toBe("apps.label.locked_above");
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

test("a reader's row says whether their organisation locks it, they set it or they follow it", () => {
  expect(ownAppLine(t, { ...OWN, locked: true, own: true })).toBe("apps.label.locked_organization");
  expect(ownAppLine(t, { ...OWN, own: false })).toBe("apps.label.own");
  expect(ownAppLine(t, OWN)).toBe("apps.label.follows_organization");
});

test("the own apps section stands for a reader with a user alone", () => {
  expect(sectionsFor(false, true).map((one) => one.key)).toContain("apps");
  expect(sectionsFor(false, false).map((one) => one.key)).not.toContain("apps");
});
