import { createHash } from "node:crypto";
import { closeSync, existsSync, lstatSync, openSync, readdirSync, readFileSync, readSync, realpathSync, statSync } from "node:fs";
import { isAbsolute, join, relative, resolve, sep } from "node:path";

import { markdownHeadings } from "#shared/markdown-structure";
import { textLanguage } from "#shared/translation";
import { wording } from "#shared/wording";

import type { DocumentEntry, DocumentMatch, DocumentRootView, DocumentSeekPick, DocumentView } from "#shared/types";

// The document viewer's reading of the disk (`docs/documents-viewer.md`). Every document belongs to one root, and
// each root says for itself what it is: its label, its base directory, where its listing starts, which files under
// it are documents and who writes them. Listing, reading and searching take the roots as they are declared and
// never turn on a root's name.
//
// The roots read here are checkouts a setting names, `DOCUMENT_ROOTS`: a JSON list of roots, each its `key`, its
// `label` and the top of its `checkout`. The roots the agency keeps are its own and are read through no route yet,
// so they stand in the list unread.

export interface DocumentRoot {
  key: string;
  label: string;
  writer: string;
  // The directory nothing of this root may resolve outside of.
  base: string;
  // Where the listing walks from, relative to the base: directories or single files.
  starts(): string[];
  // Whether a path relative to the base is one of this root's documents. This is the closed rule; a file inside
  // the base that it does not accept is not a document here.
  accepts(path: string): boolean;
}

// The upper-case markdown files at a checkout's top, which are documents beside its `docs/`.
const TOP_DOCUMENT = /^[A-Z][A-Z0-9_-]*\.md$/;
// A root's key, which document names begin with.
const ROOT_KEY = /^[a-z0-9][a-z0-9-]*$/;

/** A checkout's documents: the markdown files under its `docs/` and the upper-case ones at its top. */
export function checkoutRoot(key: string, label: string, checkout: string): DocumentRoot {
  return {
    key,
    label,
    writer: wording("documents.label.writer_person"),
    base: checkout,
    starts: () => {
      let top: string[] = [];

      try {
        top = readdirSync(checkout).filter((name) => TOP_DOCUMENT.test(name)).toSorted();
      } catch {
        // A checkout that is not there lists nothing.
      }

      return ["docs", ...top];
    },
    accepts: (path) => (TOP_DOCUMENT.test(path) && !path.includes("/")) || path.startsWith("docs/")
  };
}

// The roots another unit keeps: the agency's documents, read through a route the agency serves for whole
// documents, which it serves none of yet (`docs/documents-viewer.md`, 「The roots kept by other units」). Each says
// where it belongs, the sentence its unread mark is named by.
const UNREAD_ROOTS: readonly DocumentRootView[] = [
  { key: "rules", label: "documents.label.root_rules", writer: "documents.label.writer_person", unread: "documents.message.root_unread_agency" },
  { key: "agents", label: "documents.label.root_agents", writer: "documents.label.writer_person", unread: "documents.message.root_unread_agency" },
  { key: "prompts", label: "documents.label.root_system_prompts", writer: "documents.label.writer_deploy", unread: "documents.message.root_unread_agency" }
].map((root) => ({ key: root.key, label: wording(root.label), writer: wording(root.writer), available: false, unread: wording(root.unread) }));

interface NamedRoot {
  key?: unknown;
  label?: unknown;
  checkout?: unknown;
}

let warned: string | null = null;

/** The roots the deployment names, in the order it names them. A setting that does not read names none. */
export function documentRoots(environment: Record<string, string | undefined> = process.env): DocumentRoot[] {
  const setting = environment.DOCUMENT_ROOTS?.trim() ?? "";

  if (setting === "") return [];

  let named: unknown;

  try {
    named = JSON.parse(setting);
  } catch {
    named = null;
  }

  const unread = new Set(UNREAD_ROOTS.map((root) => root.key));
  const roots = Array.isArray(named)
    ? (named as NamedRoot[]).flatMap((one) =>
        typeof one?.key === "string" && ROOT_KEY.test(one.key) && !unread.has(one.key) && typeof one.label === "string" && one.label.trim() !== "" && typeof one.checkout === "string" && isAbsolute(one.checkout)
          ? [checkoutRoot(one.key, one.label.trim(), resolve(one.checkout))]
          : []
      )
    : [];

  if ((!Array.isArray(named) || roots.length !== named.length || new Set(roots.map((root) => root.key)).size !== roots.length) && warned !== setting) {
    warned = setting;
    console.warn("DOCUMENT_ROOTS: a root is not a key, a label and an absolute checkout, or its key is taken; it is left out");
  }

  return roots.filter((root, index) => roots.findIndex((other) => other.key === root.key) === index);
}

/** The roots as the list shows them: the ones read, then the ones other units keep, unread. */
export function documentRootViews(roots: readonly DocumentRoot[]): DocumentRootView[] {
  return [...roots.map((root) => ({ key: root.key, label: root.label, writer: root.writer, available: true, unread: null })), ...UNREAD_ROOTS];
}

export function findDocumentRoot(key: unknown, roots: readonly DocumentRoot[]): DocumentRoot | null {
  return typeof key === "string" ? (roots.find((root) => root.key === key) ?? null) : null;
}

// The largest document read whole. The largest operations document is a quarter of this.
export const DOCUMENT_BYTES_CAP = 2_000_000;

// Directories a listing never walks into, beside every name that starts with a dot.
const SKIPPED = new Set(["node_modules", "dist", "build", "coverage", "target"]);

// Whether a path stands inside a base, the base itself included.
function containsPath(base: string, target: string): boolean {
  const away = relative(base, target);

  return away === "" || (!away.startsWith("..") && !isAbsolute(away));
}

// Whether a path a request names could be a document path at all: relative, separated by forward slashes, with
// no empty, dot or dot-led segment, no backslash and no NUL, and a markdown file. It is judged on the path as it
// arrives after the address was decoded, so an encoded separator is judged as the separator it is.
export function isDocumentPath(path: unknown): path is string {
  if (typeof path !== "string" || path.length === 0 || path.length > 1_024) {
    return false;
  }

  if (path.includes("\0") || path.includes("\\") || path.startsWith("/") || !path.endsWith(".md")) {
    return false;
  }

  return path.split("/").every((segment) => segment !== "" && !segment.startsWith("."));
}

// The file behind a document, or null where the name is no document: a path that could not be one, a path its
// root does not accept, anything that is not a regular file, and anything whose real path leaves the root's base
// or is not itself one of the root's documents — a symlink pointing out of the tree, or at a secret beside the
// documents, above all.
export function resolveDocument(root: DocumentRoot, path: string): string | null {
  if (!isDocumentPath(path) || !root.accepts(path)) {
    return null;
  }

  const target = resolve(root.base, path);

  if (!containsPath(root.base, target) || !existsSync(root.base) || !existsSync(target)) {
    return null;
  }

  try {
    const realBase = realpathSync(root.base);
    const real = realpathSync(target);
    const landed = relative(realBase, real).split(sep).join("/");

    // Where the path lands is held to the same rule as the path itself: a link inside the base is followed only
    // to another of this root's documents, never to a secret or a file of code under the same base.
    if (!containsPath(realBase, real) || !isDocumentPath(landed) || !root.accepts(landed) || !statSync(real).isFile()) {
      return null;
    }

    return real;
  } catch {
    return null;
  }
}

function headOf(file: string): string {
  const handle = openSync(file, "r");

  try {
    const buffer = Buffer.alloc(4_096);
    const read = readSync(handle, buffer, 0, buffer.length, 0);

    return buffer.subarray(0, read).toString("utf8");
  } finally {
    closeSync(handle);
  }
}

function titleOf(text: string, path: string): string {
  return markdownHeadings(text)[0]?.text ?? path.split("/").at(-1)!.replace(/\.md$/, "");
}

export interface Listed extends Omit<DocumentEntry, "group"> {
  file: string;
}

// Every document of the given roots, walked without following a symlink, in the order of the roots and then of
// the paths.
export function listDocuments(roots: readonly DocumentRoot[]): Listed[] {
  const listed: Listed[] = [];

  for (const root of roots) {
    if (!existsSync(root.base)) {
      continue;
    }

    const found: string[] = [];
    const walk = (path: string): void => {
      let entry;

      try {
        entry = lstatSync(join(root.base, path));
      } catch {
        return;
      }

      if (entry.isFile()) {
        if (isDocumentPath(path) && root.accepts(path)) {
          found.push(path);
        }

        return;
      }

      if (!entry.isDirectory()) {
        return;
      }

      for (const name of readdirSync(join(root.base, path)).toSorted()) {
        if (name.startsWith(".") || SKIPPED.has(name)) {
          continue;
        }

        walk(`${path}/${name}`);
      }
    };

    for (const start of root.starts()) {
      if (start.split("/").some((segment) => segment === "" || segment.startsWith("."))) {
        continue;
      }

      walk(start);
    }

    for (const path of found) {
      const file = resolveDocument(root, path);

      if (file === null) {
        continue;
      }

      listed.push({ root: root.key, path, file, size: statSync(file).size, title: titleOf(headOf(file), path) });
    }
  }

  return listed;
}

export function documentVersion(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export class DocumentTooLarge extends Error {
  constructor(readonly size: number) {
    super(`document of ${size} bytes`);
  }
}

// One document read whole, or null where the name is no document.
export function readDocument(root: DocumentRoot, path: string): (DocumentView & { file: string }) | null {
  const file = resolveDocument(root, path);

  if (file === null) {
    return null;
  }

  const size = statSync(file).size;

  if (size > DOCUMENT_BYTES_CAP) {
    throw new DocumentTooLarge(size);
  }

  const bytes = readFileSync(file);
  const text = bytes.toString("utf8");

  return {
    root: root.key,
    path,
    file,
    label: root.label,
    writer: root.writer,
    title: titleOf(text, path),
    text,
    version: documentVersion(bytes),
    size,
    language: textLanguage(text)
  };
}

const SEARCH_LINES_PER_DOCUMENT = 3;
const SNIPPET_CHARS = 160;

function snippetAround(line: string, at: number, length: number): string {
  const room = Math.max(0, Math.floor((SNIPPET_CHARS - length) / 2));
  const from = Math.max(0, at - room);
  const to = Math.min(line.length, at + length + room);

  return `${from > 0 ? "…" : ""}${line.slice(from, to).trim()}${to < line.length ? "…" : ""}`;
}

// Where the words stand among the listed documents: a document whose name or title holds them first, then the
// lines of bodies that do, a few per document, up to the limit.
export function searchDocuments(
  roots: readonly DocumentRoot[],
  query: string,
  limit: number
): DocumentMatch[] {
  const needle = query.trim().toLowerCase();

  if (needle === "") {
    return [];
  }

  const heads: DocumentMatch[] = [];
  const bodies: DocumentMatch[] = [];

  for (const entry of listDocuments(roots)) {
    const name = `${entry.root}/${entry.path}`;
    const title = entry.title;

    if (name.toLowerCase().includes(needle)) {
      heads.push({ root: entry.root, path: entry.path, title, where: "name", line: null, snippet: null });
    } else if (title.toLowerCase().includes(needle)) {
      heads.push({ root: entry.root, path: entry.path, title, where: "title", line: null, snippet: null });
    }

    if (bodies.length >= limit || entry.size > DOCUMENT_BYTES_CAP) {
      continue;
    }

    let found = 0;

    for (const [index, line] of readFileSync(entry.file, "utf8").split("\n").entries()) {
      const at = line.toLowerCase().indexOf(needle);

      if (at === -1) {
        continue;
      }

      bodies.push({ root: entry.root, path: entry.path, title, where: "body", line: index + 1, snippet: snippetAround(line, at, needle.length) });
      found += 1;

      if (found >= SEARCH_LINES_PER_DOCUMENT || bodies.length >= limit) {
        break;
      }
    }
  }

  return [...heads, ...bodies].slice(0, limit);
}

// How many documents a question asked of every document stands as candidates.
export const SEEK_PICKS = 5;

// The words of a text as a word segmenter cuts them, each lowered.
function wordsOf(text: string): Set<string> {
  const words = new Set<string>();

  for (const piece of new Intl.Segmenter(undefined, { granularity: "word" }).segment(text.toLowerCase())) {
    if (piece.isWordLike === true) words.add(piece.segment);
  }

  return words;
}

// A document's place that holds most of the question's words: the heading whose section holds them, null for the
// lines before the first heading, and how many of the words it holds.
function bestPlace(text: string, title: string, asked: ReadonlySet<string>): { heading: string | null; held: number } {
  const lines = text.split("\n");
  const headings = markdownHeadings(text);
  const sections = [
    { heading: null as string | null, from: 0, to: (headings[0]?.line ?? lines.length + 1) - 1 },
    ...headings.map((heading, index) => ({ heading: heading.slug, from: heading.line - 1, to: (headings[index + 1]?.line ?? lines.length + 1) - 1 }))
  ];
  const titleWords = wordsOf(title);
  let best = { heading: null as string | null, held: 0 };

  for (const section of sections) {
    const words = wordsOf(lines.slice(section.from, section.to).join("\n"));
    const held = [...asked].filter((word) => words.has(word) || titleWords.has(word)).length;

    if (held > best.held) best = { heading: section.heading, held };
  }

  return best;
}

/**
 * Where a question is answered, read off the documents' text alone: the seek gate that would choose is the gate
 * unit's, which serves the viewer no route (`docs/documents-viewer.md`, 「Asking to be taken somewhere」). Asked of
 * one document, the place is the section holding most of the question's words; asked of every document, the
 * documents holding most of them stand in that order, each at its own place.
 */
export function seekInText(roots: readonly DocumentRoot[], question: string, only: { root: DocumentRoot; path: string } | null): DocumentSeekPick[] {
  const asked = wordsOf(question);

  if (asked.size === 0) {
    return [];
  }

  const candidates = only === null ? listDocuments(roots) : listDocuments([only.root]).filter((entry) => entry.path === only.path);
  const ranked = candidates
    .filter((entry) => entry.size <= DOCUMENT_BYTES_CAP)
    .map((entry, order) => ({ entry, order, ...bestPlace(readFileSync(entry.file, "utf8"), entry.title, asked) }))
    .filter((one) => one.held > 0)
    .toSorted((a, b) => b.held - a.held || a.order - b.order);

  return ranked.slice(0, only === null ? SEEK_PICKS : 1).map(({ entry, heading }) => ({ root: entry.root, path: entry.path, title: entry.title, heading }));
}
