import { CONTROL_UNREACHABLE } from "#shared/config";
import { wording } from "#shared/wording";

import { signedInUser } from "./accounts";
import { agencyCall } from "./agency";
import { ownerHeaders } from "./owner-key";
import { unitAt, unitFetch, unitHeaders } from "./units";

import type { AgencyCall } from "./agency";
import type { H3Event } from "h3";
import type { UnitCall } from "./units";

// The supply routes as the console reaches them (docs/web.md, the supply sections). The account service holds the
// policy, the caps, the usage and the balances, at its `/supply/...` routes; a person's own logins and keys stand at
// the agency, at its `/personal-supply` and `/claude-logins` routes and at its `/fallback` view. The generated
// client and the published agency client name none of these paths yet, so every call here is made with the plain
// request of the unit's own document, its refusals said by the pack's sentences below; the Owner headers are the
// signed-in login's, as every other call carries them, and each unit owns its own refusals.

// The service's supply codes, each with the pack's key for its sentence (the contract's refusals and this service's
// common ones).
export const SUPPLY_CALL: UnitCall = {
  codes: {
    forbidden: "supply.error.forbidden",
    "source-not-allowed": "supply.error.source_not_allowed",
    "not-in-plan": "supply.error.not_in_plan",
    "blocked-by-organisation": "supply.error.blocked_by_organisation",
    "blocked-by-administrator": "supply.error.blocked_by_administrator",
    "not-in-force": "supply.error.not_in_force",
    "bad-request": "supply.error.bad_request",
    // The personal-supply roads a person's detail asks after, where the deployment names no agency: not a failure
    // of the screen, a thing that is not known here (docs/boundary.md, 「Supply」).
    "no-agency": "supply.error.no_agency",
    "upstream-failed": "supply.error.upstream_failed"
  }
};

// The agency's codes for a person's own supply and sign-in, beside its statuses' own (its `docs/api.md`,
// 「accounts, rest and usage」 and 「providers, models and model files」).
export const PERSONAL_SUPPLY_CALL: AgencyCall = {
  codes: {
    conflict: "supply.error.key_taken",
    "unknown-road": "supply.error.unknown_road",
    "unknown-supply": "supply.error.key_gone",
    forbidden: "supply.error.forbidden",
    "node-not-attached": "supply.error.node_off",
    "not-a-directory": "agents.error.login_not_directory",
    "directory-taken": "agents.error.login_directory_taken",
    "no-sign-in": "agents.error.login_gone",
    "sign-in-refused": "agents.error.login_refused"
  },
  fields: { secret: "supply.error.secret_name" }
};

/**
 * One call on the account service's own supply routes, made as the signed-in login acts: the bearer is the
 * service's token and the Owner headers its user and role, and a refusal is the service's, said by the pack.
 */
export async function supplyService<T>(event: H3Event, method: "GET" | "PUT" | "POST" | "PATCH" | "DELETE", path: string, body?: unknown): Promise<T> {
  const signed = await signedInUser(event);
  const headers: Record<string, string> = { accept: "application/json", ...ownerHeaders(signed), ...(body === undefined ? {} : { "content-type": "application/json" }) };

  return await unitFetch<T>("WEB_SERVER", `/supply${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }, SUPPLY_CALL);
}

/**
 * One call on an agency route that acts on the signed-in person's own supply alone. A call handed the Owner headers
 * as the login's own role would stand for the platform administrator, whose `/fallback` and `/claude-logins` reads
 * answer the platform's; these routes are personal by what they set, so the person's role is written on them
 * whoever signs in, and the agency then keeps the call to that person's accounts and keys (its `docs/api.md`,
 * 「Who a caller acts for」).
 */
export async function supplyAgency<T>(event: H3Event, method: "GET" | "POST" | "PATCH" | "DELETE", path: string, body?: unknown): Promise<T> {
  const unit = unitAt("AGENCY");

  if (unit === null) throw fail(503, wording(CONTROL_UNREACHABLE));

  const signed = await signedInUser(event);
  const asPerson = ownerHeaders({ ...signed, administrator: false });
  const asked = fetch(`${unit.address}${path}`, {
    method,
    headers: { ...unitHeaders(unit), ...asPerson, accept: "application/json", ...(body === undefined ? {} : { "content-type": "application/json" }) },
    body: body === undefined ? undefined : JSON.stringify(body)
  }).then(async (response) => {
    const parsed: unknown = await response.json().catch(() => undefined);

    return response.ok ? { data: parsed as T, response } : { error: (parsed ?? {}) as { code?: string; error?: string; field?: string }, response };
  });

  return await agencyCall<T, { code?: string; error?: string; field?: string }>(asked, PERSONAL_SUPPLY_CALL);
}

// How a supply route reads a path or a body field; what does not read as its kind is none.
export function wholePath(event: H3Event, name: string): number | null {
  const raw = getRouterParam(event, name)?.trim() ?? "";

  return /^[1-9][0-9]*$/.test(raw) ? Number(raw) : null;
}

export function wholeValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) return value;
  if (typeof value === "string" && /^[1-9][0-9]*$/.test(value.trim())) return Number(value.trim());

  return null;
}

export function textValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

// The source keys, and the policy a body names: an array of these keys, `stop` last where it stands.
const SUPPLY_SOURCES = ["personal", "global", "org_credits", "personal_credits", "stop"] as const;

export function sourceList(value: unknown): string[] | null {
  if (!Array.isArray(value) || !value.every((one) => typeof one === "string" && (SUPPLY_SOURCES as readonly string[]).includes(one))) return null;

  const seen = new Set<string>(value);

  return seen.size === value.length ? (value as string[]) : null;
}

// The policy a `PUT` of a unit's or a person's policy or the platform's takes: `allowed` and `order`, which must
// both stand, and the cap — written as a whole number or as nothing at all. Anything else is a bad request that
// reaches no service; whether a named source is allowed at all is the service's call, not this relay's.
export function policyBody(body: Record<string, unknown>): { allowed: string[]; order: string[]; memberCreditCredits: number | null } | null {
  const allowed = sourceList(body.allowed);
  const order = sourceList(body.order);

  if (allowed === null || order === null) return null;

  if (body.memberCreditCredits === undefined || body.memberCreditCredits === null) return { allowed, order, memberCreditCredits: null };

  const cap = wholeValue(body.memberCreditCredits);

  return cap === null ? null : { allowed, order, memberCreditCredits: cap };
}

/** The kind a plan is sold to, read from a body; anything else is none. */
export function sourceScope(value: unknown): "personal" | "organisation" | null {
  return value === "personal" || value === "organisation" ? value : null;
}

/** The kind a grant is made to, read from a body; anything else is none. */
export function sourceOwner(value: unknown): "user" | "organisation" | null {
  return value === "user" || value === "organisation" ? value : null;
}
