import { describe, expect, test } from "bun:test";

import english from "../../apps/web/i18n/locales/en.yaml";
import japanese from "../../apps/web/i18n/locales/ja.yaml";
import korean from "../../apps/web/i18n/locales/ko.yaml";
import chinese from "../../apps/web/i18n/locales/zh-CN.yaml";
import { ROAD_NAMES, roadName } from "../../apps/web/shared/roads";
import { packEntries, wordingIn } from "../../apps/web/shared/wording";

import RECEIVER_ROADS from "../fixtures/shared/receiver-roads.json";

import type { Pack } from "../../apps/web/shared/wording";

// What the console calls a chat road (docs/web.md, 「A chat road's name」): each road the receiver declares by its key, in
// every pack's own words, and a road no pack names by the pack's word for a messenger, never the receiver's label.
// The receiver's files are never read here, so its road keys stand captured in a fixture: the record its policy
// declares (`policy/roads.toml`, `[record] key`) and each chat service a receiver configuration names a road for
// (its `[roads]` table, each service's install declaring the key it is added under).

const PACKS: [string, Pack][] = [
  ["ko", korean as Pack],
  ["en", english as Pack],
  ["ja", japanese as Pack],
  ["zh-CN", chinese as Pack]
];

describe("a chat road's name", () => {
  test("stands for every road the receiver declares", () => {
    expect(RECEIVER_ROADS.keys.filter((key) => !Object.hasOwn(ROAD_NAMES, key))).toEqual([]);
  });

  test.each(PACKS)("is held for every road the receiver declares in the %s pack, in its own words", (_language, pack) => {
    const held = new Map(packEntries(pack));
    const unheld = RECEIVER_ROADS.keys.filter((key) => {
      const words = held.get(ROAD_NAMES[key] ?? "");

      return words === undefined || words.trim() === "";
    });

    expect(unheld).toEqual([]);
    expect(held.get("room.label.road_other")).toContain("{key}");
  });

  test("is said in the reader's language, and a road no pack names is called a messenger with its key, never the receiver's label", () => {
    for (const [language] of PACKS) {
      const say = wordingIn(language as Parameters<typeof wordingIn>[0]);

      expect(roadName(say, "record")).toBe(say("room.label.road_record"));
      expect(roadName(say, "road-z")).toBe(say("room.label.road_other", { key: "road-z" }));
    }

    expect(roadName(wordingIn("ko"), "record")).not.toBe("the room's record");
    expect(roadName(wordingIn("ko"), "toString")).toBe(wordingIn("ko")("room.label.road_other", { key: "toString" }));
  });
});
