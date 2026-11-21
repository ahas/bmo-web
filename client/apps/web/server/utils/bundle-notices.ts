import type { PushPayload } from "#shared/types";
import type { ConsoleManifest } from "bmo-ui/shared/console-manifest";

// A console bundle's notice as it rings (docs/web.md, 「Notifications」; bmo-ui's `docs/console-bundles.md`,
// 「Notices」): an event of the unit's stream said in the words the bundle's pack gives its kind. The stream's
// `data` is the platform's event, `{"id", "kind", "at", "data"}` (bmo-chat's `docs/conventions.md`, 「Events and
// streams」), and the words' placeholders are filled from the member it carries. No unit's word is written here:
// the pack names the fields its words take.

/** A bundle's words in one language, as its pack answers them. */
export interface NoticeWords {
  [key: string]: unknown;
}

type Fields = Record<string, unknown>;

const PLACEHOLDER = /\{(\w+)\}/g;

// Text that holds no letter or digit: a separator, which stands only between filled fields.
const SEPARATOR = /^[^\p{L}\p{N}]*$/u;

/** The member an event of the stream carries: the inner `data` of its JSON, or nothing where it holds none. */
export function memberOf(eventData: string): Fields {
  try {
    const read: unknown = JSON.parse(eventData);

    if (typeof read !== "object" || read === null) return {};

    const member = (read as Fields).data;

    return typeof member === "object" && member !== null && !Array.isArray(member) ? (member as Fields) : {};
  } catch {
    // An event that does not read as JSON says nothing a notice can carry.
    return {};
  }
}

function textOf(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** One field of a member as a notice says it: text and numbers as they are, a named thing by its name or address. */
export function fieldOf(fields: Fields, name: string): string {
  const value = fields[name];

  if (typeof value === "string") return value.trim();
  if (typeof value === "number") return String(value);
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    const held = value as Fields;

    return textOf(held.name) || textOf(held.address);
  }

  return "";
}

/**
 * A word with its placeholders filled from a member. A placeholder whose field is absent or empty takes with it the
 * separators beside it, the text between fields that holds no letter or digit, so none is left standing alone.
 */
export function filled(text: unknown, fields: Fields): string {
  if (typeof text !== "string") return "";

  const parts: { text: string; field: boolean }[] = [];
  let from = 0;

  for (const match of text.matchAll(PLACEHOLDER)) {
    parts.push({ text: text.slice(from, match.index), field: false });
    parts.push({ text: fieldOf(fields, match[1]!), field: true });
    from = match.index + match[0].length;
  }

  parts.push({ text: text.slice(from), field: false });

  const emptyField = (at: number): boolean => parts[at]?.field === true && parts[at]!.text === "";

  return parts
    .filter((part, at) => part.field || !SEPARATOR.test(part.text) || !(emptyField(at - 1) || emptyField(at + 1)))
    .map((part) => part.text)
    .join("")
    .trim();
}

// The word at a dotted key of a bundle's pack, where the dots divide the pack's tree.
function wordAt(words: NoticeWords, path: readonly string[]): unknown {
  let held: unknown = words;

  for (const part of path) {
    if (typeof held !== "object" || held === null) return undefined;

    held = (held as NoticeWords)[part];
  }

  return held;
}

/**
 * The notice an event of a declared kind rings: the title and body the bundle's words give the kind, the title its
 * screen's own where the kind's comes out empty, pressing it going to the bundle's screen under `baseURL`, and one tag
 * for the member's thread, or else the member, so a later notice of it replaces the earlier.
 */
export function noticeOf(bundle: ConsoleManifest, kind: string, eventData: string, words: NoticeWords, baseURL: string): PushPayload {
  const member = memberOf(eventData);
  const kindWord = (role: "title" | "body") => wordAt(words, [bundle.name, "notice", ...kind.split("."), role]);
  const screenTitle = wordAt(words, bundle.title.split("."));
  const base = baseURL.replace(/\/+$/, "");

  return {
    kind: bundle.name as PushPayload["kind"],
    title: filled(kindWord("title"), member) || (typeof screenTitle === "string" ? screenTitle : bundle.name),
    body: filled(kindWord("body"), member),
    url: `${base}/${bundle.screenPath.replace(/^\/+/, "")}`,
    tag: `${bundle.name}:${fieldOf(member, "threadId") || fieldOf(member, "id") || kind}`
  };
}
