import { agencyClient } from "@agency/client";

import { CONTROL_UNREACHABLE } from "#shared/config";
import { wording } from "#shared/wording";

import { unitAt, unitHeaders } from "./units";
import { answered } from "./unit-answer";

import type { AgencyClient } from "@agency/client";
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
  "name-taken": "agents.error.agent_name_taken"
};

/** The agency at the address its setting names, asked with its token. */
export function agency(): AgencyClient {
  const unit = unitAt("AGENCY");

  if (unit === null) throw fail(503, wording(CONTROL_UNREACHABLE));

  return agencyClient(unit.address, unit.token ?? "");
}

/**
 * One call on an agency route the published client the console vendors names no type for, by the path the agency's
 * `docs/api.md` documents, answered and refused as every other agency call is.
 */
export async function agencyRoute<T>(method: "GET" | "PUT" | "PATCH", path: string, body?: unknown): Promise<T> {
  const unit = unitAt("AGENCY");

  if (unit === null) throw fail(503, wording(CONTROL_UNREACHABLE));

  const asked = fetch(`${unit.address}${path}`, {
    method,
    headers: { ...unitHeaders(unit), accept: "application/json", ...(body === undefined ? {} : { "content-type": "application/json" }) },
    body: body === undefined ? undefined : JSON.stringify(body)
  }).then(async (response) => {
    const parsed: unknown = await response.json().catch(() => undefined);

    return response.ok ? { data: parsed as T, response } : { error: (parsed ?? {}) as { code?: string; error?: string; field?: string }, response };
  });

  return await agencyCall<T, { code?: string; error?: string; field?: string }>(asked);
}

/** One call on the agency, its refusals said in the pack's words — a call's own codes before the agency's common
 * ones — and a refused field said under that field. */
export async function agencyCall<T, E extends { code?: string; error?: string; field?: string }>(
  asked: Promise<{ data?: T; error?: E; response: Response }>,
  call: UnitAnswerCall = {}
): Promise<T> {
  try {
    return await answered(asked, { ...call, codes: { ...AGENCY_CODES, ...call.codes } });
  } catch (error) {
    throw error instanceof Error ? fieldRefusal(error) : error;
  }
}

// A refusal about one field is said by the one sentence for a refused value; the screen puts it under the
// field the refusal names.
function fieldRefusal(error: Error): Error {
  const asked = error as Error & { statusCode?: number; data?: { field?: string } };

  return asked.statusCode === 400 && typeof asked.data?.field === "string"
    ? createError({ statusCode: 400, message: wording("agents.error.field_refused"), data: { field: asked.data.field } })
    : error;
}
