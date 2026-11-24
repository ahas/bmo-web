// A reader's skills (docs/web.md, 「Settings」, the skills section; the agency's `docs/api.md`, 「personal-skills」): each a
// `SKILL.md` and its reference files kept at home, the reader's own or a copy installed from the store, read by the
// agents the reader attaches it to alone.

/** One skill as the reader's section lists it. */
export interface PersonalSkill {
  name: string;
  // What the agent's program reads, from the front matter.
  description: string;
  // The display text a skill may carry, in the maker's language and by locale.
  title: string | null;
  summary: string | null;
  titles: Record<string, string>;
  summaries: Record<string, string>;
  language: string | null;
  version: string;
  origin: "own" | "installed";
  // The store's item an installed copy came from; null for the reader's own.
  app: string | null;
  // The agents it is attached to, by name.
  attachedTo: string[];
}

/** The reader's skills, own and installed. */
export interface PersonalSkills {
  skills: PersonalSkill[];
}

/** A reference file of a skill: every file of it but `SKILL.md`, shown as it stands and never edited here. */
export interface SkillReference {
  path: string;
  text: string;
}

/** One skill as its form reads and writes it: the front matter's description and the body under it, and its
 * reference files. */
export interface SkillForm {
  name: string;
  version: string;
  origin: "own" | "installed";
  description: string;
  body: string;
  references: SkillReference[];
}

/** What the form saves: the description and the body; the name is the route's. */
export interface SkillSave {
  description: string;
  body: string;
}

/** A skill's name: a lower-case letter, then lower-case letters, digits and `-`, at most 64 in all. */
export function skillName(name: string): boolean {
  return /^[a-z][a-z0-9-]{0,63}$/.test(name);
}
