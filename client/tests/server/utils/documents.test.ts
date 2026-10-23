import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { wording } from "../../../apps/web/shared/wording";
import { scratchDir } from "../../support/scratch";
import {
  checkoutRoot,
  documentRoots,
  documentRootViews,
  findDocumentRoot,
  isDocumentPath,
  listDocuments,
  readDocument,
  resolveDocument,
  searchDocuments,
  seekInText
} from "../../../apps/web/server/utils/documents";

// The document viewer's reading of the disk, against two checkouts of this test's own. What it is held to is
// that a checkout's documents are its `docs/` and the upper-case markdown at its top, that nothing outside a
// root's base is listed or read — not through `..`, not through an absolute path, not through a symlink — that no
// secret ever stands in the list, that the roots other units keep stand unread, and that a question is answered
// by the documents' own text.

const scratch = scratchDir("bmo-web-documents-");
const first = join(scratch, "first");
const second = join(scratch, "second");
const outside = join(scratch, "outside");

function put(path: string, text: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
}

put(join(first, "README.md"), "# The first checkout\n\nReadme.\n");
put(join(first, "CLAUDE.md"), "# Working in this repository\n\n## Large documents\n\nRead the index.\n");
put(join(first, "notes.md"), "# a lower-case file at the top is no document\n");
put(join(first, ".env"), "TOKEN=secret\n");
put(join(first, "server", "inside-code.md"), "# code-side markdown\n");
put(join(first, "docs", "web.md"), "# Web console\n\n## Document viewer screen\n\nWhere the tester reads. It is read in the resting state too.\n\n## Room screen\n\nWhere a room is read.\n");
put(join(first, "docs", "lore", "history.md"), "# A history\n");
put(join(first, "docs", ".hidden", "x.md"), "# hidden\n");
put(join(first, "docs", "node_modules", "pkg", "README.md"), "# vendored\n");
put(join(first, "docs", "notes.txt"), "not markdown\n");
put(join(second, "docs", "deploy.md"), "# Deployment\n\n## Rolling back\n\nThe release before is put back when the health check fails.\n");
put(join(outside, "secret.md"), "# outside secret\n");
put(join(outside, "tree", "leak.md"), "# leaked through a directory link\n");

symlinkSync(join(outside, "secret.md"), join(first, "docs", "linked-out.md"));
symlinkSync(join(outside, "tree"), join(first, "docs", "linked-dir"));
symlinkSync(join(first, "docs", "web.md"), join(first, "docs", "linked-in.md"));
symlinkSync(join(first, ".env"), join(first, "docs", "env.md"));
symlinkSync(join(first, "server", "inside-code.md"), join(first, "docs", "code.md"));

afterAll(() => rmSync(scratch, { recursive: true, force: true }));

const roots = [checkoutRoot("first", "First", first), checkoutRoot("second", "Second", second)];
const root = (key: string) => findDocumentRoot(key, roots)!;
const names = (): string[] => listDocuments(roots).map((entry) => `${entry.root}/${entry.path}`);

describe("the roots a deployment names", () => {
  test("are read from the setting, a key, a label and an absolute checkout each", () => {
    const named = documentRoots({ DOCUMENT_ROOTS: JSON.stringify([{ key: "first", label: "First", checkout: first }, { key: "second", label: "Second", checkout: second }]) });

    expect(named.map((one) => [one.key, one.label, one.base])).toEqual([
      ["first", "First", first],
      ["second", "Second", second]
    ]);
  });

  test("leave out a root that does not read, a relative checkout, a key taken twice and a key another unit's root holds", () => {
    expect(documentRoots({})).toEqual([]);
    expect(documentRoots({ DOCUMENT_ROOTS: "not a list" })).toEqual([]);
    expect(
      documentRoots({
        DOCUMENT_ROOTS: JSON.stringify([
          { key: "first", label: "First", checkout: first },
          { key: "first", label: "Again", checkout: second },
          { key: "relative", label: "Relative", checkout: "docs" },
          { key: "Upper", label: "Upper", checkout: first },
          { key: "knowledge", label: "Knowledge", checkout: first },
          { key: "nameless", label: " ", checkout: first }
        ])
      }).map((one) => one.key)
    ).toEqual(["first"]);
  });

  test("stand in the list before the roots other units keep, which stand unread", () => {
    const views = documentRootViews(roots);

    expect(views.slice(0, 2)).toEqual([
      { key: "first", label: "First", writer: wording("documents.label.writer_person"), available: true, unread: null },
      { key: "second", label: "Second", writer: wording("documents.label.writer_person"), available: true, unread: null }
    ]);
    expect(views.slice(2).map((one) => [one.key, one.available])).toEqual([
      ["people", false],
      ["room-people", false],
      ["room-rules", false],
      ["knowledge", false],
      ["rules", false],
      ["persona", false],
      ["agents", false],
      ["prompts", false]
    ]);
    expect(views.find((one) => one.key === "knowledge")?.label).toBe(wording("documents.label.root_knowledge"));
  });

  test("name for each unread root where it belongs: the brain's library its own screen, the agency's documents its route", () => {
    const why = new Map(documentRootViews([]).map((one) => [one.key, one.unread]));

    for (const key of ["people", "room-people", "room-rules", "knowledge"]) {
      expect(why.get(key)).toBe(wording("documents.message.root_unread_brain"));
    }

    for (const key of ["rules", "persona", "agents", "prompts"]) {
      expect(why.get(key)).toBe(wording("documents.message.root_unread_agency"));
    }
  });
});

describe("the list", () => {
  test("holds each checkout's docs and its upper-case files at the top, and nothing else", () => {
    expect(names()).toEqual(["first/docs/lore/history.md", "first/docs/web.md", "first/CLAUDE.md", "first/README.md", "second/docs/deploy.md"]);
  });

  test("never follows a symlink, lists no dot entry, vendored tree or secret, and no lower-case file at the top", () => {
    const listed = names().join("\n");

    for (const absent of ["linked", "leak", "secret", ".env", "env.md", "hidden", "node_modules", "vendored", "notes", "inside-code", "code.md"]) {
      expect(listed).not.toContain(absent);
    }
  });

  test("titles each document by its first heading", () => {
    expect(listDocuments(roots).find((entry) => entry.path === "docs/web.md")?.title).toBe("Web console");
  });

  test("a missing checkout is a root with nothing in it", () => {
    expect(listDocuments([checkoutRoot("gone", "Gone", join(scratch, "nowhere"))])).toEqual([]);
  });
});

describe("the path guard", () => {
  test("refuses any path that could not be a document path", () => {
    for (const path of [
      "",
      "../outside/secret.md",
      "a/../b.md",
      "./web.md",
      "/etc/passwd.md",
      join(outside, "secret.md"),
      "a//b.md",
      "a\\b.md",
      "web.md\0.md",
      ".env.md",
      "x/.git/config.md",
      "web.txt",
      "web",
      42
    ]) {
      expect(isDocumentPath(path)).toBe(false);
    }

    expect(isDocumentPath("docs/web.md")).toBe(true);
  });

  test("reads nothing outside a root's base, through a link or otherwise", () => {
    expect(resolveDocument(root("first"), "docs/linked-out.md")).toBeNull();
    expect(resolveDocument(root("first"), "docs/linked-dir/leak.md")).toBeNull();
    expect(resolveDocument(root("first"), "docs/env.md")).toBeNull();
    expect(resolveDocument(root("first"), "docs/code.md")).toBeNull();
    expect(resolveDocument(root("second"), "../first/docs/web.md")).toBeNull();
    expect(resolveDocument(root("first"), "docs/notes.txt")).toBeNull();
    expect(resolveDocument(root("first"), "docs/missing.md")).toBeNull();
  });

  test("reads a link that stays among its root's documents", () => {
    expect(resolveDocument(root("first"), "docs/linked-in.md")).toBe(join(first, "docs", "web.md"));
  });

  test("holds each root to its own rule, even inside its base", () => {
    expect(resolveDocument(root("first"), "notes.md")).toBeNull();
    expect(resolveDocument(root("first"), "server/inside-code.md")).toBeNull();
    expect(resolveDocument(root("first"), "README.md")).not.toBeNull();
  });

  test("knows only the declared roots", () => {
    expect(findDocumentRoot("secrets", roots)).toBeNull();
    expect(findDocumentRoot(undefined, roots)).toBeNull();
    expect(findDocumentRoot("knowledge", roots)).toBeNull();
  });
});

describe("a document read", () => {
  test("comes whole with its version, its writer and its language", () => {
    const read = readDocument(root("second"), "docs/deploy.md")!;

    expect(read).toMatchObject({ root: "second", label: "Second", writer: wording("documents.label.writer_person"), title: "Deployment", language: "en" });
    expect(read.version).toMatch(/^[0-9a-f]{64}$/);
    expect(readDocument(root("first"), "docs/linked-out.md")).toBeNull();
  });
});

describe("searching the documents", () => {
  test("finds names and titles first, then body lines with the text around them", () => {
    const found = searchDocuments(roots, "resting", 10);

    expect(found).toEqual([expect.objectContaining({ root: "first", path: "docs/web.md", where: "body", line: 5 })]);
    expect(found[0]?.snippet).toContain("resting state too");
    expect(searchDocuments(roots, "deploy.md", 10)[0]).toMatchObject({ where: "name", root: "second" });
    expect(searchDocuments(roots, "web console", 10)[0]).toMatchObject({ where: "title" });
  });

  test("finds a document by the name the list shows it under, and names what it found the same way", () => {
    const shown = new Map([["second/docs/deploy.md", "How a release goes out and comes back"]]);

    expect(searchDocuments(roots, "comes back", 10, shown)[0]).toMatchObject({ where: "title", root: "second", title: "How a release goes out and comes back" });
  });

  test("never finds a word that only a file outside the list holds", () => {
    expect(searchDocuments(roots, "outside secret", 10)).toEqual([]);
    expect(searchDocuments(roots, "TOKEN=secret", 10)).toEqual([]);
    expect(searchDocuments(roots, "leaked", 10)).toEqual([]);
    expect(searchDocuments(roots, "   ", 10)).toEqual([]);
  });
});

describe("a question asked", () => {
  test("of every document stands the documents holding most of its words, each at the heading that holds them", () => {
    const picks = seekInText(roots, "what happens when the health check fails", null);

    expect(picks[0]).toEqual({ root: "second", path: "docs/deploy.md", title: "Deployment", heading: "rolling-back" });
    // A document holding fewer of the words stands after it.
    expect(picks.slice(1).map((pick) => pick.path)).toContain("docs/web.md");
    expect(seekInText(roots, "where is a room read", null)[0]).toEqual({ root: "first", path: "docs/web.md", title: "Web console", heading: "room-screen" });
  });

  test("of one document goes to its section holding most of the words", () => {
    expect(seekInText(roots, "the resting state", { root: root("first"), path: "docs/web.md" })).toEqual([
      { root: "first", path: "docs/web.md", title: "Web console", heading: "document-viewer-screen" }
    ]);
  });

  test("whose words no document holds finds nothing", () => {
    expect(seekInText(roots, "zebra quartz", null)).toEqual([]);
    expect(seekInText(roots, "  ", null)).toEqual([]);
  });
});
