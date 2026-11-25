import { describe, expect, test } from "bun:test";

import { movedRowPlace } from "../../../apps/web/app/domain/row-drag";

// The keyboard's way along an ordered list: the arrow key a handle holds answers moves its row one place, and the
// ends of the order hold it there the way a pointer may not be let go past them (docs/web.md, 「Changing an
// order」). Where the row lands is decided here; carrying it there is the screen's, and its files are read by the
// browser files.

describe("a row carried by the key on its handle", () => {
  test("goes one place up or down while the order has the room", () => {
    expect(movedRowPlace(1, "ArrowUp", 3)).toBe(0);
    expect(movedRowPlace(1, "ArrowDown", 3)).toBe(2);
    expect(movedRowPlace(0, "ArrowDown", 3)).toBe(1);
  });

  test("holds where it stands at the end it would be carried past", () => {
    expect(movedRowPlace(0, "ArrowUp", 3)).toBeNull();
    expect(movedRowPlace(2, "ArrowDown", 3)).toBeNull();
  });

  test("answers no other key", () => {
    expect(movedRowPlace(1, "ArrowLeft", 3)).toBeNull();
    expect(movedRowPlace(1, "PageDown", 3)).toBeNull();
    expect(movedRowPlace(1, "Enter", 3)).toBeNull();
  });

  test("moves nothing where the order holds one row or none", () => {
    expect(movedRowPlace(0, "ArrowUp", 1)).toBeNull();
    expect(movedRowPlace(0, "ArrowDown", 1)).toBeNull();
    expect(movedRowPlace(0, "ArrowDown", 0)).toBeNull();
  });
});
