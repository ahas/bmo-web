import { withoutBase } from "ufo";

import { emptyFallbackView } from "../../app/domain/agent-settings";

import { policyBody, sourceList, sourceOwner, sourceScope, supplyAgency, supplyService, textValue, wholeValue } from "./supply";
import { signedInUser } from "./accounts";
import { keepLocalAi, localAiAsked, localAiIncomplete, localAis, removeLocalAi, switchLocalAi, tryLocalAi } from "./local-ai";
import { mayRead, mayWrite } from "#shared/sections";
import { sectionAccessOf } from "./section-access";

import { wording } from "#shared/wording";

import type { SupplyAuditWire, SupplyLedgerWire, SupplyMe, SupplyOrgPlans, SupplyOrgPlansWire, SupplyOrgView, SupplyOrgWire, SupplyPlatformView, SupplyPlatformWire, SupplyPolicy, SupplyPlansWire, SupplyUnit, SupplyUnitsWire, SupplyUserView, SupplyUserWire } from "#shared/supply";
import type { PersonalSupplyKey } from "#shared/supply";
import type { ClaudeLoginStarted, FallbackChanged, FallbackView } from "#shared/types";
import type { H3Event } from "h3";

// One relay for everything the supply screens ask of the account service and the agency (docs/web.md, the supply
// sections). Every call carries the signed-in login's Owner headers, and each unit owns its own refusals; the
// account service holds the policy, the caps, the usage and the balances at its `/supply/...` routes, a person's
// own logins and keys stand at the agency's `/fallback` and `/personal-supply` and `/claude-logins` routes, and
// the person's role is written on the agency's personal calls whoever signs in, so the agency keeps those to the
// reader's own accounts and keys (its `docs/api.md`, 「Who a caller acts for」). No credential and no secret value
// crosses here: what a read says of a key is its name, and of a login the path it is reached by.
//
// The service answers the wire whole and camelCase, and a policy or a plan write is answered with the view as it
// now stands, so the relay hands that answer on rather than reading the view again. What a screen may not read of
// a unit it does not hold stands as none in the answer, and the screen says so rather than guessing.
//
// The paths under `/api/supply/`, by method:
//   GET  me                         the reader's own view; units answers the units a supply tab may stand for alone
//   PUT  me                         the reader's own setting — the order, the sources switched off and on, the
//                                   cap — written whole, answered as the view now stands
//   GET  personal                   the reader's own gateway keys
//   POST personal                   a key added: a road and the name of one of the reader's own secrets
//   PATCH personal/{key}            one key's place or switch
//   DELETE personal/{key}           one key taken away; the secret itself stays in the store
//   GET  local-ai                   the reader's own local AIs, and whether their organisation lets them add one
//   POST local-ai/test              a local AI tried from the reader's PC before it is kept
//   PUT  local-ai/{name}            a local AI tried from the reader's PC and kept once it answers
//   PATCH local-ai/{name}           one local AI's switch;  DELETE local-ai/{name} takes it away
//   GET  logins                     the reader's own Claude logins, in their order
//   POST logins                     the reader's own change: the order, a switch, a row removed
//   POST signin                     a sign-in started on the reader's node: a new one, named by the agency where
//                                   the body names none, or a standing login by its id
//   POST signin/{login}/code        the code the sign-in page showed, handed back
//   DELETE signin/{login}           a sign-in given up
//   GET  org/{unit}                 a unit's policy, plan, wallet and members' spend
//   PUT  org/{unit}                 its policy written whole, answered as it now stands; DELETE takes the row away
//                                   and answers the unit inheriting again
//   POST org/{unit}/credits         credits granted to its wallet, with the words kept
//   GET  org/{unit}/plans           the plans it is shown, the one it runs on, and for the administrator every
//                                   organisation-scope plan with its exposure
//   PUT  org/{unit}/plans/exposed   the plans it is shown, written whole;  PUT .../applied the one it runs on, or
//                                   none; each answered as GET answers
//   GET  user/{user}                a person's policy, their providers' names and their resolved order
//   PUT  user/{user}                their per-user policy, answered as it now stands;  DELETE returns them to
//                                   their organisation's and answers the same view
//   GET  platform                   the platform default, the conversion, the reservation, the switch
//   PUT  platform                   any part of them changed — the sources and the order a person's own setting
//                                   may change among them — answered as the row now stands
//   GET  plans                      every plan;  POST adds one and answers it
//   PATCH plans/{plan}              a plan changed in part, answered whole;  DELETE retires it and answers the list
//   POST credits                    credits granted to a person or an organisation
//   GET  credits/ledger             the ledger, newest first, after a cursor
//   GET  credits/audit              every grant and every change of a policy, a rate or the switch, newest first

/**
 * Every call the supply screens make, relayed: the guard below answers each head as absent to the login it
 * does not belong to, and what stands open passes on to the unit that owns it. The relay stands as one spread of
 * route files under `/api/supply`, one method each (docs/web.md, 「Access」), so the guard reads the path itself
 * rather than a route entry: the platform row, the plans and the credits are the administrator's; the reader's
 * own supply heads are the account section's, an administrator's passing as they pass everywhere; the unit and
 * person reads belong to any signed-in login, the account service judging each one. No path here answers the
 * guard with anything but a whole call or a silence; the refusal of a call itself belongs to its unit.
 */
export async function supplyRelay(event: H3Event): Promise<unknown> {
  // The request's path is read with the console's base taken off it where the mount left one on it, so the heads
  // are found the same way whether or not the base stands in front of the path.
  const asked = withoutBase(event.path.split("?")[0] ?? "", useRuntimeConfig(event).app.baseURL ?? "/");
  const rest = decodeURIComponent(asked.replace(/^\/?api\/supply\//, ""));
  const parts = rest.split("/");
  const head = parts.shift() ?? "";
  const method = event.method.toUpperCase();

  const signed = await signedInUser(event);

  if (head === "platform" || head === "plans" || head === "credits") {
    if (!signed.administrator) throw absent();
  } else if (head === "me" || head === "logins" || head === "signin" || head === "personal" || head === "local-ai") {
    if (!signed.administrator) {
      if (signed.id === null) throw absent();

      const key = String(signed.id);
      const access = await sectionAccessOf(key, { key, role: "member" });

      if (!(method === "GET" ? mayRead(access, "account") : mayWrite(access, "account"))) throw absent();
    }
  }

  const body = method === "GET" || method === "DELETE" ? {} : ((await readBody<Record<string, unknown>>(event).catch(() => ({}))) ?? {});

  if (head === "me") {
    if (parts.length !== 0) throw absent();

    // Optional fields are absent on the wire where they stand as none, so the read is normalized as the write is.
    if (method === "GET") return meView(await supplyService<SupplyMeWire>(event, "GET", "/me"));

    if (method === "PUT") return await writeMe(event, body);

    throw absent();
  }

  if (head === "units") {
    if (method !== "GET" || parts.length !== 0) throw absent();

    // The companies whose supply the reader holds a part of, as the account service judges them by its own
    // relations (docs/web.md, 「System and organisation」, the supply and plans tabs): every company for the administrator, and
    // for anyone else each company whose policy and credits they hold — its credit manager or its head — or whose
    // plan they hold — its subscription manager or its head —, each saying which.
    const answer = await supplyService<SupplyUnitsWire>(event, "GET", "/units");

    return (answer.units ?? []).map((one): SupplyUnit => ({ id: one.id, name: one.name, parent: null, policy: one.policy === true, plan: one.plan === true }));
  }

  if (head === "personal") return await keys(event, method, parts, body);
  if (head === "local-ai") return await localAi(event, method, parts, body);
  if (head === "logins" && parts.length === 0) return await logins(event, method, body);
  if (head === "signin") return await signIn(event, method, parts, body);
  if (head === "org") return await org(event, method, parts, body);
  if (head === "user") return await person(event, method, parts, body);
  if (head === "platform" && parts.length === 0) return await platform(event, method, body);
  if (head === "plans") return await plans(event, method, parts, body);
  if (head === "credits") return await credits(event, method, parts, body);

  throw absent();
}

function absent(): Error {
  return createError({ statusCode: 404, statusMessage: "Not Found" });
}

function bad(): Error {
  return fail(400, wording("supply.error.bad_request"));
}

// The reader's own setting, written whole: the order, the sources switched off and those switched on against the
// platform's default. The service answers the write with the view as it now stands; where it answers nothing, the
// view is read again rather than left half-drawn.
async function writeMe(event: H3Event, body: Record<string, unknown>): Promise<SupplyMe> {
  const order = sourceList(body.order);
  const off = sourceList(body.off);
  const on = sourceList(body.on);

  if (order === null || off === null || on === null) throw bad();
  if (body.personalCreditCredits !== undefined && body.personalCreditCredits !== null && wholeValue(body.personalCreditCredits) === null) throw bad();

  const cap = body.personalCreditCredits === undefined ? undefined : wholeValue(body.personalCreditCredits);
  const written = await supplyService<SupplyMeWire>(event, "PUT", "/me", {
    order,
    off,
    on,
    ...(cap === undefined ? {} : { personalCreditCredits: cap })
  });

  return Array.isArray(written.sources) ? meView(written) : meView(await supplyService<SupplyMeWire>(event, "GET", "/me"));
}

type SupplyMeWire = Omit<SupplyMe, "sources" | "orderLocked"> & { orderLocked?: boolean; sources?: (Omit<SupplyMe["sources"][number], "locked"> & { locked?: boolean })[] };

// The view as the reader's screens stand on it, the service's own lists kept as it gave them; a source or an order
// the answer says nothing of locking is one the reader's own setting changes.
function meView(wire: SupplyMeWire): SupplyMe {
  return {
    order: wire.order ?? [],
    orderLocked: wire.orderLocked === true,
    sources: (wire.sources ?? []).map((one) => ({ ...one, locked: one.locked === true })),
    personalCreditCredits: wire.personalCreditCredits ?? null,
    usage: wire.usage ?? [],
    globalRemaining: wire.globalRemaining ?? null,
    personalCredits: wire.personalCredits ?? null
  };
}

// The reader's own gateway keys, at the agency.
async function keys(event: H3Event, method: string, parts: string[], body: Record<string, unknown>): Promise<unknown> {
  if (parts.length === 0) {
    if (method === "GET") {
      const answer = await supplyAgency<{ items?: PersonalSupplyKey[] }>(event, "GET", "/personal-supply");

      return answer.items ?? [];
    }

    if (method === "POST") {
      const road = textValue(body.road);
      const secret = textValue(body.secret);

      if (road === null || secret === null) throw bad();

      setResponseStatus(event, 201);

      return await supplyAgency<PersonalSupplyKey>(event, "POST", "/personal-supply", { road, secret });
    }

    throw absent();
  }

  const key = textValue(parts[0]);

  if (parts.length !== 1 || key === null) throw absent();

  if (method === "PATCH") {
    const asked: Record<string, unknown> = {};

    if (body.place !== undefined) {
      const place = wholeValue(body.place);

      if (place === null) throw bad();
      asked.place = place;
    }

    if (body.enabled !== undefined) {
      if (typeof body.enabled !== "boolean") throw bad();
      asked.enabled = body.enabled;
    }

    if (Object.keys(asked).length === 0) throw bad();

    return await supplyAgency<PersonalSupplyKey>(event, "PATCH", `/personal-supply/${encodeURIComponent(key)}`, asked);
  }

  if (method === "DELETE") {
    setResponseStatus(event, 204);

    await supplyAgency<void>(event, "DELETE", `/personal-supply/${encodeURIComponent(key)}`);

    return null;
  }

  throw absent();
}

// The reader's own local AIs, at the agency (docs/web.md, 「System and organisation」, the supply tab's local AIs at the reader's
// own node).
async function localAi(event: H3Event, method: string, parts: string[], body: Record<string, unknown>): Promise<unknown> {
  if (parts.length === 0) {
    if (method === "GET") return await localAis(event);

    throw absent();
  }

  const name = textValue(parts[0]);

  if (parts.length !== 1 || name === null) throw absent();

  if (name === "test" && method === "POST") {
    const asked = localAiAsked({ ...body, name: "test" });

    if (asked === null) throw localAiIncomplete();

    return await tryLocalAi(event, asked);
  }

  if (method === "PUT") {
    const asked = localAiAsked(body, name);

    if (asked === null) throw localAiIncomplete();

    return await keepLocalAi(event, asked);
  }

  if (method === "PATCH") {
    if (typeof body.enabled !== "boolean") throw bad();

    return await switchLocalAi(event, name, body.enabled);
  }

  if (method === "DELETE") {
    setResponseStatus(event, 204);
    await removeLocalAi(event, name);

    return null;
  }

  throw absent();
}

// The Claude accounts as the signed-in person walks them. Only the person's own actions pass: the order, a switch,
// and a row taken away; every other action of the fallback's change belongs to the platform's list.
const PERSON_ACTIONS = ["set-account-order", "set-account-enabled", "remove-account"];

async function logins(event: H3Event, method: string, body: Record<string, unknown>): Promise<FallbackView | FallbackChanged> {
  if (method === "GET") {
    const fallback = await supplyAgency<Partial<FallbackView>>(event, "GET", "/fallback");
    const empty = emptyFallbackView();

    return { active: fallback.active ?? empty.active, accounts: Array.isArray(fallback.accounts) ? fallback.accounts : empty.accounts };
  }

  const action = textValue(body.action);

  if (method !== "POST" || action === null || !PERSON_ACTIONS.includes(action)) throw fail(400, wording("common.error.bad_action"));

  const account = textValue(body.account);
  const asked: Record<string, unknown> = { action };

  if (action === "set-account-order") {
    if (!Array.isArray(body.order) || body.order.length === 0) throw fail(400, wording("agents.error.account_order_list"));
    asked.order = body.order;
  }

  if (action === "set-account-enabled") {
    if (account === null || typeof body.enabled !== "boolean") throw fail(400, wording("agents.error.account_switch_needed"));
    asked.account = account;
    asked.enabled = body.enabled;
  }

  if (action === "remove-account" && account === null) throw fail(400, wording("agents.error.pick_account"));

  await supplyAgency<void>(event, "PATCH", "/fallback", asked);

  return { ok: true };
}

// A person's own sign-in: started, answered with its page's code, or given up (docs/web.md, 「System and organisation」, the
// supply tab at the reader's own node). A new login's start may name no name, the agency then naming it past every
// account's names, which the person cannot see. The address and the code pass through and are kept by neither.
async function signIn(event: H3Event, method: string, parts: string[], body: Record<string, unknown>): Promise<ClaudeLoginStarted | null> {
  if (parts.length === 0) {
    if (method !== "POST") throw absent();

    const account = textValue(body.account);
    const name = textValue(body.name);

    if (account !== null && name !== null) throw fail(400, wording("agents.error.login_which"));

    setResponseStatus(event, 201);

    return await supplyAgency<ClaudeLoginStarted>(event, "POST", "/claude-logins", account !== null ? { account } : name !== null ? { name } : {});
  }

  const login = textValue(parts[0]);

  if (login === null) throw absent();

  if (parts.length === 1 && method === "DELETE") {
    await supplyAgency<void>(event, "DELETE", `/claude-logins/${encodeURIComponent(login)}`);

    return null;
  }

  if (parts.length === 2 && parts[1] === "code" && method === "POST") {
    const code = textValue(body.code);

    if (code === null) throw createError({ statusCode: 400, message: wording("agents.error.login_code_needed"), data: { field: "code" } });

    await supplyAgency<void>(event, "POST", `/claude-logins/${encodeURIComponent(login)}/code`, { code });

    return null;
  }

  throw absent();
}

function unitOf(parts: readonly string[]): number {
  const unit = wholePathLike(parts[0]);

  if (parts.length === 0 || unit === null) throw absent();

  return unit;
}

function wholePathLike(value: string | undefined): number | null {
  return value !== undefined && /^[1-9][0-9]*$/.test(value) ? Number(value) : null;
}

// One unit's supply: read, written whole or taken back to inheriting — every one of those answered with the unit
// as it now stands — and granted credits.
async function org(event: H3Event, method: string, parts: string[], body: Record<string, unknown>): Promise<unknown> {
  const unit = unitOf(parts);

  if (parts.length === 1) {
    if (method === "GET" || method === "PUT" || method === "DELETE") {
      if (method === "PUT") {
        const policy = policyBody(body);

        if (policy === null) throw bad();

        return orgView(await supplyService<SupplyOrgWire>(event, "PUT", `/org/${unit}`, policy));
      }

      return orgView(await supplyService<SupplyOrgWire>(event, method, `/org/${unit}`));
    }

    throw absent();
  }

  if (parts[1] === "plans") return await orgPlans(event, unit, method, parts.slice(2), body);

  if (parts.length === 2 && parts[1] === "credits" && method === "POST") {
    const amount = wholeValue(body.amount);

    if (amount === null) throw bad();

    const words = textValue(body.words);

    await supplyService<{ balance: number; debt: number }>(event, "POST", `/org/${unit}/credits`, words === null ? { amount } : { amount, words });

    return orgView(await supplyService<SupplyOrgWire>(event, "GET", `/org/${unit}`));
  }

  throw absent();
}

// One unit's plans: read, or one of its two choices written — the plans it is shown, written whole, and the one it runs
// on, a plan's id or none — every write answered with the plans as they now stand.
async function orgPlans(event: H3Event, unit: number, method: string, rest: string[], body: Record<string, unknown>): Promise<SupplyOrgPlans> {
  if (rest.length === 0 && method === "GET") return orgPlansView(await supplyService<SupplyOrgPlansWire>(event, "GET", `/org/${unit}/plans`));

  if (rest.length !== 1 || method !== "PUT") throw absent();

  if (rest[0] === "exposed") {
    const plans = planIds(body.plans);

    if (plans === null) throw bad();

    return orgPlansView(await supplyService<SupplyOrgPlansWire>(event, "PUT", `/org/${unit}/plans/exposed`, { plans }));
  }

  if (rest[0] === "applied") {
    const plan = body.plan === null ? null : wholeValue(body.plan);

    if (plan === null && body.plan !== null) throw bad();

    return orgPlansView(await supplyService<SupplyOrgPlansWire>(event, "PUT", `/org/${unit}/plans/applied`, { plan }));
  }

  throw absent();
}

// The plan ids a body names, each a whole number and none twice; anything else is none.
function planIds(value: unknown): number[] | null {
  if (!Array.isArray(value)) return null;

  const ids = value.map(wholeValue);

  return ids.every((one): one is number => one !== null) && new Set(ids).size === ids.length ? ids : null;
}

function orgPlansView(wire: SupplyOrgPlansWire): SupplyOrgPlans {
  return { exposed: wire.exposed ?? [], applied: wire.applied ?? null, catalogue: wire.catalogue ?? null };
}

// The unit's view as the screens stand on it: what the service answered none of stands as none, and a unit with no
// policy row of its own inherits whatever the answer carries from above.
function orgView(wire: SupplyOrgWire): SupplyOrgView {
  return {
    inherits: wire.inherits !== false,
    policy: policyOf(wire.policy ?? null),
    plan: wire.plan ?? null,
    wallet: wire.wallet ?? null,
    available: wire.available ?? [],
    usage: wire.usage ?? []
  };
}

function policyOf(policy: SupplyOrgWire["policy"]): SupplyPolicy | null {
  if (policy === null || policy === undefined || !Array.isArray(policy.allowed) || !Array.isArray(policy.order)) return null;

  return { allowed: policy.allowed, order: policy.order, memberCreditCredits: policy.memberCreditCredits ?? null, from: policy.from ?? null };
}

// One person's supply, as the readers who may set it see it: read, written whole or taken away, every one of those
// answered with the person as they now stand. A deployment that names no agency is refused `no-agency`, and the
// refusal travels on for the tab to say in one line rather than fail.
async function person(event: H3Event, method: string, parts: string[], body: Record<string, unknown>): Promise<unknown> {
  const user = parts.length >= 1 ? wholePathLike(parts[0]) : null;

  if (user === null || parts.length !== 1) throw absent();

  if (method === "GET" || method === "PUT" || method === "DELETE") {
    if (method === "PUT") {
      const policy = policyBody(body);

      if (policy === null) throw bad();

      return userView(await supplyService<SupplyUserWire>(event, "PUT", `/user/${user}`, policy));
    }

    return userView(await supplyService<SupplyUserWire>(event, method, `/user/${user}`));
  }

  throw absent();
}

function userView(wire: SupplyUserWire): SupplyUserView {
  return {
    inherits: wire.inherits !== false,
    policy: policyOf(wire.policy ?? null),
    providers: wire.providers ?? [],
    order: wire.order ?? []
  };
}

// The platform's standing, read whole and changed in part; every change is answered with the row as it now stands.
async function platform(event: H3Event, method: string, body: Record<string, unknown>): Promise<unknown> {
  if (method === "GET") return platformView(await supplyService<SupplyPlatformWire>(event, "GET", "/platform"));

  if (method !== "PUT") throw absent();

  const asked: Record<string, unknown> = {};

  if (body.allowed !== undefined || body.order !== undefined) {
    const policy = body.allowed === undefined || body.order === undefined ? null : policyBody({ allowed: body.allowed, order: body.order });

    if (policy === null) throw bad();

    asked.allowed = policy.allowed;
    asked.order = policy.order;
  }

  if (body.overridable !== undefined) {
    const overridable = sourceList(body.overridable);

    if (overridable === null) throw bad();
    asked.overridable = overridable;
  }

  if (body.orderOverridable !== undefined) {
    if (typeof body.orderOverridable !== "boolean") throw bad();
    asked.orderOverridable = body.orderOverridable;
  }

  for (const field of ["creditsPerDollar", "reservationCredits"] as const) {
    const value = wholeValue(body[field]);

    if (body[field] !== undefined && value === null) throw bad();
    if (value !== null) asked[field] = value;
  }

  if (body.enforce !== undefined) {
    if (typeof body.enforce !== "boolean") throw bad();
    asked.enforce = body.enforce;
  }

  if (Object.keys(asked).length === 0) throw bad();

  return platformView(await supplyService<SupplyPlatformWire>(event, "PUT", "/platform", asked));
}

// The platform row as the screen stands on it: the default policy under one name, what a person's own setting may
// change of it — none where the answer names none — and the money settings beside it.
function platformView(wire: SupplyPlatformWire): SupplyPlatformView {
  if (!Array.isArray(wire.allowed) || !Array.isArray(wire.order) || wire.creditsPerDollar === undefined || wire.reservationCredits === undefined) {
    throw createError({ statusCode: 502, message: wording("supply.error.platform_read_failed") });
  }

  return {
    policy: { allowed: wire.allowed, order: wire.order, memberCreditCredits: null },
    overridable: wire.overridable ?? [],
    orderOverridable: wire.orderOverridable === true,
    creditsPerDollar: wire.creditsPerDollar,
    reservationCredits: wire.reservationCredits,
    enforce: wire.enforce === true
  };
}

// The plans: read whole, made whole, changed in part, retired — a retirement answered with the list as it now
// stands, newest first.
async function plans(event: H3Event, method: string, parts: string[], body: Record<string, unknown>): Promise<unknown> {
  if (parts.length === 0) {
    if (method === "GET") return await readPlans(event);

    if (method === "POST") {
      const name = textValue(body.name);
      const scope = sourceScope(body.scope);
      const period = textValue(body.period);
      const price = body.price === undefined ? null : wholeValue(body.price) ?? (body.price === 0 ? 0 : null);
      const included = body.includedCredits === undefined ? null : wholeValue(body.includedCredits) ?? (body.includedCredits === 0 ? 0 : null);

      if (name === null || scope === null || period === null || price === null || included === null || typeof body.creditsUsable !== "boolean") throw bad();

      setResponseStatus(event, 201);

      return await supplyService<unknown>(event, "POST", "/plans", { name, price, scope, includedCredits: included === 0 ? null : included, period, creditsUsable: body.creditsUsable });
    }

    throw absent();
  }

  const plan = textValue(parts[0]);

  if (parts.length !== 1 || plan === null) throw absent();

  if (method === "PATCH") {
    const asked: Record<string, unknown> = {};

    if (body.name !== undefined) {
      const name = textValue(body.name);
      if (name === null) throw bad();
      asked.name = name;
    }

    if (body.price !== undefined) {
      const price = wholeValue(body.price) ?? (body.price === 0 ? 0 : null);
      if (price === null) throw bad();
      asked.price = price;
    }

    if (body.period !== undefined) {
      const period = textValue(body.period);
      if (period === null) throw bad();
      asked.period = period;
    }

    if (body.includedCredits !== undefined) {
      const included = body.includedCredits === null ? null : wholeValue(body.includedCredits) ?? (body.includedCredits === 0 ? 0 : null);
      if (included === null && body.includedCredits !== null) throw bad();
      asked.includedCredits = included === 0 ? null : included;
    }

    if (body.creditsUsable !== undefined) {
      if (typeof body.creditsUsable !== "boolean") throw bad();
      asked.creditsUsable = body.creditsUsable;
    }

    if (Object.keys(asked).length === 0) throw bad();

    return await supplyService<unknown>(event, "PATCH", `/plans/${encodeURIComponent(plan)}`, asked);
  }

  if (method === "DELETE") {
    return await supplyService<SupplyPlansWire>(event, "DELETE", `/plans/${encodeURIComponent(plan)}`).then(plansOf);
  }

  throw absent();
}

async function readPlans(event: H3Event): Promise<unknown> {
  return plansOf(await supplyService<SupplyPlansWire>(event, "GET", "/plans"));
}

function plansOf(answer: SupplyPlansWire | unknown[]): unknown {
  return Array.isArray(answer) ? answer : answer.plans ?? [];
}

// Grants and the two records: the ledger, newest first after a cursor, and the audit beside it.
async function credits(event: H3Event, method: string, parts: string[], body: Record<string, unknown>): Promise<unknown> {
  if (parts.length === 0) {
    if (method !== "POST") throw absent();

    const ownerKind = sourceOwner(body.ownerKind);
    const ownerId = wholeValue(body.ownerId);
    const amount = wholeValue(body.amount);

    if (ownerKind === null || ownerId === null || amount === null) throw bad();

    const words = textValue(body.words);

    await supplyService<{ balance: number; debt: number }>(event, "POST", "/credits", words === null ? { ownerKind, ownerId, amount } : { ownerKind, ownerId, amount, words });

    return await ledger(event, "/credits/ledger");
  }

  if (parts.length === 1 && method === "GET" && (parts[0] === "ledger" || parts[0] === "audit")) {
    const query = getQuery(event);
    const asked: Record<string, string | number> = { limit: 50 };

    if (typeof query.after === "string" && /^[1-9][0-9]*$/.test(query.after)) asked.after = Number(query.after);
    if (typeof query.limit === "string") {
      const limit = Number(query.limit);

      if (Number.isSafeInteger(limit) && limit > 0 && limit <= 200) asked.limit = limit;
    }

    return await (parts[0] === "ledger" ? ledger(event, `/credits/ledger?${qs(asked)}`) : audit(event, `/credits/audit?${qs(asked)}`));
  }

  throw absent();
}

function qs(asked: Record<string, string | number>): string {
  return new URLSearchParams(Object.entries(asked).map(([key, value]) => [key, String(value)])).toString();
}

async function ledger(event: H3Event, path: string): Promise<unknown> {
  const page = await supplyService<SupplyLedgerWire>(event, "GET", path);

  return { entries: page.entries ?? [], next: page.next ?? null };
}

async function audit(event: H3Event, path: string): Promise<unknown> {
  const page = await supplyService<SupplyAuditWire>(event, "GET", path);

  return { entries: page.entries ?? [], next: page.next ?? null };
}
