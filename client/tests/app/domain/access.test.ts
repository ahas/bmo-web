import { describe, expect, test } from "bun:test";

import { roomMayWrite } from "../../../apps/web/app/domain/access";

import type { SectionAccessMap } from "../../../apps/web/shared/sections";

// Whether the room screen writes for a reader (docs/web.md, 「Access」): a member's box to write in and the
// acts on a message follow the rooms section's write, the administrator always holds them, and a permission
// not yet read grants nothing.

const sections = (rooms: { read: boolean; write: boolean }): SectionAccessMap => ({ rooms });

describe("the room screen's write", () => {
  test("is permitted to a member whose rooms section writes", () => {
    expect(roomMayWrite(sections({ read: true, write: true }), false, true)).toBe(true);
  });

  test("is refused to a member whose rooms section only reads", () => {
    expect(roomMayWrite(sections({ read: true, write: false }), false, true)).toBe(false);
  });

  test("is refused to a member whose rooms section is taken away", () => {
    expect(roomMayWrite({}, false, true)).toBe(false);
  });

  test("is held by the administrator whatever the permission says", () => {
    expect(roomMayWrite({}, true, false)).toBe(true);
    expect(roomMayWrite(sections({ read: false, write: false }), true, true)).toBe(true);
  });

  test("is not granted before the permission has been read, so no member meets a box the routes refuse", () => {
    expect(roomMayWrite(sections({ read: true, write: true }), false, false)).toBe(false);
  });
});
