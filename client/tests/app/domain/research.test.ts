import { describe, expect, test } from "bun:test";

import { wording } from "../../../apps/web/shared/wording";

import {
  dismissible,
  everyText,
  holdReasonText,
  holdsOf,
  ITEM_STATES,
  itemStateLook,
  languageLabel,
  logKindLook,
  makerText,
  mergedPages,
  newestFirst,
  openableAddress,
  profileLabel,
  researchKeys,
  roadText,
  runOpen,
  shapeLabel,
  sourceKindLabel,
  wordsOf,
  wordsText
} from "../../../apps/web/app/domain/research";

describe("researchKeys", () => {
  test("takes every profile on a research line, in the order the agency lists them", () => {
    const profiles = [
      { key: "agent-a", line: "chat" },
      { key: "search:thorough", line: "search" },
      { key: "gate-a", line: "gate" },
      { key: "browse", line: "browse" }
    ];

    expect(researchKeys(profiles, [])).toEqual(["search:thorough", "browse"]);
  });

  test("adds an assigned key no profile declares when its name puts it on a research line", () => {
    const profiles = [{ key: "search:basic", line: "search" }];
    const assignments = [{ key: "search:basic" }, { key: "search:exhaustive" }, { key: "browse" }, { key: "role:scout" }, { key: "job-worker" }];

    expect(researchKeys(profiles, assignments)).toEqual(["search:basic", "search:exhaustive", "browse"]);
  });

  test("leaves a profiled key to its profile's line, whatever its name", () => {
    expect(researchKeys([{ key: "search-like", line: "worker" }], [{ key: "search-like" }])).toEqual([]);
  });

  test("is empty where the agency serves no research key", () => {
    expect(researchKeys([{ key: "agent-a", line: "chat" }], [{ key: "role:scout" }])).toEqual([]);
  });
});

describe("profileLabel", () => {
  test("names a known key in the pack's words and any other by its key", () => {
    expect(profileLabel(wording, "browse")).toBe(wording("research.label.profile_browse"));
    expect(profileLabel(wording, "search:other")).toBe("search:other");
  });
});

// What the research screen says of the unit's state, its queue and a run (docs/web.md, 「Research screen」).

describe("the queue's words", () => {
  test("says every state the unit names in the pack's words, and one it does not know as a sentence naming it", () => {
    for (const state of ITEM_STATES) expect(itemStateLook(wording, state).label).toBe(wording(`research.label.item_state_${state}`));

    expect(itemStateLook(wording, "lost").label).toBe(wording("research.label.unknown_value", { value: "lost" }));
  });

  test("offers dismissal in every state but taken and dismissed", () => {
    expect(ITEM_STATES.filter(dismissible)).toEqual(["waiting", "running", "reported", "fit", "failed"]);
  });

  test("says an item's and a category's shape, a language and a log line's kind", () => {
    expect(shapeLabel(wording, "manual-or-investigation")).toBe(wording("research.label.shape_manual_or_investigation"));
    expect(languageLabel(wording, "ko")).toBe(wording("research.label.language_ko"));
    expect(languageLabel(wording, "de")).toBe("de");
    expect(logKindLook(wording, "filed").label).toBe(wording("research.label.log_kind_filed"));
  });

  test("names the maker, else the address's host, and opens only a web address", () => {
    expect(makerText({ maker: "maker-a", address: "https://example.com/a" })).toBe("maker-a");
    expect(makerText({ maker: null, address: "https://example.com/a" })).toBe("example.com");
    expect(makerText({ maker: null, address: null })).toBeNull();
    expect(openableAddress("https://example.com/a")).toBe("https://example.com/a");
    expect(openableAddress("javascript:void(0)")).toBeNull();
  });

  test("stands the items newest first, and an item read on two pages once, as the later page has it", () => {
    const pages = [[{ id: 1, createdAt: 10, state: "waiting" }, { id: 2, createdAt: 30, state: "waiting" }], [{ id: 1, createdAt: 10, state: "running" }, { id: 3, createdAt: 20, state: "reported" }]];
    const merged = mergedPages(pages);

    expect(newestFirst(merged).map((item) => item.id)).toEqual([2, 3, 1]);
    expect(merged.find((item) => item.id === 1)?.state).toBe("running");
  });
});

describe("the categories' words", () => {
  test("says a category's road, or the settings' road where it names none", () => {
    expect(roadText(wording, { provider: "provider-a", model: "model-a" })).toBe("provider-a · model-a");
    expect(roadText(wording, { provider: null, model: null })).toBe(wording("research.label.default_road"));
  });

  test("puts a hold under every category it names and says why it holds", () => {
    const holds = [{ categoryNames: ["category-a"], reason: "bench", nodeName: "node-a" }, { categoryNames: ["category-a", "category-b"], reason: "restore", nodeName: null }];

    expect(holdsOf(holds, "category-b")).toEqual([holds[1]!]);
    expect(holdReasonText(wording, holds[0]!)).toBe(wording("research.label.hold_bench", { node: "node-a" }));
    expect(holdReasonText(wording, holds[1]!)).toBe(wording("research.label.hold_restore"));
  });
});

describe("a run", () => {
  test("is read again until it closes", () => {
    expect(runOpen("waiting")).toBe(true);
    expect(runOpen("running")).toBe(true);
    expect(runOpen("closed")).toBe(false);
  });
});

describe("a source", () => {
  test("is read at its own cadence, or at its category's where it names none", () => {
    expect(everyText(wording, 30, 60)).toBe(wording("research.label.every_value", { n: "30" }));
    expect(everyText(wording, null, 60)).toBe(wording("research.label.every_category", { n: "60" }));
  });

  test("says its kind in the pack's words, and one the screen does not know as a sentence naming it", () => {
    expect(sourceKindLabel(wording, "rss")).toBe(wording("research.label.kind_rss"));
    expect(sourceKindLabel(wording, "page")).toBe(wording("research.label.unknown_value", { value: "page" }));
  });

  test("holds its filter's words as a comma-separated box", () => {
    expect(wordsOf(" gguf, ,instruct ")).toEqual(["gguf", "instruct"]);
    expect(wordsText(["gguf", "instruct"])).toBe("gguf, instruct");
  });
});
