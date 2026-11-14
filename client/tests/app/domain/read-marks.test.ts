import { expect, test } from "bun:test";

import { readThrough } from "../../../apps/web/app/domain/read-marks";

// How far a room is read once a row is seen (docs/web.md, 「Sidebar」, 「Unread messages」). Messages are named by
// their exact ids, here neighbours past 2^53 that a JavaScript number would read as one.

const BASE = 3_973_025_898_369_060_100n;
const id = (nth: number): string => String(BASE + BigInt(nth));
const line = [10, 11, 12, 13, 14].map((nth) => ({ messageId: id(nth) }));

test("a seen row reads on over what stands as no row of its own, up to the next row", () => {
  // 11 is a picture of 10's album and 14 the voice of 13's line.
  const rows = new Set([id(10), id(12), id(13)]);

  expect(readThrough(line, rows, id(10))).toBe(id(11));
  expect(readThrough(line, rows, id(12))).toBe(id(12));
  expect(readThrough(line, rows, id(13))).toBe(id(14));
  expect(readThrough(line, rows, id(99))).toBeNull();
});
