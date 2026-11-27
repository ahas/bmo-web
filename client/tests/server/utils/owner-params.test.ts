import { describe, expect, test } from "bun:test";

import { ownerShapeOf } from "../../../apps/web/server/utils/axes";

// The owner parameters a route's query may name (the agency's `docs/api.md`, 「Who a caller acts for」), read for
// shape alone: what does not read as a whole number answers as none named, so a stray query never narrows a list —
// and never widens one the reader's own reach already holds. A unit asked with the units under it says so; the console
// then resolves their ids on its own organisation, the agency keeping none.

describe("the owner parameters of a route query", () => {
  test("name none where the query names neither an account nor a unit", () => {
    expect(ownerShapeOf({})).toBeUndefined();
    expect(ownerShapeOf({ tab: "roles" })).toBeUndefined();
    expect(ownerShapeOf({ ownerAccount: "soon", unit: "0" })).toBeUndefined();
  });

  test("take an account as the agency wants it: a whole number, not a shape", () => {
    expect(ownerShapeOf({ ownerAccount: "7" })).toEqual({ params: { ownerAccount: 7 }, below: false });
    expect(ownerShapeOf({ ownerAccount: "-5" })).toBeUndefined();
    expect(ownerShapeOf({ ownerAccount: "zero" })).toBeUndefined();
    expect(ownerShapeOf({ ownerAccount: "7.5" })).toBeUndefined();
    expect(ownerShapeOf({ ownerAccount: 7 })).toBeUndefined();
  });

  test("take a unit and ask for the units under it only where the query asks for them", () => {
    expect(ownerShapeOf({ unit: "3" })).toEqual({ params: { unit: 3 }, unit: 3, below: false });
    expect(ownerShapeOf({ unit: "3", unitSubtree: "true" })).toEqual({ params: { unit: 3 }, unit: 3, below: true });
    expect(ownerShapeOf({ unit: "3", unitSubtree: true })).toEqual({ params: { unit: 3 }, unit: 3, below: true });
    expect(ownerShapeOf({ unit: "3", unitSubtree: "yes" })).toEqual({ params: { unit: 3 }, unit: 3, below: false });
  });

  test("keep a subtree asked beside no unit as the account's own read, the unit having read as none", () => {
    expect(ownerShapeOf({ ownerAccount: "7", unitSubtree: "true" })).toEqual({ params: { ownerAccount: 7 }, below: false });
  });
});
