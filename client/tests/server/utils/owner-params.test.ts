import { describe, expect, test } from "bun:test";

import { ownerParamsOf } from "../../../apps/web/server/utils/axes";

// The owner parameters a route's query may name (the agency's `docs/api.md`, 「Who a caller acts for」), read for
// shape alone: what does not read as a whole number or the literal ask for the subtree answers as none named, so a
// stray query never narrows a list — and never widens one the reader's own reach already holds.

describe("the owner parameters of a route query", () => {
  test("name none where the query names neither an account nor a unit", () => {
    expect(ownerParamsOf({})).toBeUndefined();
    expect(ownerParamsOf({ tab: "roles" })).toBeUndefined();
    expect(ownerParamsOf({ ownerAccount: "soon", unit: "0" })).toBeUndefined();
  });

  test("take an account as the agency wants it: a whole number, not a shape", () => {
    expect(ownerParamsOf({ ownerAccount: "7" })).toEqual({ ownerAccount: 7 });
    expect(ownerParamsOf({ ownerAccount: "-5" })).toBeUndefined();
    expect(ownerParamsOf({ ownerAccount: "zero" })).toBeUndefined();
    expect(ownerParamsOf({ ownerAccount: "7.5" })).toBeUndefined();
    expect(ownerParamsOf({ ownerAccount: 7 })).toBeUndefined();
  });

  test("take a unit and carry the subtree only where the query asks for it", () => {
    expect(ownerParamsOf({ unit: "3" })).toEqual({ unit: 3 });
    expect(ownerParamsOf({ unit: "3", unitSubtree: "true" })).toEqual({ unit: 3, unitSubtree: true });
    expect(ownerParamsOf({ unit: "3", unitSubtree: true })).toEqual({ unit: 3, unitSubtree: true });
    expect(ownerParamsOf({ unit: "3", unitSubtree: "yes" })).toEqual({ unit: 3 });
    expect(ownerParamsOf({ unit: "3", unitSubtree: "true", ownerAccount: "7" })).toEqual({ ownerAccount: 7, unit: 3, unitSubtree: true });
  });

  test("keep a subtree asked beside no unit as the account's own read, the unit having read as none", () => {
    expect(ownerParamsOf({ ownerAccount: "7", unitSubtree: "true" })).toEqual({ ownerAccount: 7 });
  });
});
