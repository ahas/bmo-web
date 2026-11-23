// A reader's personal apps (docs/web.md, 「Settings」, the personal apps section; the agency's `docs/person-nodes.md`,
// 「Personal apps」): each a tool of the reader's own, made and run on their PC, as the tool host holds its description
// and the PC keeps its versions.

/** One entry of a personal app, by its full name. */
export interface PersonalAppEntry {
  name: string;
  title: string | null;
  description: string;
}

/** A personal app as the reader's own section shows it. */
export interface PersonalApp {
  name: string;
  // The version in place.
  version: string;
  // When it was put, in epoch milliseconds.
  putAt: number;
  entries: PersonalAppEntry[];
  // What its manifest asks for beyond its own folders.
  permissions: { network: string[]; secrets: string[] };
  // The versions its PC keeps older than the one in place, newest first; null where the PC was not reached.
  kept: string[] | null;
}

/** The reader's personal apps, and whether their PC was reached for the versions it keeps. */
export interface PersonalApps {
  items: PersonalApp[];
  reached: boolean;
}

/** An app's name: a lower-case letter, then lower-case letters, digits and `_`. */
export function personalAppName(name: string): boolean {
  return /^[a-z][a-z0-9_]*$/.test(name);
}
