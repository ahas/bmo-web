import { expect, test } from "bun:test";

import { namedBy, ownScreenName, READ_NAME_SLOT, screenWords, withReadNames } from "../../../apps/web/app/domain/own-screen-names";

import type { ConsoleScreen } from "../../../apps/web/shared/console-bundles";

// The names of a reader's own screens (docs/web.md, 「Sidebar」, the my-apps section, and 「A reader's own screens」): the reader's
// locale's name where the screen's words carry it, else the maker's, the first language its words carry; a name read
// in the reader's language names its row and keeps the maker's beside it; and a reader's own screen's words standing
// as the maker's in every language of the console's they carry none of, a unit's left as they are.

function screen(name: string, words: ConsoleScreen["words"], personal = true): ConsoleScreen {
  return {
    name,
    title: `${name}.title`,
    icon: "i-material-symbols-apps",
    screenPath: `/my/${name.slice(3)}`,
    role: "member",
    module: "/module.js",
    stylesheet: null,
    words,
    counted: false,
    sidebarSection: "mine",
    ...(personal ? { personal: { reached: true } } : {})
  };
}

const ENGLISH = screen("my-ticket-board", { en: { "my-ticket-board": { title: "Ticket board" } } });
const BOTH = screen("my-notes", { en: { "my-notes": { title: "Notes" } }, ja: { "my-notes": { title: "Notes in ja" } } });

test("a reader's own screen is named in the reader's locale where its words carry it, else by the maker's", () => {
  expect(ownScreenName(BOTH, "ja")).toEqual({ key: "my-notes.title", text: "Notes in ja", own: true });
  expect(ownScreenName(BOTH, "ko")).toEqual({ key: "my-notes.title", text: "Notes", own: false });
  expect(ownScreenName(ENGLISH, "ko")).toEqual({ key: "my-ticket-board.title", text: "Ticket board", own: false });
  expect(ownScreenName(screen("my-notes", { en: { "my-notes": { title: "Notes" } } }, false), "ko")).toBeNull();
  expect(ownScreenName(screen("my-blank", { en: { "my-blank": {} } }), "ko")).toBeNull();
});

test("a name read in the reader's language names its row, drawn through its slot with the maker's beside it", () => {
  const names = new Map([["/my/ticket-board", { key: "my-ticket-board.title", text: "Read board", original: "Ticket board" }]]);
  const named = namedBy((key) => `pack:${key}`, names);
  const sections = [
    {
      name: "Mine",
      items: [
        { label: "Mine", type: "label" as const },
        { label: named("my-ticket-board.title"), to: "/my/ticket-board" },
        { label: named("my-notes.title"), to: "/my/notes" }
      ]
    }
  ];

  expect(named("my-ticket-board.title")).toBe("Read board");
  expect(named("my-notes.title")).toBe("pack:my-notes.title");
  expect(withReadNames(sections, names)[0]!.items).toEqual([
    { label: "Mine", type: "label" },
    { label: "Read board", to: "/my/ticket-board", slot: READ_NAME_SLOT, original: "Ticket board" },
    { label: "pack:my-notes.title", to: "/my/notes" }
  ]);
  expect(withReadNames(sections, new Map())).toBe(sections);
});

test("a reader's own screen's words stand as the maker's in every language they carry none of, a unit's as they are", () => {
  const unit = screen("my-unit", { ko: { "my-unit": { title: "Unit" } } }, false);

  expect(screenWords(BOTH)).toEqual([
    ["en", { "my-notes": { title: "Notes" } }],
    ["ja", { "my-notes": { title: "Notes in ja" } }],
    ["ko", { "my-notes": { title: "Notes" } }],
    ["zh-CN", { "my-notes": { title: "Notes" } }]
  ]);
  expect(screenWords(unit)).toEqual([["ko", { "my-unit": { title: "Unit" } }]]);
});
