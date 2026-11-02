import { expect, test } from "bun:test";

import { mergedCounts } from "../../../apps/web/app/domain/sidebar-unread";

// The sidebar counts as the sidebar holds them (docs/web.md, 「Sidebar」): the console's answer replaces each count
// that answered, and every other count stands as the sidebar last held it.

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
