import { wording } from "#shared/wording";

import { agencyRoute } from "./agency";
import { fail } from "./fail";

import type { SignedIn } from "./accounts";
import type { AgencyCall } from "./agency";
import type { RefusalBody } from "./unit-answer";
import type { AttachableItem, AttachedKind, AttachmentChange, AttachmentHolder, Attachments } from "#shared/attachments";

// What the reader attached to each of their agents, read and written through the agency (docs/web.md, 「System and organisation」,
// the agents tab at the reader's own node; the agency's `docs/api.md`, 「attachments」): asked as the deployment's own for the account the
// signed-in login is, so a reader reaches their own agents alone.

// A refusal that the holder's line takes none of a kind names the kind, and is said by that kind's own sentence.
function namedKind(body: RefusalBody): RefusalBody {
  if (body.code !== "line-takes-none") return body;

  const named = (body as RefusalBody & { kind?: unknown }).kind ?? body.field;

  return { ...body, code: named === "mcp" ? "line-takes-none-mcp" : "line-takes-none-skills" };
}

// The agency's refusals of these routes, each with the pack's key for its sentence.
const CALL: AgencyCall = {
  codes: {
    "line-takes-none-skills": "attachments.error.takes_no_skills",
    "line-takes-none-mcp": "attachments.error.takes_no_mcp",
    "not-found": "attachments.error.not_found",
    forbidden: "attachments.error.forbidden"
  },
  passStatus: [403, 404, 409],
  refusal: namedKind
};

/** The two kinds of holder, as a route's path names them. */
export const HOLDER_KINDS = ["supervisor", "agent"] as const;

// The account a login's agents stand under: its user's id; a login with no user holds none.
function accountOf(signed: SignedIn): string {
  if (signed.id === null) throw fail(404, wording("attachments.error.no_user"));

  return String(signed.id);
}

function names(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((one): one is string => typeof one === "string") : [];
}

function textsOf(value: unknown): Record<string, string> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return {};

  return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === "string" && entry[1] !== ""));
}

function textOf(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}

function holderOf(value: Record<string, unknown>): AttachmentHolder {
  const takes = (value.takes ?? {}) as Partial<Record<AttachedKind, unknown>>;

  return {
    kind: value.kind === "supervisor" ? "supervisor" : "agent",
    name: String(value.name ?? ""),
    label: textOf(value.label),
    role: textOf(value.role),
    line: textOf(value.line),
    takes: { skills: takes.skills === true, mcp: takes.mcp === true },
    skills: names(value.skills),
    mcp: names(value.mcp)
  };
}

function itemOf(value: Record<string, unknown>): AttachableItem {
  return { name: String(value.name ?? ""), title: textOf(value.title), titles: textsOf(value.titles), origin: value.origin === "installed" ? "installed" : "own" };
}

/** The reader's holders and the items they may attach. */
export async function readAttachments(signed: SignedIn): Promise<Attachments> {
  const read = await agencyRoute<{ holders?: Record<string, unknown>[]; skills?: Record<string, unknown>[]; mcp?: Record<string, unknown>[] }>(
    "GET",
    `/attachments/${accountOf(signed)}`,
    undefined,
    CALL
  );

  return { holders: (read.holders ?? []).map(holderOf), skills: (read.skills ?? []).map(itemOf), mcp: (read.mcp ?? []).map(itemOf) };
}

/** What one of the reader's agents is given, written whole, answered with the holder as it then stands. */
export async function writeAttachments(signed: SignedIn, kind: (typeof HOLDER_KINDS)[number], name: string, change: AttachmentChange): Promise<AttachmentHolder> {
  const path = `/attachments/${accountOf(signed)}/${kind}/${encodeURIComponent(name)}`;

  return holderOf(await agencyRoute<Record<string, unknown>>("PUT", path, { skills: change.skills, mcp: change.mcp }, CALL));
}
