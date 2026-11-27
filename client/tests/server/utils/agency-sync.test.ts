import { expect, test } from "bun:test";

import { unitReachOf } from "../../../apps/web/server/utils/agency-sync";

// The units each account heads, as the console writes them to the agency (docs/web.md, 「The agency's organisation」):
// a head of a unit heads every unit under it, a member who heads nothing reaches none, and a head named twice on one
// path is one row.

test("a head reaches the unit and every unit under it, and a member who heads nothing reaches none", () => {
  const units = [
    { id: 1, parent: null, heads: ["10"] },
    { id: 2, parent: 1, heads: ["20"] },
    { id: 3, parent: 2, heads: [] },
    { id: 4, parent: null, heads: ["20"] }
  ];

  expect(unitReachOf(units)).toEqual([
    { account: 10, unit: 1, write: true },
    { account: 10, unit: 2, write: true },
    { account: 10, unit: 3, write: true },
    { account: 20, unit: 2, write: true },
    { account: 20, unit: 3, write: true },
    { account: 20, unit: 4, write: true }
  ]);
  expect(unitReachOf([{ id: 5, parent: null, heads: [] }])).toEqual([]);
});
