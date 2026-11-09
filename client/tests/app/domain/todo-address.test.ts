import { beforeEach, describe, expect, test } from "bun:test";

import { askedOf, forgetClosedTodos, todoClosed } from "../../../apps/web/app/domain/todo-address";

// The item an address asks the TODO panel to open (docs/web.md, the TODO panel's section): an item the reader closed
// is not opened again by a step back onto an address naming it, and a link naming it opens it again.

beforeEach(() => forgetClosedTodos());

describe("the item an address asks for", () => {
  test("is the item the address names, however the address was arrived at", () => {
    expect(askedOf("7", false)).toEqual({ open: 7, drop: false });
    expect(askedOf("7", true)).toEqual({ open: 7, drop: false });
  });

  test("is none where the address names no item", () => {
    expect(askedOf(undefined, true)).toEqual({ open: null, drop: false });
    expect(askedOf("seven", false)).toEqual({ open: null, drop: false });
  });

  test("is none for an item the reader closed and stepped back onto, which is taken off the address", () => {
    todoClosed(7);

    expect(askedOf("7", true)).toEqual({ open: null, drop: true });
    // It stays closed for every later step back.
    expect(askedOf("7", true)).toEqual({ open: null, drop: true });
    // Another item is its own.
    expect(askedOf("8", true)).toEqual({ open: 8, drop: false });
  });

  test("is the item again where a link names it, and it is held closed no longer", () => {
    todoClosed(7);

    expect(askedOf("7", false)).toEqual({ open: 7, drop: false });
    expect(askedOf("7", true)).toEqual({ open: 7, drop: false });
  });
});
