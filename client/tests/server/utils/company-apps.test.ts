import { expect, test } from "bun:test";

import { companyApps, sharedAppCompany } from "../../../apps/web/server/utils/apps";

// The apps a company's people and heads are shown (docs/accounts.md, 「An app's two settings」): every platform app and
// their own company's shared personal apps, never another company's, whose key names the company it was shared in
// (bmo-pocket's `docs/catalogue.md`, 「The app on the delegation chain」).

const DECLARED = new Map([
  ["calendar", "a platform app"],
  ["acme-portal", "a platform app offered to one company"],
  ["shared-3-17-weekly", "company A's shared app"],
  ["shared-5-21-tally", "company B's shared app"]
]);

test("a shared app's key names its company, and a platform app's none", () => {
  expect(sharedAppCompany("shared-3-17-weekly")).toBe(3);
  expect(sharedAppCompany("shared-12-4-a3f0c9d2e1b4")).toBe(12);
  expect(sharedAppCompany("calendar")).toBeNull();
  expect(sharedAppCompany("shared-notes")).toBeNull();
});

test("a head of company B sees nothing of company A's shared app, and company B's own beside the platform's", () => {
  expect([...companyApps(DECLARED, 5).keys()]).toEqual(["calendar", "acme-portal", "shared-5-21-tally"]);
  expect([...companyApps(DECLARED, 3).keys()]).toEqual(["calendar", "acme-portal", "shared-3-17-weekly"]);
});

test("a reader of no company is shown the platform's apps alone", () => {
  expect([...companyApps(DECLARED, null).keys()]).toEqual(["calendar", "acme-portal"]);
});
