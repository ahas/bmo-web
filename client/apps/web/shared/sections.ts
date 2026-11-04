// The console's sections, the unit of a person's permission (docs/accounts.md, 「Console sections」;
// docs/web.md, 「Access」): one entry of the navigation from the live status down to the brain, and the
// rooms and the account beside the flat group. A section is named by the first part of the screen's path.

/** The sections the console serves, in the order its navigation stands them. */
export const CONSOLE_SECTIONS = [
  "live", "mail", "siren", "db", "files", "artifact", "documents", "code", "agents", "research", "monitor",
  "remote", "brain", "rooms", "account"
] as const;

export type ConsoleSection = (typeof CONSOLE_SECTIONS)[number];

/** One section's permission for a person: whether they may read it and whether they may write it. */
export interface SectionRow {
  section: string;
  read: boolean;
  write: boolean;
}

/** What one reader may do with one section. */
export interface SectionAccess {
  read: boolean;
  write: boolean;
}

/** Every section's permission, by the section's id. */
export type SectionAccessMap = Readonly<Record<string, SectionAccess>>;

/** Whether a section id is one of the console's own list. */
export function isConsoleSection(section: string): section is ConsoleSection {
  return (CONSOLE_SECTIONS as readonly string[]).includes(section);
}

/**
 * The section a screen's path stands under: its first path part, `monitor` for the card board's own address,
 * and none for the console's front door, the login screen and whatever stands outside a screen.
 */
export function sectionOfPath(path: string): string | null {
  const first = path.split("/").find((part) => part !== "") ?? null;

  if (first === null || first === "login") return null;
  if (first === "cards") return "monitor";

  return first;
}

/** A person's permission on a section, with no grant standing as neither read nor write. */
export function accessOf(access: SectionAccessMap, section: string | null): SectionAccess {
  if (section === null) return { read: false, write: false };

  return access[section] ?? { read: false, write: false };
}

/** Whether a person may read a section. */
export function mayRead(access: SectionAccessMap, section: string | null): boolean {
  return accessOf(access, section).read;
}

/** Whether a person may write a section. */
export function mayWrite(access: SectionAccessMap, section: string | null): boolean {
  return accessOf(access, section).write;
}

/** The permissions a list of rows stands, by section. */
export function accessMap(rows: readonly SectionRow[]): SectionAccessMap {
  return Object.fromEntries(rows.map((row) => [row.section, { read: row.read, write: row.write }]));
}

/** The first address a reader may open, for a login whose own screen is refused. */
export function homeFor(access: SectionAccessMap): string {
  for (const section of CONSOLE_SECTIONS) {
    if (!mayRead(access, section)) continue;

    return section === "account" ? "/account" : section === "rooms" ? "/rooms" : `/${section}`;
  }

  return "/rooms";
}
