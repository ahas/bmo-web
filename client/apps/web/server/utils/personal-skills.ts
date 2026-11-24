import { parseYAML, stringifyYAML } from "confbox";

import { skillName } from "#shared/personal-skills";
import { wording } from "#shared/wording";

import { agencyRoute } from "./agency";
import { fail } from "./fail";

import type { SignedIn } from "./accounts";
import type { AgencyCall } from "./agency";
import type { PersonalSkill, PersonalSkills, SkillForm, SkillReference, SkillSave } from "#shared/personal-skills";

// The reader's skills, read, written and deleted through the agency (docs/web.md, 「Settings」, the skills section; the
// agency's `docs/api.md`, 「personal-skills」): asked as the deployment's own for the account the signed-in login is, so
// a reader reaches their own skills alone. The form's description and body are written into `SKILL.md` here, its front
// matter read and written as YAML by confbox, every other key of it kept as it stood.

// The agency's refusals of these routes, each with the pack's key for its sentence.
const CALL: AgencyCall = {
  codes: {
    "not-found": "skills.error.not_found",
    "name-taken": "skills.error.name_taken",
    "personal-apps-withheld": "skills.error.make_withheld",
    "bad-request": "skills.error.refused",
    "too-large": "skills.error.too_large"
  },
  passStatus: [400, 404, 409]
};

/** The file a skill's instructions stand in. */
export const SKILL_FILE = "SKILL.md";

// The account a login's skills stand under: its user's id; a login with no user holds none.
function accountOf(signed: SignedIn): string {
  if (signed.id === null) throw fail(404, wording("skills.error.no_user"));

  return String(signed.id);
}

/** The skill a route's path names, refused where it is no skill's name. */
export function skillParam(name: string | undefined): string {
  if (name === undefined || !skillName(name)) throw fail(400, wording("skills.error.not_found"));

  return name;
}

function textOf(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}

function textsOf(value: unknown): Record<string, string> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return {};

  return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === "string" && entry[1] !== ""));
}

function skillOf(value: Record<string, unknown>): PersonalSkill {
  return {
    name: String(value.name ?? ""),
    description: typeof value.description === "string" ? value.description : "",
    title: textOf(value.title),
    summary: textOf(value.summary),
    titles: textsOf(value.titles),
    summaries: textsOf(value.summaries),
    language: textOf(value.language),
    version: String(value.version ?? ""),
    origin: value.origin === "installed" ? "installed" : "own",
    app: textOf(value.app),
    attachedTo: Array.isArray(value.attachedTo) ? value.attachedTo.filter((one): one is string => typeof one === "string") : []
  };
}

/** The reader's skills, by name. */
export async function ownSkills(signed: SignedIn): Promise<PersonalSkills> {
  const read = await agencyRoute<{ skills?: Record<string, unknown>[] }>("GET", `/personal-skills/${accountOf(signed)}`, undefined, CALL);

  return { skills: (read.skills ?? []).map(skillOf).toSorted((one, other) => one.name.localeCompare(other.name)) };
}

/** `SKILL.md` cut into its front matter and its body. The fence is the front matter's own lines, `---` alone on a line
 * opening the file and closing the YAML; what stands between them is read by confbox as YAML. A file with no front
 * matter is all body. */
export function skillParts(text: string): { front: Record<string, unknown>; body: string } {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/);

  if (lines[0]?.trim() !== "---") return { front: {}, body: text };

  const closing = lines.findIndex((line, at) => at > 0 && line.trim() === "---");

  if (closing === -1) return { front: {}, body: text };

  let front: unknown;

  try {
    front = parseYAML(lines.slice(1, closing).join("\n"));
  } catch {
    front = {};
  }

  const body = lines.slice(closing + 1).join("\n").replace(/^\n+/, "");

  return { front: front !== null && typeof front === "object" && !Array.isArray(front) ? (front as Record<string, unknown>) : {}, body };
}

/** `SKILL.md` written from a form: the front matter it stood with, its name and description set, then the body. */
export function skillFile(front: Record<string, unknown>, name: string, save: SkillSave): string {
  const matter = stringifyYAML({ ...front, name, description: save.description.trim() }).trimEnd();
  const body = save.body.trim();

  return `---\n${matter}\n---\n${body === "" ? "" : `\n${body}\n`}`;
}

interface AgencySkill {
  name?: unknown;
  version?: unknown;
  origin?: unknown;
  files?: Record<string, unknown>;
}

// A skill's files as the agency answers them, every value text.
function filesOf(read: AgencySkill): Record<string, string> {
  return Object.fromEntries(Object.entries(read.files ?? {}).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
}

/** A skill as its form reads it. */
export function skillForm(name: string, read: AgencySkill): SkillForm {
  const files = filesOf(read);
  const { front, body } = skillParts(files[SKILL_FILE] ?? "");
  const references: SkillReference[] = Object.entries(files)
    .filter(([path]) => path !== SKILL_FILE)
    .map(([path, text]) => ({ path, text }))
    .toSorted((one, other) => one.path.localeCompare(other.path));

  return {
    name,
    version: String(read.version ?? ""),
    origin: read.origin === "installed" ? "installed" : "own",
    description: typeof front.description === "string" ? front.description : "",
    body,
    references
  };
}

async function readSkill(signed: SignedIn, name: string): Promise<AgencySkill> {
  return await agencyRoute<AgencySkill>("GET", `/personal-skills/${accountOf(signed)}/${name}`, undefined, CALL);
}

/** One of the reader's skills as its form reads it. */
export async function ownSkill(signed: SignedIn, name: string): Promise<SkillForm> {
  return skillForm(name, await readSkill(signed, name));
}

/** One of the reader's own skills written from its form, made where none of that name stands: its `SKILL.md` from the
 * description and the body over the front matter it stood with, and its reference files as they stood. */
export async function saveSkill(signed: SignedIn, name: string, save: SkillSave): Promise<SkillForm> {
  const standing = await readSkill(signed, name).catch((error: { statusCode?: number }) => {
    if (error.statusCode === 404) return null;

    throw error;
  });
  const files = standing === null ? {} : filesOf(standing);
  const { front } = skillParts(files[SKILL_FILE] ?? "");

  await agencyRoute("PUT", `/personal-skills/${accountOf(signed)}/${name}`, { files: { ...files, [SKILL_FILE]: skillFile(front, name, save) } }, CALL);

  return await ownSkill(signed, name);
}

/** One of the reader's own skills deleted, and every attachment of it. */
export async function deleteSkill(signed: SignedIn, name: string): Promise<void> {
  await agencyRoute("DELETE", `/personal-skills/${accountOf(signed)}/${name}`, undefined, CALL);
}
