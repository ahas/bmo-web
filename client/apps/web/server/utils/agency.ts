import { agencyClient } from "@agency/client";

import { CONTROL_UNREACHABLE } from "#shared/config";
import { wording } from "#shared/wording";

import { signedInUser } from "./accounts";
import { ownerHeaders } from "./owner-key";
import { unitAt, unitHeaders } from "./units";
import { answered } from "./unit-answer";

import type { AgencyClient, AgencyFetch } from "@agency/client";
import type { H3Event } from "h3";
import type { UnitAnswerCall } from "./unit-answer";

// The agency's fixed API as its published package states it (the agency's `docs/api.md`, 「The control port」):
// JSON in camelCase, a page for a list, and a refusal answered with the status's kebab-case code and an English
// sentence. The English is for an agent to read, so a person is told the code's sentence from the pack, and a
// refused field is said under that field.

// The agency's codes, each with the pack's key for its sentence.
const AGENCY_CODES: Readonly<Record<string, string>> = {
  "bad-request": "agents.error.agency_bad_request",
  "not-found": "agents.error.agency_not_found",
  conflict: "agents.error.agency_conflict",
  "unprocessable-entity": "agents.error.agency_unprocessable",
  "service-unavailable": "agents.error.agency_unavailable",
  "internal-server-error": "agents.error.agency_failed",
  "bad-gateway": "agents.error.agency_failed",
  "name-taken": "agents.error.agent_name_taken",
  "too-large": "common.error.file_too_large"
};

// The person a call acts for, read once for the request: the agency refuses what that login may not do (the
// agency's `docs/api.md`, 「Who a call acts for」). A call made for nobody signed in carries none.
const OWNER = "agencyOwner";

async function ownerOf(event: H3Event): Promise<Record<string, string>> {
  const held = event.context[OWNER] as Record<string, string> | undefined;

  if (held !== undefined) return held;

  const signed = await signedInUser(event).catch(() => null);
  const headers = signed === null ? {} : ownerHeaders(signed);

  event.context[OWNER] = headers;

  return headers;
}

// The request a call is made for, where it is made inside one.
function currentEvent(): H3Event | null {
  try {
    return useEvent();
  } catch {
    return null;
  }
}

async function ownerCallHeaders(): Promise<Record<string, string>> {
  const event = currentEvent();

  return event === null ? {} : await ownerOf(event);
}

// Every agency call carries the signed-in person beside the console's token.
const carryingOwner: AgencyFetch = async (request) => {
  const headers = new Headers(request.headers);

  for (const [name, value] of Object.entries(await ownerCallHeaders())) headers.set(name, value);

  return await fetch(new Request(request, { headers }));
};

/** The agency at the address its setting names, asked with its token and the signed-in person's owner key. */
export function agency(): AgencyClient {
  const unit = unitAt("AGENCY");

  if (unit === null) throw fail(503, wording(CONTROL_UNREACHABLE));

  return agencyClient(unit.address, unit.token ?? "", carryingOwner);
}

/**
 * One call on an agency route the published client the console vendors names no type for, by the path the agency's
 * `docs/api.md` documents, answered and refused as every other agency call is.
 */
export async function agencyRoute<T>(method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE", path: string, body?: unknown, call: AgencyCall = {}): Promise<T> {
  const unit = unitAt("AGENCY");

  if (unit === null) throw fail(503, wording(CONTROL_UNREACHABLE));

  const asked = fetch(`${unit.address}${path}`, {
    method,
    headers: { ...unitHeaders(unit), ...(await ownerCallHeaders()), accept: "application/json", ...(body === undefined ? {} : { "content-type": "application/json" }) },
    body: body === undefined ? undefined : JSON.stringify(body)
  }).then(async (response) => {
    const parsed: unknown = await response.json().catch(() => undefined);

    return response.ok ? { data: parsed as T, response } : { error: (parsed ?? {}) as { code?: string; error?: string; field?: string }, response };
  });

  return await agencyCall<T, { code?: string; error?: string; field?: string }>(asked, call);
}

/** How one agency call is answered: a unit call's options, and the pack's key for the sentence a refused field takes
 * where the call has one of its own. */
export type AgencyCall = UnitAnswerCall & { fields?: Readonly<Record<string, string>> };

/** One call on the agency, its refusals said in the pack's words — a call's own codes before the agency's common
 * ones — and a refused field said under that field. */
export async function agencyCall<T, E extends { code?: string; error?: string; field?: string }>(
  asked: Promise<{ data?: T; error?: E; response: Response }>,
  call: AgencyCall = {}
): Promise<T> {
  const { fields = {}, ...unitCall } = call;

  try {
    return await answered(asked, { ...unitCall, codes: { ...AGENCY_CODES, ...unitCall.codes } });
  } catch (error) {
    throw error instanceof Error ? fieldRefusal(error, fields) : error;
  }
}

// A refusal about one field is said by the call's own sentence for that field, else by the one sentence for a
// refused value; the screen puts it under the field the refusal names.
function fieldRefusal(error: Error, fields: Readonly<Record<string, string>>): Error {
  const asked = error as Error & { statusCode?: number; data?: { field?: string } };
  const field = asked.data?.field;

  return asked.statusCode === 400 && typeof field === "string"
    ? createError({ statusCode: 400, message: wording(fields[field] ?? "agents.error.field_refused"), data: { field } })
    : error;
}

// The states a job stands in while it is still going: `starting` while its worker is launched, `running` while its
// turn goes and `reviewing` while its report awaits its orderer's move, its agent's seat, checkout and lease still its
// own; the agency's `running` filter asks for all three in one list (its `docs/api.md`, 「assignments and jobs」, and
// `docs/job-review.md`). The published client names no `reviewing` state, so a state is read here as text.
const JOB_STATES_UNDER_WAY: ReadonlySet<string> = new Set(["starting", "running", "reviewing"]);

/** Whether a job in this state is still going: starting, running or under its orderer's review. */
export function isJobUnderWay(state: string): boolean {
  return JOB_STATES_UNDER_WAY.has(state);
}
