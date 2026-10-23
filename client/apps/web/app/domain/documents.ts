import { markdownHeadings } from "#shared/markdown-structure";
import { shownPart } from "#shared/translation";

import { fileIcon, folderIcon } from "bmo-ui/app/domain/file-icons";

import type { MarkdownHeading } from "#shared/markdown-structure";
import type { DocumentEntry, DocumentLanguage, DocumentList, DocumentMatch, DocumentTranslationPart } from "#shared/types";
import type { Translate } from "#shared/wording";
import type { TreeItem } from "@nuxt/ui";

// What the document viewer works out in the browser: the tree its list stands as, how a scroll in
// one pane lands in the other, which heading is being read, and how a translation that is still
// arriving is put together. None of it touches the page, so all of it is checked here directly.

export type ViewerHeading = MarkdownHeading;

// The views a document is read in. On a narrow screen the split is not offered. The source is the markdown as
// written, which the pack names apart from the original language beside a translation.
export type ReaderView = "rendered" | "source" | "split";

export const READER_VIEWS: ReadonlyArray<{ value: ReaderView; label: string; icon: string }> = [
  { value: "rendered", label: "documents.label.view_rendered", icon: "i-material-symbols-menu-book-outline" },
  { value: "source", label: "documents.label.view_source", icon: "i-material-symbols-code-blocks-outline" },
  { value: "split", label: "documents.label.view_split", icon: "i-material-symbols-view-column-2-outline" }
];

export function isReaderView(value: unknown): value is ReaderView {
  return value === "rendered" || value === "source" || value === "split";
}

const LANGUAGE_NAMES: Record<DocumentLanguage, string> = { ko: "documents.label.language_ko", en: "documents.label.language_en" };

export function languageName(t: Translate, language: DocumentLanguage): string {
  return t(LANGUAGE_NAMES[language]);
}

// A document standing as a tab of the viewer.
export interface OpenDocument {
  root: string;
  path: string;
  seenAt: number;
  pinned?: boolean;
}

// What the viewer keeps of its tabs for the account: the open documents and the one standing.
export interface KeptDocumentTabs {
  tabs: OpenDocument[];
  active: string | null;
}

// A kept value read as far as it holds; anything else is dropped.
export function readKeptDocumentTabs(value: unknown, cap: number): KeptDocumentTabs {
  const { tabs, active } = (value ?? {}) as { tabs?: unknown; active?: unknown };
  const read = (Array.isArray(tabs) ? tabs : []).flatMap((tab: unknown): OpenDocument[] => {
    const { root, path, seenAt, pinned } = (tab ?? {}) as Record<string, unknown>;

    return typeof root === "string" && root !== "" && typeof path === "string" && path !== ""
      ? [{ root, path, seenAt: typeof seenAt === "number" ? seenAt : 0, ...(pinned === true ? { pinned: true } : {}) }]
      : [];
  });
  const unique = read
    .filter((tab, at) => read.findIndex((other) => documentKey(other.root, other.path) === documentKey(tab.root, tab.path)) === at)
    .slice(0, cap * 4);
  const standing = typeof active === "string" && unique.some((tab) => documentKey(tab.root, tab.path) === active) ? active : null;

  return { tabs: unique, active: standing };
}

// A document's name, as its talk and the tree's keys write it.
export function documentKey(root: string, path: string): string {
  return `${root}/${path}`;
}

export function headingsOf(text: string): ViewerHeading[] {
  return markdownHeadings(text);
}

// The heading a source line stands under: the last one at or above it.
export function headingAtLine(headings: readonly ViewerHeading[], line: number): ViewerHeading | null {
  let found: ViewerHeading | null = null;

  for (const heading of headings) {
    if (heading.line > line) {
      break;
    }

    found = heading;
  }

  return found;
}

// The mark of the heading whose words these are, where the document has one.
export function headingByText(headings: readonly ViewerHeading[], text: string): ViewerHeading | null {
  return headings.find((heading) => heading.text === text) ?? null;
}

// One point two panes agree on: an offset in the pane being scrolled and the offset in the other
// pane that shows the same place.
export interface ScrollAnchor {
  from: number;
  to: number;
}

// Where the other pane goes for an offset in this one: between the two anchors around it, as far
// along as the offset is between them. Anchors are taken in order of `from`; an offset before the
// first or past the last stays at that end.
export function mapScroll(anchors: readonly ScrollAnchor[], at: number): number {
  if (anchors.length === 0) {
    return 0;
  }

  const first = anchors[0]!;

  if (at <= first.from) {
    return first.to;
  }

  for (let index = 1; index < anchors.length; index += 1) {
    const before = anchors[index - 1]!;
    const after = anchors[index]!;

    if (at < after.from) {
      const span = after.from - before.from;
      const share = span <= 0 ? 0 : (at - before.from) / span;

      return before.to + share * (after.to - before.to);
    }
  }

  return anchors.at(-1)!.to;
}

// The anchors between two panes out of the blocks both of them show: one per block the source line
// of which is known in both, plus the two ends. Blocks that would run backwards — a line one pane
// measured above the one before it — are left out, since a mapping has to keep its order.
export function scrollAnchors(
  blocks: ReadonlyArray<{ from: number; to: number }>,
  ends: { from: number; to: number }
): ScrollAnchor[] {
  const anchors: ScrollAnchor[] = [{ from: 0, to: 0 }];

  for (const block of blocks) {
    const last = anchors.at(-1)!;

    if (block.from > last.from && block.to >= last.to) {
      anchors.push(block);
    }
  }

  const last = anchors.at(-1)!;

  if (ends.from > last.from) {
    anchors.push({ from: ends.from, to: Math.max(ends.to, last.to) });
  }

  return anchors;
}

// How far below the top of the pane a heading may stand and still be the one being read: the one
// just scrolled to lands a hair below the edge.
const READING_SLACK_PX = 12;

// The heading being read: the last one whose top has passed the top of the pane.
export function currentHeading(tops: ReadonlyArray<{ slug: string; top: number }>, scrollTop: number): string | null {
  let found: string | null = null;

  for (const heading of tops) {
    if (heading.top > scrollTop + READING_SLACK_PX) {
      break;
    }

    found = heading.slug;
  }

  return found ?? tops[0]?.slug ?? null;
}

// A translation as it stands: the parts already rendered in the other language, and the originals
// of the ones not yet — which are shown as they are and marked by the lines they cover.
export interface ComposedTranslation {
  text: string;
  waiting: Array<{ from: number; to: number }>;
  failed: Array<{ from: number; to: number }>;
}

function lineCount(text: string): number {
  return text.split("\n").length - 1;
}

export function composeTranslation(parts: readonly DocumentTranslationPart[]): ComposedTranslation {
  const waiting: ComposedTranslation["waiting"] = [];
  const failed: ComposedTranslation["failed"] = [];
  let text = "";

  for (const part of parts) {
    const shown = shownPart(part.source, part.text);
    const from = lineCount(text) + 1;
    const to = from + Math.max(0, lineCount(shown) - (shown.endsWith("\n") ? 1 : 0));

    if (part.text === null) {
      (part.failed ? failed : waiting).push({ from, to });
    }

    text += shown;
  }

  return { text, waiting, failed };
}

export function inRanges(ranges: ReadonlyArray<{ from: number; to: number }>, line: number): boolean {
  return ranges.some((range) => line >= range.from && line <= range.to);
}

// A node of the list's tree. A document's leaf carries the document, and a leaf found by a search
// carries the lines it was found at.
export interface DocumentTreeItem extends TreeItem {
  value: string;
  label: string;
  children?: DocumentTreeItem[];
  document?: DocumentEntry;
  matches?: DocumentMatch[];
  // A root another unit keeps and serves no route for, which stands in the list read from nowhere: the sentence
  // saying where it belongs, which its unread mark is named by.
  unread?: string;
}

// The name a leaf is shown by: the document's title, which reads more easily than its file name.
// Inside a person's or a room's group the title's lead naming that person is already said by the
// group above it, so only what follows the dash stands. A document with no title of its own is
// named by its file. The file name itself is in the properties.
export function leafLabel(entry: DocumentEntry): string {
  const title = entry.title.trim();

  if (title === "") {
    return entry.path.split("/").at(-1)!.replace(/\.md$/, "");
  }

  const tail = entry.group === null ? null : /^[^—]*\([^()]*\)\s+—\s+(.+)$/.exec(title)?.[1];

  return tail ?? title;
}

// The list as a tree: a root per branch, a person or a room under a root that groups, the documents
// under that. Given the matches of a search, only the documents they name stand, each with its
// matches, and nothing else.
export function documentTree(list: DocumentList, matches: readonly DocumentMatch[] | null): DocumentTreeItem[] {
  const found = new Map<string, DocumentMatch[]>();

  for (const match of matches ?? []) {
    const key = documentKey(match.root, match.path);

    found.set(key, [...(found.get(key) ?? []), match]);
  }

  const tree: DocumentTreeItem[] = [];

  for (const root of list.roots) {
    if (!root.available) {
      // A root read from nowhere has nothing for a search to find.
      if (matches === null) {
        tree.push({ value: `root:${root.key}`, label: root.label, icon: folderIcon(root.key, false), unread: root.unread ?? "" });
      }

      continue;
    }

    const leaves: DocumentTreeItem[] = [];
    const groups = new Map<string, DocumentTreeItem>();

    for (const entry of list.documents) {
      const key = documentKey(entry.root, entry.path);

      if (entry.root !== root.key || (matches !== null && !found.has(key))) {
        continue;
      }

      const leaf: DocumentTreeItem = {
        value: `doc:${key}`,
        label: leafLabel(entry),
        icon: fileIcon(entry.path),
        document: entry,
        ...(found.has(key) ? { matches: found.get(key) } : {})
      };

      if (entry.group === null) {
        leaves.push(leaf);
        continue;
      }

      const groupValue = `group:${root.key}:${entry.group.key}`;
      let group = groups.get(groupValue);

      if (group === undefined) {
        group = {
          value: groupValue,
          label: entry.group.name,
          icon: entry.group.kind === "person" ? "i-material-symbols-person-outline" : "i-material-symbols-chat-bubble-outline",
          children: []
        };
        groups.set(groupValue, group);
        leaves.push(group);
      }

      group.children!.push(leaf);
    }

    if (leaves.length > 0 || matches === null) {
      for (const group of groups.values()) {
        group.children = apartLabels(group.children!);
      }

      tree.push({ value: `root:${root.key}`, label: root.label, icon: folderIcon(root.key, false), children: apartLabels(leaves) });
    }
  }

  return tree;
}

// Leaves of one branch that would read the same are told apart: first by their whole titles, which
// name the person or the room the branch left out, and where those are the same too, by their file
// names.
export function apartLabels(items: DocumentTreeItem[]): DocumentTreeItem[] {
  const count = (label: string, among: readonly DocumentTreeItem[]): number => among.filter((one) => one.label === label).length;
  const titled = items.map((item) =>
    item.document !== undefined && count(item.label, items) > 1 && item.document.title.trim() !== "" ? { ...item, label: item.document.title.trim() } : item
  );

  return titled.map((item) =>
    item.document !== undefined && count(item.label, titled) > 1
      ? { ...item, label: `${item.label} · ${item.document.path.split("/").at(-1)!.replace(/\.md$/, "")}` }
      : item
  );
}

// Every branch of a tree, for a search that shows what it found unfolded.
export function branchValues(tree: readonly DocumentTreeItem[]): string[] {
  return tree.flatMap((item) => (item.children === undefined ? [] : [item.value, ...branchValues(item.children)]));
}

// The branches above one document, for a document opened from elsewhere.
export function branchesOf(tree: readonly DocumentTreeItem[], value: string): string[] {
  for (const item of tree) {
    if (item.value === value) {
      return [];
    }

    if (item.children !== undefined) {
      const below = branchesOf(item.children, value);

      if (below.length > 0 || item.children.some((child) => child.value === value)) {
        return [item.value, ...below];
      }
    }
  }

  return [];
}

// A link inside a document to another document of the same root, as a path relative to the root,
// or null where the link leaves the document viewer's reach: an address with a scheme, an anchor
// alone, or a path that climbs out of the root.
export function linkedDocument(currentPath: string, href: string): { path: string; hash: string | null } | null {
  if (/^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith("#") || href.startsWith("/")) {
    return null;
  }

  const [target = "", hash = null] = href.split("#");
  let decoded: string;

  try {
    decoded = decodeURIComponent(target);
  } catch {
    return null;
  }

  if (!decoded.endsWith(".md")) {
    return null;
  }

  const parts = currentPath.split("/").slice(0, -1);

  for (const segment of decoded.split("/")) {
    if (segment === "..") {
      if (parts.length === 0) {
        return null;
      }

      parts.pop();
    } else if (segment !== "." && segment !== "") {
      parts.push(segment);
    }
  }

  return { path: parts.join("/"), hash };
}

// The documents an index's list items name. An index of a person book, a room's book, the lore or
// the knowledge lists its pieces a line each, the slug first; the piece is the document of that
// slug beside the index or under its `chunks/`. Only an index is read this way.
export function indexLinks(documents: readonly DocumentEntry[], root: string, path: string): Map<string, string> {
  const links = new Map<string, string>();

  if (!path.endsWith("index.md")) {
    return links;
  }

  const dir = path.slice(0, path.length - "index.md".length);
  const inRoot = new Set(documents.filter((entry) => entry.root === root).map((entry) => entry.path));

  for (const candidate of inRoot) {
    for (const place of [`${dir}chunks/`, dir]) {
      if (!candidate.startsWith(place)) {
        continue;
      }

      const rest = candidate.slice(place.length);

      if (!rest.includes("/") && rest.endsWith(".md") && rest !== "index.md") {
        const slug = rest.slice(0, -3);

        if (!links.has(slug)) {
          links.set(slug, candidate);
        }
      }
    }
  }

  return links;
}
