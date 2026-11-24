// A reader's personal apps (docs/web.md, 「Settings」, the personal apps section; the agency's `docs/person-nodes.md`,
// 「Personal apps」): each a tool of the reader's own, made and run on their PC, as the tool host holds its description
// and the PC keeps its versions.

import type { AppPermissions, PermissionReach } from "./app-permissions";

/** One entry of a personal app, by its full name. */
export interface PersonalAppEntry {
  name: string;
  title: string | null;
  description: string;
}

/** A personal app as the reader's own section shows it. */
export interface PersonalApp {
  name: string;
  // A tool of the reader's own, or an MCP server put as one (the agency's `docs/person-nodes.md`); an answer naming
  // none is an app.
  kind: "app" | "mcp";
  // The version in place.
  version: string;
  // When it was put, in epoch milliseconds.
  putAt: number;
  entries: PersonalAppEntry[];
  // What its manifest asks for beyond its own folders.
  permissions: AppPermissions;
  // The versions its PC keeps older than the one in place, newest first; null where the PC was not reached.
  kept: string[] | null;
}

/** The reader's personal apps, whether their PC was reached for the versions it keeps, and what the apps may have of
 * what they ask for. */
export interface PersonalApps {
  items: PersonalApp[];
  reached: boolean;
  reach: PermissionReach;
}

/** An app's name: a lower-case letter, then lower-case letters, digits and `_`. */
export function personalAppName(name: string): boolean {
  return /^[a-z][a-z0-9_]*$/.test(name);
}
