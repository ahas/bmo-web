import { expect, test } from "bun:test";

import { coalesced, mergedCounts } from "../../../apps/web/app/domain/sidebar-unread";

// The sidebar counts as the sidebar holds them (docs/web.md, 「Sidebar」): the console's answer replaces each count
// that answered, and every other count stands as the sidebar last held it; a word that a count may have moved, heard
// while a read is in the air, reads once more after it.

test("a count that answered replaces its own, and one that did not answer stands", () => {
  expect(mergedCounts({ "/mail": 3, "/artifact": 1 }, { "/mail": 7 })).toEqual({ "/mail": 7, "/artifact": 1 });
  expect(mergedCounts({}, { "/mail": 0 })).toEqual({ "/mail": 0 });
});

test("an answer that holds no counts leaves every count standing", () => {
  const held = { "/mail": 3 };

  for (const answer of [null, [], "7", { "/mail": -1 }, { "/mail": 2.5 }, { "/mail": "7" }]) {
    expect(mergedCounts(held, answer)).toEqual(held);
  }
});

test("words heard while a read is in the air read once more after it, never beside it", async () => {
  const answers: (() => void)[] = [];
  let reads = 0;
  const read = coalesced(async () => {
    reads += 1;
    await new Promise<void>((resolve) => answers.push(resolve));
  });

  const first = read();

  void read();
  void read();
  expect(reads).toBe(1);

  answers.shift()!();
  for (let turn = 0; turn < 20 && reads < 2; turn += 1) await Promise.resolve();
  expect(reads).toBe(2);

  answers.shift()!();
  await first;
  expect(reads).toBe(2);

  void read();
  expect(reads).toBe(3);
  answers.shift()!();
});
