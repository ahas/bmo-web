import { describe, expect, test } from "bun:test";

import { companyUnits, inviteCompanies, placeOf } from "../../../apps/web/app/domain/invites";
import { unitBranches } from "../../../apps/web/app/domain/organization";

const COMPANY_A = { id: 1, name: "company-a" };
const COMPANY_B = { id: 9, name: "company-b" };

// The units an administrator may invite into: two companies, the first holding a unit three levels down.
const EVERY = [
  { id: 1, name: "company-a", company: COMPANY_A },
  { id: 2, name: "team-a", parent: 1, company: COMPANY_A },
  { id: 3, name: "part-a", parent: 2, company: COMPANY_A },
  { id: 4, name: "cell-a", parent: 3, company: COMPANY_A },
  { id: 9, name: "company-b", company: COMPANY_B }
];

describe("the units an invitation chooses among", () => {
  test("names each company once, in the order its first unit comes", () => {
    expect(inviteCompanies(EVERY)).toEqual([COMPANY_A, COMPANY_B]);
  });

  test("draws one company's tree from its company down to any depth", () => {
    const [top] = unitBranches(companyUnits(EVERY, 1));

    expect(top?.unit.id).toBe(1);
    expect(top?.children[0]?.children[0]?.children[0]?.unit.name).toBe("cell-a");
    expect(companyUnits(EVERY, 9).map((unit) => unit.id)).toEqual([9]);
  });

  test("stands a head's own unit at the top of its tree, under the company it belongs to", () => {
    const head = EVERY.slice(2, 4);

    expect(inviteCompanies(head)).toEqual([COMPANY_A]);
    expect(unitBranches(companyUnits(head, 1)).map((branch) => branch.unit.id)).toEqual([3]);
  });

  test("says where an invitation leads, a company named once", () => {
    expect(placeOf({ company: COMPANY_A, unit: { id: 4, name: "cell-a" } })).toBe("company-a cell-a");
    expect(placeOf({ company: COMPANY_A, unit: COMPANY_A })).toBe("company-a");
  });
});
