// The console's sections, the unit of a person's permission (docs/accounts.md, 「Console sections」;
// docs/web.md, 「Access」): one entry of the navigation from the mail down to the brain, the rooms and the
// account beside the flat group, and `live`, what runs now, which no one screen holds. A section is named by the first part of the screen's path.

/** The five parts of agent management, each its own permission (docs/accounts.md, 「Console sections」). */
export const AGENT_SECTIONS = ["supervisors", "roles", "repositories", "models", "model-files"] as const;

export type AgentSection = (typeof AGENT_SECTIONS)[number];

/** The parts an agent's own page stands under: the three whose rows open it. */
export const AGENT_DETAIL_SECTIONS: readonly AgentSection[] = ["supervisors", "roles", "repositories"];

/** The sections the console serves, in the order its navigation stands them. */
export const CONSOLE_SECTIONS = [
  "live", "mail", "siren", "db", "files", "artifact", "documents", "code", ...AGENT_SECTIONS, "research",
  "monitor", "remote", "brain", "rooms", "account"
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

/** Whether a section id is one of agent management's five parts. */
export function isAgentSection(section: string): section is AgentSection {
  return (AGENT_SECTIONS as readonly string[]).includes(section);
}

/**
 * The sections a screen's path stands under: agent management's five parts where it stands, its own page's three
 * where an agent's page stands, `monitor` for the card board's own address, and none for the console's front door,
 * the login screen and whatever stands outside a screen.
 */
export function sectionsOfPath(path: string): readonly string[] {
  const parts = path.split("/").filter((part) => part !== "");
  const first = parts[0] ?? null;

  if (first === null || first === "login") return [];
  if (first === "cards") return ["monitor"];
  // A person's page is read under the account section, whose directory finds them.
  if (first === "people") return ["account"];
  // Agent management's screen is its five parts together; an agent's own page stands under the three whose rows
  // open it.
  if (first === "agents") return parts.length > 1 ? AGENT_DETAIL_SECTIONS : AGENT_SECTIONS;

  return [first];
}

/** The sections a person may read of those a screen's path stands under. */
export function agentSectionsRead(access: SectionAccessMap): AgentSection[] {
  return AGENT_SECTIONS.filter((section) => mayRead(access, section));
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

/** Whether a person may read any one of several sections. */
export function mayReadAny(access: SectionAccessMap, sections: readonly string[]): boolean {
  return sections.some((section) => mayRead(access, section));
}

/**
 * Whether a person may open a screen's path: any of the sections it stands under. A screen whose path names no
 * console section is a unit's own, opened by its manifest's role alone.
 */
export function screenMayRead(access: SectionAccessMap, path: string): boolean {
  if (!inConsoleSections(path)) return true;

  return mayReadAny(access, sectionsOfPath(path));
}

/** Whether a screen's path stands under the console's own sections, so its section, not the screen, says who opens it. */
export function inConsoleSections(path: string): boolean {
  const sections = sectionsOfPath(path);

  return sections.length > 0 && sections.every(isConsoleSection);
}

/** The permissions a list of rows stands, by section. */
export function accessMap(rows: readonly SectionRow[]): SectionAccessMap {
  return Object.fromEntries(rows.map((row) => [row.section, { read: row.read, write: row.write }]));
}

/**
 * The first screen a reader may open, for an address they may not (docs/web.md, 「Access」): the first of the
 * navigation's screens, given in its order, that stands under a section they read, else their rooms.
 */
export function homeFor(access: SectionAccessMap, screens: readonly string[]): string {
  return screens.find((path) => inConsoleSections(path) && screenMayRead(access, path)) ?? "/rooms";
}
