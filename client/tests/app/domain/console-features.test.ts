import { expect, test } from "bun:test";

import { EVERY_FEATURE, featuresFrom } from "../../../apps/web/shared/console-features";
import { featureLeftOut, featuredScreens, SCREENS, screensWithBundles } from "../../../apps/web/app/domain/screens";
import { permissionSections } from "../../../apps/web/app/domain/permissions";

// The deployment's features (docs/web.md, 「The console's features」): what a features file leaves out of the
// console's own screens, their addresses and a person's permissions tab, and a console that stands whole unless a
// file says otherwise.

const PERSONAL = featuresFrom({ organizations: false, research: false, siren: false, monitor: false });

test("a feature stands unless the file says false", () => {
  expect(featuresFrom(undefined)).toEqual(EVERY_FEATURE);
  expect(featuresFrom({ organizations: "no", research: 0, siren: null })).toEqual(EVERY_FEATURE);
  expect(featuresFrom({ organizations: false, stray: false })).toEqual({ ...EVERY_FEATURE, organizations: false });
});

test("a whole console shows every screen of its own", () => {
  expect(featuredScreens(EVERY_FEATURE)).toEqual([...SCREENS]);
});

test("a personal install's console leaves out the organisation, research, cache siren and monitor", () => {
  expect(screensWithBundles([], featuredScreens(PERSONAL)).map((screen) => screen.to).sort()).toEqual(["/admin", "/agents", "/db", "/documents"]);
});

test("an address under a screen left out is left out, the card board with the monitor", () => {
  for (const path of ["/organization", "/research", "/siren", "/monitor", "/monitor/node-a", "/cards"]) expect(featureLeftOut(PERSONAL, path)).toBe(true);
  for (const path of ["/", "/db", "/agents", "/rooms/1", "/organizer"]) expect(featureLeftOut(PERSONAL, path)).toBe(false);
  expect(featureLeftOut(EVERY_FEATURE, "/organization")).toBe(false);
});

test("a person's permissions tab lists no section whose screen is left out", () => {
  const whole = permissionSections([]).map((section) => section.id);
  const personal = permissionSections([], PERSONAL).map((section) => section.id);

  expect(whole).toContain("research");
  expect(whole).toContain("siren");
  expect(whole).toContain("monitor");
  expect(personal).not.toContain("research");
  expect(personal).not.toContain("siren");
  expect(personal).not.toContain("monitor");
  expect(personal).toEqual(whole.filter((id) => !["research", "siren", "monitor"].includes(id)));
});
