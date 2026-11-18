import { describe, expect, test } from "bun:test";

import { wording } from "../../../apps/web/shared/wording";

import {
  dismissible,
  everyText,
  followFields,
  followOfAddress,
  followOfItem,
  holdReasonText,
  holdsOf,
  isStuck,
  ITEM_CHANGES,
  ITEM_STATES,
  itemStateLook,
  languageLabel,
  logKindLook,
  makerText,
  mergedPages,
  openableAddress,
  originLine,
  retryDue,
  parentText,
  profileLabel,
  queueOrder,
  roadText,
  runOpen,
  shapeLabel,
  sourceKindLabel,
  wordsOf,
  wordsText,
  calendarText,
  isResearchTab,
  periodMinutes,
  periodOf,
  periodText,
  TOPIC_NAME
} from "../../../apps/web/app/domain/research";

describe("a topic", () => {
  test("says its period in the largest unit that divides it whole", () => {
    expect(periodOf(1_440)).toEqual({ count: 1, unit: "day" });
    expect(periodOf(4_320)).toEqual({ count: 3, unit: "day" });
    expect(periodOf(720)).toEqual({ count: 12, unit: "hour" });
    expect(periodOf(90)).toEqual({ count: 90, unit: "minute" });
    expect(periodMinutes(3, "day")).toBe(4_320);
    expect(periodMinutes(12, "hour")).toBe(720);
    expect(periodText(wording, 720)).toBe(wording("research.label.period_every_hour", { n: "12" }));
    expect(periodText(wording, 1_440)).toBe(wording("research.label.period_every_day", { n: "1" }));
    expect(periodText(wording, null)).toBe("—");
  });

  test("names its calendar by the realm's word and the calendar's id, or says it has none", () => {
    expect(calendarText(wording, { realm: "organization", calendarId: "calendar-a" })).toBe(`${wording("research.label.calendar_organization")} · calendar-a`);
    expect(calendarText(wording, { realm: "mine", calendarId: "calendar-b" })).toBe(`${wording("research.label.calendar_mine")} · calendar-b`);
    expect(calendarText(wording, null)).toBe(wording("common.label.none"));
  });

  test("takes a name of a lower-case letter and then lower-case letters, digits and dashes, at most 32", () => {
    for (const name of ["a", "topic-7", `a${"b".repeat(31)}`]) expect(TOPIC_NAME.test(name)).toBe(true);
    for (const name of ["", "7topic", "Topic", "topic_a", `a${"b".repeat(32)}`]) expect(TOPIC_NAME.test(name)).toBe(false);
  });

  test("stands in a tab of its own", () => {
    expect(isResearchTab("topics")).toBe(true);
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

  test("marks every state with an icon of its own, spinning only while the work is under way", () => {
    expect(new Set(ITEM_STATES.map((state) => itemStateLook(wording, state).icon)).size).toBe(ITEM_STATES.length - 1);
    expect(ITEM_STATES.filter((state) => itemStateLook(wording, state).spins)).toEqual(["running", "finishing"]);
  });

  test("offers dismissal in every state but taken and dismissed", () => {
    expect(ITEM_STATES.filter(dismissible)).toEqual(["waiting", "running", "finishing", "reported", "fit", "stuck"]);
  });

  test("knows no failed state, and says a stuck item in its own words and in the error colour", () => {
    expect(ITEM_STATES).not.toContain("failed");
    expect(itemStateLook(wording, "stuck")).toMatchObject({ label: wording("research.label.item_state_stuck"), color: "error" });
  });

  test("says a finishing item in its own words and in the colour a running one wears", () => {
    expect(itemStateLook(wording, "finishing")).toMatchObject({ label: wording("research.label.item_state_finishing"), color: itemStateLook(wording, "running").color });
  });

  test("offers asking again and moving to the front on a stuck item alone", () => {
    expect(ITEM_STATES.filter(isStuck)).toEqual(["stuck"]);
  });

  test("asks the unit each change by its own body, with words for its failure", () => {
    expect(ITEM_CHANGES.dismiss.body).toEqual({ state: "dismissed" });
    expect(ITEM_CHANGES.reask.body).toEqual({ state: "waiting" });
    expect(ITEM_CHANGES.front.body).toEqual({ front: true });

    for (const change of Object.values(ITEM_CHANGES)) {
      expect(wording(change.failed)).not.toBe("");
    }
  });

  test("says when the next try is due for a waiting or a stuck item that holds a retry wait", () => {
    expect(retryDue({ state: "waiting", retryAt: 10 })).toBe(10);
    expect(retryDue({ state: "stuck", retryAt: 20 })).toBe(20);
    expect(retryDue({ state: "stuck", retryAt: null })).toBeNull();
    expect(retryDue({ state: "reported", retryAt: 10 })).toBeNull();
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

  test("stands an item read on two pages once, as the later page has it", () => {
    const pages = [[{ id: 1, state: "waiting" }, { id: 2, state: "waiting" }], [{ id: 1, state: "running" }, { id: 3, state: "reported" }]];
    const merged = mergedPages(pages);

    expect(merged.map((item) => item.id)).toEqual([1, 2, 3]);
    expect(merged.find((item) => item.id === 1)?.state).toBe("running");
  });

  test("stands the running first, then the stuck oldest first, then the finished newest first, then the waiting oldest first", () => {
    const item = (id: number, state: string, createdAt: number, changedAt: number) => ({ id, state, createdAt, changedAt });
    const items = [
      item(1, "waiting", 30, 30),
      item(2, "reported", 10, 50),
      item(3, "running", 40, 70),
      item(4, "waiting", 20, 20),
      item(5, "stuck", 15, 60),
      item(6, "dismissed", 5, 40),
      item(7, "running", 35, 65),
      item(8, "fit", 12, 55),
      item(9, "taken", 8, 45),
      item(10, "waiting", 20, 20),
      item(11, "stuck", 3, 80)
    ];

    expect(queueOrder(items).map((one) => one.id)).toEqual([7, 3, 11, 5, 8, 2, 9, 6, 4, 10, 1]);
  });

  test("keeps the order within what a choice narrowed the queue to", () => {
    const narrowed = [{ id: 1, state: "waiting", createdAt: 30, changedAt: 30 }, { id: 2, state: "waiting", createdAt: 10, changedAt: 10 }];

    expect(queueOrder(narrowed).map((one) => one.id)).toEqual([2, 1]);
  });
});

describe("the categories' words", () => {
  test("says a category's road, or the settings' road where it names none", () => {
    expect(roadText(wording, { provider: "provider-a", model: "model-a" })).toBe("provider-a · model-a");
    expect(roadText(wording, { provider: null, model: null })).toBe(wording("research.label.default_road"));
  });

  test("puts a hold under every category it names and says why it holds", () => {
    const holds = [{ categoryNames: ["category-a"], reason: "bench" }, { categoryNames: ["category-a", "category-b"], reason: "restore" }];

    expect(holdsOf(holds, "category-b")).toEqual([holds[1]!]);
    expect(holdReasonText(wording, holds[0]!)).toBe(wording("research.label.hold_bench"));
    expect(holdReasonText(wording, holds[1]!)).toBe(wording("research.label.hold_restore"));
    expect(holdReasonText(wording, { reason: "waiting-card" })).toBe(wording("research.label.hold_waiting_card"));
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

describe("where an item came from", () => {
  const none = { source: null, because: null, itemId: null, documentId: null, title: null, shareUrl: null };

  test("says a scan's source, or that it no longer stands", () => {
    expect(originLine(wording, { ...none, kind: "source", source: "rss https://example.com/feed" })).toEqual({ text: wording("research.label.origin_source", { source: "rss https://example.com/feed" }), link: null, because: null });
    expect(originLine(wording, { ...none, kind: "source" })?.text).toBe(wording("research.label.origin_source_gone"));
  });

  test("says an ask's words, and nothing for an ask made with none", () => {
    expect(originLine(wording, { ...none, kind: "asked", because: "why" })?.text).toBe(wording("research.label.origin_asked", { because: "why" }));
    expect(originLine(wording, { ...none, kind: "asked" })).toBeNull();
  });

  test("names a follow-up's parent by its title, else its document's number, linked to its page", () => {
    expect(originLine(wording, { ...none, kind: "follow-up", because: "why", itemId: 1, documentId: 11, title: "parent", shareUrl: "https://example.com/parent" })).toEqual({
      text: wording("research.label.origin_follow_up", { title: "parent" }),
      link: "https://example.com/parent",
      because: "why"
    });
    expect(originLine(wording, { ...none, kind: "follow-up", documentId: 11, shareUrl: "file:///parent" })).toEqual({ text: wording("research.label.origin_follow_up_document", { id: "11" }), link: null, because: null });
    expect(parentText(wording, { title: null, documentId: 12 })).toBe(wording("research.label.origin_follow_up_document", { id: "12" }));
  });

  test("names a kind the screen has no words for", () => {
    expect(originLine(wording, { ...none, kind: "imported" })?.text).toBe(wording("research.label.unknown_value", { value: "imported" }));
  });
});

describe("a follow-up", () => {
  const item = { id: 4, documentId: 11, title: null, name: "item-4", categoryName: "category-a", address: "https://example.com/4" };

  test("follows an item once it has filed a document, named by its title, else its name", () => {
    expect(followOfItem(item)).toEqual({ itemId: 4, documentId: 11, title: "item-4", categoryName: "category-a", address: "https://example.com/4" });
    expect(followOfItem({ ...item, title: "doc title" })?.title).toBe("doc title");
    expect(followOfItem({ ...item, documentId: null })).toBeNull();
  });

  test("follows the document an address names by its number alone", () => {
    expect(followOfAddress("11")).toEqual({ itemId: null, documentId: 11, title: null, categoryName: null, address: null });
    expect(followOfAddress("0")).toBeNull();
    expect(followOfAddress("eleven")).toBeNull();
    expect(followOfAddress(undefined)).toBeNull();
  });

  test("carries the item where it follows one, else the document, and the owner's words where they gave some", () => {
    expect(followFields(followOfItem(item), " why ")).toEqual({ because: "why", followsItemId: 4 });
    expect(followFields(followOfAddress("11"), "")).toEqual({ followsDocumentId: 11 });
    expect(followFields(null, "why")).toEqual({ because: "why" });
    expect(followFields(null, "  ")).toEqual({});
  });
});
