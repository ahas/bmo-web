import { CONTROL_UNREACHABLE } from "#shared/config";
import { wording } from "#shared/wording";

import type { UnitCall } from "./units";

// One call made through a unit's published client (docs/boundary.md, 「Calls the console makes」). The client
// hands back the route's answer beside its response, and a non-2xx answer is the unit's own `{code, error}`
// body. A call waits for that answer however long it takes; one that reaches no unit, or whose connection
// breaks, is this app's failure and is answered the same way as any other unit call (docs/web.md, 「How the
// units are talked to」).

/** The answer a published client carries: the route's body, its refusal, and the response either stands on. */
export interface UnitResult<T, E> {
  data?: T;
  error?: E;
  response: Response;
}

/** The refusal body every unit answers in the common wire format. */
export interface RefusalBody {
  code?: string;
  error?: string;
  field?: string;
  // A refusal the unit carried out as an answer to a row's state, holding its own code.
  refusal?: RefusalBody;
}

// The call a unit makes beyond the request itself; it is the one `unitFetch` takes (docs/boundary.md, 「A
// refusal is said by the pack's sentence for its code」).
export type UnitAnswerCall = Omit<UnitCall, "refusal"> & {
  refusal?: (body: RefusalBody) => RefusalBody;
};

/** The route's answer, or the refusal or failure it answered with. */
export async function answered<T, E extends RefusalBody>(asked: Promise<UnitResult<T, E>>, call: UnitAnswerCall = {}): Promise<T> {
  let result: UnitResult<T, E>;

  try {
    result = await asked;
  } catch {
    throw fail(503, wording(CONTROL_UNREACHABLE));
  }

  if (result.error !== undefined || !result.response.ok) {
    const status = call.passStatus?.includes(result.response.status) === true ? result.response.status : statusOf(result.response.status);
    const body = result.error ?? null;
    const held = body === null || call.refusal === undefined ? body : call.refusal(body);
    const coded = typeof held?.code === "string" ? call.codes?.[held.code] : undefined;
    const reason = coded !== undefined ? wording(coded, fieldsOf(held)) : reasonIn(body, result.response.status, carries(call, result.response.status));

    throw createError({ statusCode: status, message: reason, data: { field: typeof held?.field === "string" ? held.field : null, code: typeof held?.code === "string" ? held.code : null } });
  }

  return result.data as T;
}

/** A call whose route answers no body: taken, and nothing returned. */
export async function done<T, E extends RefusalBody>(asked: Promise<UnitResult<T, E>>, call: UnitAnswerCall = {}): Promise<void> {
  await answered(asked, call);
}

function fieldsOf(body: RefusalBody | null | undefined): Record<string, string | number> {
  const fields: Record<string, string | number> = {};

  for (const [name, value] of Object.entries(body ?? {})) {
    if (name === "code" || name === "error" || name === "refusal") continue;
    if (typeof value === "string" || typeof value === "number") fields[name] = value;
    else if (Array.isArray(value) && value.every((one) => typeof one === "string" || typeof one === "number")) fields[name] = value.join(", ");
  }

  return fields;
}

function carries(call: UnitAnswerCall, status: number): boolean {
  return call.carryReason === true || (Array.isArray(call.carryReason) && call.carryReason.includes(status));
}

// A unit that refused the call refused it for a reason of its own, and the caller has something to say about
// each of those, so they travel on as they are. Anything else is this app's own gateway failure.
function statusOf(status: number): number {
  return status === 400 || status === 404 || status === 409 || status === 429 || status === 413 || status === 503 ? status : 502;
}

// A refusal a unit wrote for a person is the whole of what they need, and saying "the unit answered 400" in
// its place would throw the answer away. Every unit's refusal carries its sentence as `error`.
function reasonIn(body: RefusalBody | null, status: number, carry: boolean): string {
  if (carry && typeof body?.error === "string" && body.error !== "") {
    return body.error;
  }

  return wording("control.error.status", { status });
}
