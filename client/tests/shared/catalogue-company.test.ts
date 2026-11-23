import { describe, expect, test } from "bun:test";

import { catalogueCompany } from "../../apps/web/shared/app-catalogue";

// The company an administrator's catalogue is read for (docs/web.md, 「App catalogue」): the one asked for, else their
// home company; anyone else is read in their own company by the agency, so none is named for them.
describe("the company a catalogue is read for", () => {
  test("is the one the administrator asked for, else their home company", () => {
    expect(catalogueCompany(true, "2", 1)).toBe(2);
    expect(catalogueCompany(true, undefined, 1)).toBe(1);
    expect(catalogueCompany(true, "", 1)).toBe(1);
    expect(catalogueCompany(true, undefined, null)).toBeNull();
  });

  test("passes by what reads as no unit's id", () => {
    for (const asked of ["0", "-2", "2x", "1.5", ["2"], 2]) expect(catalogueCompany(true, asked, 1)).toBe(1);
  });

  test("names none for anyone but the administrator", () => {
    expect(catalogueCompany(false, "2", 1)).toBeNull();
    expect(catalogueCompany(false, undefined, 1)).toBeNull();
  });
});
