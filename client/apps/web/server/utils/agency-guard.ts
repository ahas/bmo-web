// What a person may reach of agent management in the agency, judged here before a call made for them goes out
// (docs/web.md, 「Access」; the agency's docs/api.md, 「Who a caller acts for」). The agency answers whoever its token
// lets in; the console is the one way in for a person, so whether that person may read or change a part of agent
// management is the console's to decide, on the sections the account service grants them.
//
// Each part of agent management stands under one console section. A change needs its own section's write. A read
// needs the read of a section it stands under: the agent list is read under any of the agent sections, since the
// screen opens on any one of them, and the models and the model files under their own alone. The platform
// administrator and a call carrying nobody are not judged here.
//
// A change of a row an organisation unit owns, or an add naming a unit, asks no section: heading the unit is the
// whole of who may, which the chain judges for that change.

import type { AgentSection } from "#shared/sections";
import type { SectionRow } from "#shared/sections";

/** One part of agent management: the path its routes stand under, its console section and the sections a read of
 * it may stand under. */
interface Part {
  root: string;
  section: AgentSection;
  readUnder: readonly AgentSection[];
  // Whether a change of one of its rows, or an add naming a unit, may be a unit's, which no section decides.
  unitOwned: boolean;
  // The body field an add names its unit by.
  unitField: string | null;
}

const EVERY: readonly AgentSection[] = ["supervisors", "roles", "repositories", "models", "model-files"];

const PARTS: readonly Part[] = [
  { root: "/supervisors", section: "supervisors", readUnder: EVERY, unitOwned: true, unitField: "ownerUnit" },
  { root: "/roles", section: "roles", readUnder: EVERY, unitOwned: false, unitField: null },
  { root: "/role-agents", section: "roles", readUnder: EVERY, unitOwned: true, unitField: "ownerUnit" },
  { root: "/repositories", section: "repositories", readUnder: EVERY, unitOwned: true, unitField: "ownerUnit" },
  { root: "/models", section: "models", readUnder: ["models"], unitOwned: true, unitField: "unit" },
  { root: "/model-catalogue", section: "model-files", readUnder: ["model-files"], unitOwned: false, unitField: null }
];

/** The part a path stands under, none for a route of another kind. */
function partOf(path: string): Part | null {
  return PARTS.find((part) => path === part.root || path.startsWith(`${part.root}/`)) ?? null;
}

/** One agency call as the guard reads it. */
export interface GuardedCall {
  method: string;
  path: string;
  // The body a change carries, read as JSON; null where it carries none or none that reads.
  body: Record<string, unknown> | null;
}

/** Whom a call is made for: the headers the console carries for the person signed in. */
export interface GuardedOwner {
  key: string | null;
  role: string | null;
}

/** What the guard reads of the world: the person's sections, and whether the row a change names is a unit's. */
export interface GuardReads {
  sections: () => Promise<SectionRow[]>;
  rowIsUnits: (part: string, name: string) => Promise<boolean>;
}

/** A call the guard refuses: its status and the agency's own refusal shape, so the console answers it as one. */
export interface GuardRefusal {
  status: number;
  code: string;
  error: string;
}

const READS = new Set(["GET", "HEAD"]);

/**
 * Whether the person may make the call, or the refusal saying why not; null where it goes on. A call of another
 * kind, a call carrying nobody and the administrator's go on unjudged.
 */
export async function guardAgencyCall(call: GuardedCall, owner: GuardedOwner, reads: GuardReads): Promise<GuardRefusal | null> {
  const part = partOf(call.path);

  if (part === null || owner.key === null || owner.key.trim() === "") return null;
  if ((owner.role ?? "").trim().toLowerCase() === "administrator") return null;

  const write = !READS.has(call.method.toUpperCase());

  if (write && (await unitsChange(part, call, reads))) return null;

  let rows: SectionRow[];

  try {
    rows = await reads.sections();
  } catch (error) {
    return { status: 503, code: "access-unchecked", error: `The person's permissions could not be read: ${String(error)}` };
  }

  const allowed = write ? [part.section] : part.readUnder;
  const granted = rows.some((row) => allowed.includes(row.section as AgentSection) && (write ? row.write : row.read));

  if (granted) return null;

  const sections = allowed.length === 1 ? `the ${allowed[0]} section` : "any section of agent management";

  return {
    status: 403,
    code: "forbidden",
    error: `The signed-in person may not ${write ? "change" : "read"} ${part.root}: the console holds no ${write ? "write" : "read"} access to ${sections} for them`
  };
}

// Whether a change is a unit's: an add naming a unit in its body, or a change of a row a unit owns.
async function unitsChange(part: Part, call: GuardedCall, reads: GuardReads): Promise<boolean> {
  if (!part.unitOwned) return false;

  const rest = call.path.slice(part.root.length).split("/").filter((piece) => piece !== "");

  if (rest.length === 0) {
    return call.method.toUpperCase() === "POST" && part.unitField !== null && typeof call.body?.[part.unitField] === "number";
  }

  return await reads.rowIsUnits(part.root, decodeURIComponent(rest[0]!));
}
