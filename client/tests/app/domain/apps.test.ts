import { expect, test } from "bun:test";

import { adminAppLine, appTitle, choiceWord, flagChoices, OFFER_WORDS, offerRows, ownAppLine, unitAppChoice, unitAppChoices, unitAppLine, wordFor } from "../../../apps/web/app/domain/apps";
import { sectionsFor } from "../../../apps/web/app/domain/settings-dialog";

import type { AdminApp, OwnApp, UnitApp } from "../../../apps/web/shared/apps";

// The apps a reader turns on and off as their rows read (docs/web.md, 「Administration」 and 「Organisation」, the apps
// tabs, and 「Settings」, the own apps section): the line saying how an app stands, the choice a word stands at, and the
// section shown to a reader with a user alone.

const t = (key: string, named?: Record<string, unknown>) => (named === undefined ? key : `${key} ${JSON.stringify(named)}`);

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

const ADMIN: AdminApp = {
  app: "app-a",
  title: "App A",
  icon: null,
  offered: { value: true, own: null, declared: true },
  on: { value: true, own: null, declared: true },
  locks: false,
  recalled: false,
  offers: []
};

test("the administrator's row says to whom the app is offered, how many apart, and its lock", () => {
  expect(adminAppLine(t, ADMIN)).toBe("apps.label.offered_everywhere");
  expect(adminAppLine(t, { ...ADMIN, locks: true })).toBe("apps.label.offered_everywhere · apps.action.lock");

  const apart = { ...ADMIN, offers: [{ unit: 1, name: "c", company: null, offered: false }, { unit: 2, name: "d", company: null, offered: true }] };

  expect(adminAppLine(t, apart)).toBe('apps.label.offered_everywhere · apps.label.withheld_from {"count":"1"}');

  const nowhere = { ...ADMIN, offered: { value: false, own: null, declared: false } };

  expect(adminAppLine(t, nowhere)).toBe("apps.label.offered_nowhere");
  expect(adminAppLine(t, { ...nowhere, offers: [{ unit: 1, name: "c", company: null, offered: true }] })).toBe('apps.label.offered_to {"count":"1"}');
  expect(adminAppLine(t, { ...ADMIN, recalled: true, locks: true })).toBe("apps.label.recalled");
});

test("a flag's choices hold the real values alone, the default marked, and choosing it takes the word away", () => {
  const choices = flagChoices(t, OFFER_WORDS, false);

  expect(choices.map((one) => one.value)).toEqual([true, false]);
  expect(choices[0]!.label).toBe("apps.label.offer");
  expect(choices[1]!.label).toBe('organization.label.default_mark {"label":"apps.label.withhold"}');
  expect(wordFor(false, false)).toBeNull();
  expect(wordFor(true, false)).toBe(true);
  expect(wordFor(false, true)).toBe(false);
});

test("the offers by company list every company, then every unit below one a rule names", () => {
  const app = {
    ...ADMIN,
    offers: [
      { unit: 2, name: "Company B", company: null, offered: false },
      { unit: 7, name: "Team", company: "Company A", offered: true }
    ]
  };
  const rows = offerRows(app, [
    { id: 1, name: "Company A" },
    { id: 2, name: "Company B" }
  ]);

  expect(rows).toEqual([
    { unit: 1, name: "Company A", rule: null },
    { unit: 2, name: "Company B", rule: false },
    { unit: 7, name: "Company A · Team", rule: true }
  ]);
});
