import { describe, expect, test } from "bun:test";

import {
  apartLabels,
  branchesOf,
  branchValues,
  composeTranslation,
  currentHeading,
  documentTree,
  headingAtLine,
  leafLabel,
  headingsOf,
  indexLinks,
  inRanges,
  linkedDocument,
  mapScroll,
  scrollAnchors
} from "../../../apps/web/app/domain/documents";

import type { DocumentEntry, DocumentList, DocumentMatch } from "../../../apps/web/shared/types";
import KO from "../../fixtures/app/domain/documents.test.ko.json";

const entry = (root: string, path: string, group: DocumentEntry["group"] = null, title = path): DocumentEntry => ({
  root,
  path,
  title,
  size: 1,
  group,
  fragment: null
});

const list: DocumentList = {
  roots: [
    { key: "people", label: "People", writer: "Editor", available: true },
    { key: "rules", label: "Rulebooks", writer: "Person", available: true },
    { key: "prompts", label: "Prompts", writer: "Deployment", available: true },
    { key: "library", label: "Library", writer: "Digest", available: false }
  ],
  documents: [
    entry("people", "42/sheet.md", { key: "42", kind: "person", name: "Owner" }, "Owner (42) — Sheet"),
    entry("people", "42/chunks/c42-humor.md", { key: "42", kind: "person", name: "Owner" }, "Owner (42) — Humor"),
    entry("people", "7/sheet.md", { key: "7", kind: "person", name: "7" }),
    entry("rules", "answer-shape.md", null, "Answer shape")
  ],
  translation: false
};

describe("the list's tree", () => {
  test("marks documents with the file icon set and roots with folders", () => {
    const tree = documentTree(list, null);

    expect(tree[0]?.icon).toStartWith("i-material-icon-theme-folder");
    expect(tree[1]?.children?.[0]?.icon).toStartWith("i-material-icon-theme-");
  });

  test("tells leaves of one branch that read the same apart, by whole title and then by file", () => {
    const person = { key: "9", kind: "person" as const, name: "Lee" };
    const room = { key: "-1", kind: "room" as const, name: "Room" };
    const leaves = apartLabels([
      { value: "a", label: "Address", document: entry("rooms", "-1/a.md", room, "Kim (1) — Address") },
      { value: "b", label: "Address", document: entry("rooms", "-1/b.md", room, "Lee (2) — Address") },
      { value: "c", label: "Personality", document: entry("people", "9/sheet.md", person, "Lee (9) — Personality") },
      { value: "d", label: "Personality", document: entry("people", "9/chunks/c9-personality.md", person, "Lee (9) — Personality") },
      { value: "e", label: "Humor", document: entry("people", "9/chunks/c9-humor.md", person, "Lee (9) — Humor") }
    ]);

    expect(leaves.map((one) => one.label)).toEqual([
      "Kim (1) — Address",
      "Lee (2) — Address",
      "Lee (9) — Personality · sheet",
      "Lee (9) — Personality · c9-personality",
      "Humor"
    ]);
  });

  test("stands each root, groups a grouping root by person, keeps an empty root and stands a root read from nowhere unread", () => {
    const tree = documentTree(list, null);

    expect(tree.map((item) => item.label)).toEqual(["People", "Rulebooks", "Prompts", "Library"]);
    expect(tree[3]).toMatchObject({ value: "root:library", unread: true });
    expect(tree[3]!.children).toBeUndefined();
    expect(tree[0]!.children!.map((item) => item.label)).toEqual(["Owner", "7"]);
    expect(tree[0]!.children![0]!.children!.map((item) => item.label)).toEqual(["Sheet", "Humor"]);
    expect(tree[1]!.children![0]).toMatchObject({ value: "doc:rules/answer-shape.md", label: "Answer shape" });
    expect(tree[2]!.children).toEqual([]);
  });

  test("under a search, stands only what was found, with where it was found", () => {
    const matches: DocumentMatch[] = [
      { root: "people", path: "42/chunks/c42-humor.md", title: "Humor", where: "body", line: 3, snippet: "…jokes…" }
    ];
    const tree = documentTree(list, matches);

    expect(tree).toHaveLength(1);
    expect(tree[0]!.children).toHaveLength(1);
    expect(tree[0]!.children![0]!.children).toEqual([expect.objectContaining({ label: "Humor", matches })]);
    expect(branchValues(tree)).toEqual(["root:people", "group:people:42"]);
    expect(documentTree(list, [])).toEqual([]);
  });

  test("knows the branches above a document", () => {
    const tree = documentTree(list, null);

    expect(branchesOf(tree, "doc:people/42/chunks/c42-humor.md")).toEqual(["root:people", "group:people:42"]);
    expect(branchesOf(tree, "doc:rules/answer-shape.md")).toEqual(["root:rules"]);
    expect(branchesOf(tree, "doc:rules/missing.md")).toEqual([]);
  });
});

describe("the name a leaf is shown by", () => {
  const leaf = (title: string, path = "42/chunks/c42-x.md", grouped = true): DocumentEntry => ({
    root: "people",
    path,
    title,
    size: 1,
    group: grouped ? { key: "42", kind: "person" as const, name: "Owner" } : null,
    fragment: null
  });

  const asFragment = (one: DocumentEntry, title: string): DocumentEntry => ({
    ...one,
    fragment: {
      kind: "person-book",
      kindLabel: "Person book",
      agent: "agent-a",
      chatId: null,
      room: null,
      owner: 42,
      slug: "c42-x",
      title,
      keywords: [],
      active: true,
      lastHitAt: null,
      hits: 0,
      handAt: null
    }
  });

  test("is the title, without the lead a group already says", () => {
    expect(leafLabel(leaf("owner (Owner, 10000001) — Address"))).toBe("Address");
    expect(leafLabel(leaf("Ivy Lee (4000000004) — Working requests"))).toBe("Working requests");
  });

  test("keeps a title whose dash is its own", () => {
    expect(leafLabel(leaf("Person book — common"))).toBe("Person book — common");
    expect(leafLabel(leaf("A (b) — c", "x.md", false))).toBe("A (b) — c");
  });

  test("falls back to the file name where there is no title", () => {
    expect(leafLabel(leaf("", "rules/answer-shape.md", false))).toBe("answer-shape");
  });

  test("a fragment stands by the title its index entry carries", () => {
    expect(leafLabel(asFragment(leaf("owner (Owner, 10000001) — Address"), "Where they live and how they get about"))).toBe("Where they live and how they get about");
  });

  test("a fragment whose entry says nothing falls back to the document's own title", () => {
    expect(leafLabel(asFragment(leaf("owner (Owner, 10000001) — Address"), "  "))).toBe("Address");
  });
});

describe("two panes kept together", () => {
  const anchors = scrollAnchors(
    [
      { from: 100, to: 300 },
      { from: 90, to: 400 },
      { from: 200, to: 350 }
    ],
    { from: 400, to: 1000 }
  );

  test("take their anchors in order and leave out one that runs backwards", () => {
    expect(anchors).toEqual([
      { from: 0, to: 0 },
      { from: 100, to: 300 },
      { from: 200, to: 350 },
      { from: 400, to: 1000 }
    ]);
  });

  test("land as far between two anchors as the offset stands between them", () => {
    expect(mapScroll(anchors, 50)).toBe(150);
    expect(mapScroll(anchors, 150)).toBe(325);
    expect(mapScroll(anchors, 300)).toBe(675);
    expect(mapScroll(anchors, -5)).toBe(0);
    expect(mapScroll(anchors, 5000)).toBe(1000);
    expect(mapScroll([], 10)).toBe(0);
  });

  test("and the same pair read the other way round lands back where it started", () => {
    const back = anchors.map((anchor) => ({ from: anchor.to, to: anchor.from }));

    expect(mapScroll(back, mapScroll(anchors, 150))).toBe(150);
  });
});

describe("the heading being read", () => {
  const tops = [
    { slug: "a", top: 0 },
    { slug: "b", top: 300 },
    { slug: "c", top: 800 }
  ];

  test("is the last whose top has passed the top of the pane", () => {
    expect(currentHeading(tops, 0)).toBe("a");
    expect(currentHeading(tops, 295)).toBe("b");
    expect(currentHeading(tops, 799)).toBe("c");
    expect(currentHeading([{ slug: "x", top: 500 }], 0)).toBe("x");
    expect(currentHeading([], 0)).toBeNull();
  });

  test("of a source line is the heading above it", () => {
    const headings = headingsOf(KO.line_212);

    expect(headingAtLine(headings, 1)).toBeNull();
    expect(headingAtLine(headings, 3)?.slug).toBe(KO.line_215);
    expect(headingAtLine(headings, 5)?.slug).toBe(KO.line_216);
  });
});

describe("a translation still arriving", () => {
  test("shows the parts done, the originals of the rest, and knows which lines are which", () => {
    const composed = composeTranslation([
      { part: 0, source: KO.line_223, text: "# One\n\nText", failed: false, failure: null },
      { part: 1, source: KO.line_224, text: null, failed: false, failure: null },
      { part: 2, source: KO.line_225, text: null, failed: true, failure: null }
    ]);

    expect(composed.text).toBe(KO.line_228);
    expect(composed.waiting).toEqual([{ from: 5, to: 8 }]);
    expect(composed.failed).toEqual([{ from: 9, to: 10 }]);
    expect(headingsOf(composed.text).map((heading) => heading.line)).toEqual([1, 5, 9]);
    expect(inRanges(composed.waiting, 6)).toBe(true);
    expect(inRanges(composed.waiting, 3)).toBe(false);
  });
});

describe("links inside a document", () => {
  test("open another document of the same root, and nothing that leaves it", () => {
    expect(linkedDocument("42/index.md", "chunks/c42-humor.md")).toEqual({ path: "42/chunks/c42-humor.md", hash: null });
    expect(linkedDocument("docs/a.md", KO.line_240)).toEqual({ path: "docs/b.md", hash: KO.line_240_2 });
    expect(linkedDocument("docs/a.md", "../README.md")).toEqual({ path: "README.md", hash: null });
    expect(linkedDocument("a.md", "../x.md")).toBeNull();
    expect(linkedDocument("a.md", "https://example.org/x.md")).toBeNull();
    expect(linkedDocument("a.md", KO.line_244)).toBeNull();
    expect(linkedDocument("a.md", "/etc/x.md")).toBeNull();
    expect(linkedDocument("a.md", "b.txt")).toBeNull();
  });

  test("an index's slugs name the pieces beside it or under its chunks", () => {
    const documents = [
      entry("people", "42/index.md"),
      entry("people", "42/sheet.md"),
      entry("people", "42/chunks/c42-humor.md"),
      entry("knowledge", "index.md"),
      entry("knowledge", "voice.md"),
      entry("people", "7/chunks/c7-humor.md")
    ];

    expect([...indexLinks(documents, "people", "42/index.md")]).toEqual([
      ["sheet", "42/sheet.md"],
      ["c42-humor", "42/chunks/c42-humor.md"]
    ]);
    expect([...indexLinks(documents, "knowledge", "index.md")]).toEqual([["voice", "voice.md"]]);
    expect(indexLinks(documents, "people", "42/sheet.md").size).toBe(0);
  });
});
