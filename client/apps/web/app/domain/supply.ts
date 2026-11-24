import { dayKey, toUnixSeconds } from "bmo-ui/app/domain/time";

import { accountName } from "./nodes";
import { countText } from "./numbers";

import type { GatewayMember, PersonalSupplyKey, SupplyAppliedPlan, SupplyCataloguePlan, SupplyMe, SupplyMeSetting, SupplyOrgPlans, SupplyPlanEntry, SupplyPolicy, SpentSource, SupplyReason, SupplySource, SupplyUnit } from "#shared/supply";
import type { ClaudeAccountView } from "#shared/types";
import type { Translate } from "#shared/wording";
import type { ComputedRef } from "vue";

// Supply as the console's screens read it (docs/web.md, the supply sections): the five sources and the words each is
// shown by, the states a row carries, and the numbers as a person sees them. Every refusal of a write belongs to
// the account service or the agency, and is said by the pack's sentence for its code; nothing here decides.

/** The five sources, in the order the contract keys them and the screens list them; `stop` always last. */
export const SUPPLY_SOURCES: readonly { value: SupplySource; label: string }[] = [
  { value: "personal", label: "supply.label.source_personal" },
  { value: "global", label: "supply.label.source_global" },
  { value: "org_credits", label: "supply.label.source_org_credits" },
  { value: "personal_credits", label: "supply.label.source_personal_credits" },
  { value: "stop", label: "supply.label.source_stop" }
];

/** The sources a policy may hold, which is every one but the end of the fall. */
export const POLICY_SOURCES: readonly { value: SupplySource; label: string }[] = SUPPLY_SOURCES.filter((one) => one.value !== "stop");

/** The provider names a person's own supply stands under: the gateway roads' products, as they name themselves. */
export const SUPPLY_ROADS: readonly { value: string; label: string }[] = [
  { value: "claude", label: "supply.label.road_claude" },
  { value: "codex", label: "supply.label.road_codex" },
  { value: "deepseek", label: "supply.label.road_deepseek" },
  { value: "openrouter", label: "supply.label.road_openrouter" }
];

/** The word a source is shown by, whole from the pack; the organisation's own supply, which a run's usage names and
 * no policy does, among them. */
export function sourceLabel(t: Translate, source: SupplySource | SpentSource): string {
  if (source === "organisation") return t("supply.label.source_organisation");

  return t(SUPPLY_SOURCES.find((one) => one.value === source)?.label ?? "supply.label.source_stop");
}

/** The words for a source a policy form may set: every source but `stop`, with the order kept. */
export function policySourceItems(t: Translate): { value: SupplySource; label: string }[] {
  return POLICY_SOURCES.map((one) => ({ value: one.value, label: t(one.label) }));
}

/** The one line a closed source is given: which layer closed it, in the pack's words. */
export function sourceReasonText(t: Translate, reason: SupplyReason): string {
  const keys: Record<SupplyReason, string> = {
    "not-in-plan": "supply.label.reason_not_in_plan",
    "blocked-by-organisation": "supply.label.reason_blocked_by_organisation",
    "blocked-by-administrator": "supply.label.reason_blocked_by_administrator"
  };

  return t(keys[reason]);
}

// What one's own Claude login can do now, in the pack's word: a login never signed in says so, a login that has
// ended needs a person, one the windows have filled needs waiting, an off one is only switched back on, and the
// rest go out.
export function loginStatus(t: Translate, account: ClaudeAccountView, nowSeconds: number): { label: string; tone: string; icon: string } {
  if (!account.enabled) {
    return { label: t("supply.label.login_off"), tone: "text-muted", icon: "i-material-symbols-block-outline" };
  }

  if (account.login === "none") {
    return { label: t("supply.label.login_none"), tone: "text-error", icon: "i-material-symbols-error-outline" };
  }

  if (account.login === "gone") {
    return { label: t("supply.label.login_needed"), tone: "text-error", icon: "i-material-symbols-error-outline" };
  }

  if (account.restUntil !== null && account.restUntil > nowSeconds) {
    return { label: t("supply.label.window_full"), tone: "text-warning", icon: "i-material-symbols-hourglass-top" };
  }

  return { label: t("supply.label.usable"), tone: "text-success", icon: "i-material-symbols-check-circle-outline" };
}

// What one's own gateway key can do now: a key the road refused says so until it is switched back on, and a key
// that is off is only waiting to be thrown.
export function keyStatus(t: Translate, key: PersonalSupplyKey): { label: string; tone: string; icon: string } {
  if (!key.enabled) {
    return { label: t("supply.label.login_off"), tone: "text-muted", icon: "i-material-symbols-block-outline" };
  }

  if (key.refusedAt !== null) {
    return { label: t("supply.label.refused"), tone: "text-error", icon: "i-material-symbols-error-outline" };
  }

  return { label: t("supply.label.usable"), tone: "text-success", icon: "i-material-symbols-check-circle-outline" };
}

/** The provider a key stands under, in its own words; a road the console names none for stands as the agency wrote
 * it — a name of a thing, shown as it is kept, as a role key is. */
export function roadLabel(t: Translate, road: string): string {
  const known = SUPPLY_ROADS.find((one) => one.value === road);

  return known === undefined ? road : t(known.label);
}

/** The same for an administrator's read of whose providers: names alone, so an unknown one stands as it was answered. */
export function providerLabel(t: Translate, provider: string): string {
  const known = SUPPLY_ROADS.find((one) => one.value === provider);

  return known === undefined ? provider : t(known.label);
}

/** A figure in credits, whole with its thousands and the console's own word after it. */
export function creditsText(t: Translate, credits: number): string {
  return t("supply.label.credits_count", { n: countText(credits) });
}

/** A cost in millionths of a dollar, shown as the dollars it is. */
export function costText(micros: number): string {
  return `US$${(micros / 1_000_000).toFixed(2)}`;
}

/** A price in whole won, and the console's own word after it. */
export function wonText(t: Translate, price: number): string {
  return t("supply.label.won", { n: countText(price) });
}

/** The policy a form opened with, as whole values, so a save writes it as one. The platform's form carries what a
 * person's own setting may change as well: the sources left to it and whether the order is. */
export interface PolicyDraft {
  allowed: SupplySource[];
  order: SupplySource[];
  memberCreditCredits: number | null;
  overridable: SupplySource[];
  orderOverridable: boolean;
}

/** The policy a form writes: the policy, and for the platform's form what a person's own setting may change of it. */
export interface PolicyWrite extends SupplyPolicy {
  overridable: SupplySource[];
  orderOverridable: boolean;
}

/** The policy a unit's or a person's form opens on: the row standing for them as it is, own or inherited — where
 * none stands at all, the contract's own opening: every payable source, in that order. The platform's form opens on
 * what its row leaves to a person as well; another's leaves nothing. */
export function policyDraft(policy: SupplyPolicy | null, overrides: { overridable: SupplySource[]; orderOverridable: boolean } = { overridable: [], orderOverridable: false }): PolicyDraft {
  return {
    allowed: policy === null ? ["personal", "global", "org_credits", "personal_credits"] : [...policy.allowed],
    order: policy === null ? ["personal", "global", "org_credits", "personal_credits", "stop"] : [...policy.order],
    memberCreditCredits: policy?.memberCreditCredits ?? null,
    overridable: [...overrides.overridable],
    orderOverridable: overrides.orderOverridable
  };
}

/** Every source the form holds a row for, in the order it stands: the allowed first, each where the draft's own
 * order puts it, the closed after them in that order too, and `stop` last whatever the draft says. */
export function draftRows(draft: Pick<PolicyDraft, "allowed" | "order">): SupplySource[] {
  const named = POLICY_SOURCES.map((one) => one.value);
  const inDraft = (order: readonly SupplySource[]): SupplySource[] => named.filter((one) => order.includes(one));
  const rest = named.filter((one) => !draft.order.includes(one));
  const open = new Set(draft.allowed);

  return [
    ...inDraft(draft.order).filter((one) => open.has(one)),
    ...inDraft(draft.order).filter((one) => !open.has(one)),
    ...rest.filter((one) => open.has(one)),
    ...rest.filter((one) => !open.has(one)),
    "stop"
  ];
}

// The units a supply tab may stand for, read once where a screen needs to know whether to stand one at all
// (docs/web.md, 「Organisation」, the supply tab): the companies the account service's roster read gives the reader —
// every one for the administrator, the companies whose own unit they head for anyone else, none for the rest. The
// service judges each read and write of a unit on its own; a unit this list names none for is refused, and its
// reason is said where the read was to stand. A read that failed is no units: the tab a refused read opens would
// only say its reason again.
export function useSupplyUnits(): ComputedRef<SupplyUnit[]> {
  const { data, status } = useFetch<SupplyUnit[]>("/api/supply/units", { key: "supply-units", lazy: true, server: false, default: () => [] });

  // The units last answered stand while a tab that reads them asks them again as it opens, so the organisations the
  // screen lists, and the tab standing, never fall away for the length of that read; a read that failed holds none.
  return computed(() => (status.value === "error" ? [] : (data.value ?? [])));
}

// Whether the reader may open a supply tab somewhere, and whether the read that says so has answered: known once it
// has, in either direction, and the answer stands — a tab that reads the units itself asks them again as it opens,
// and that read must not make the reader unknown and take the tab away.
export interface SupplyReaderStanding {
  opens: boolean;
  known: boolean;
}

export function useSupplyReader(): ComputedRef<SupplyReaderStanding> {
  const { status } = useFetch<SupplyUnit[]>("/api/supply/units", { key: "supply-units", lazy: true, server: false, default: () => [] });
  const units = useSupplyUnits();
  const answered = ref(false);

  watch(
    status,
    (now) => {
      if (now === "success" || now === "error") answered.value = true;
    },
    { immediate: true }
  );

  return computed(() => ({ opens: units.value.length > 0, known: answered.value }));
}

/** A plan's period, in the console's words where they are known; another stands as the service wrote it. */
export function periodLabel(t: Translate, period: string): string {
  const keys: Record<string, string> = { day: "supply.label.period_day", week: "supply.label.period_week", month: "supply.label.period_month", quarter: "supply.label.period_quarter", year: "supply.label.period_year" };
  const key = keys[period];

  return key === undefined ? period : t(key);
}

/** A unit named for a picker: its own name with the names above it, the path the reader's list can see. */
export function unitPathLabel(units: readonly SupplyUnit[], unit: SupplyUnit): string {
  const byId = new Map(units.map((one) => [one.id, one]));
  const names = [unit.name];
  let at = unit.parent === null ? undefined : byId.get(unit.parent);
  let guard = 0;

  while (at !== undefined && guard < 20 && !names.includes(at.name)) {
    names.unshift(at.name);
    at = at.parent === null || at.parent === undefined ? undefined : byId.get(at.parent);
    guard += 1;
  }

  return names.join(" › ");
}

// The settings' supply order (docs/web.md, 「Settings」, the supply section): every source the reader's order may fall
// through, each standing as the view says it does.

/** One row of the reader's order: a source, and how it stands. `live` rows are the order the reader shapes, on or
 * off; a locked one stands on or off as the platform holds it, its switch disabled; `stop` closes the order; a
 * `closed` row is one a layer below the platform closes, with its reason, greyed under them all. `allowed` says
 * whether the layers above the reader leave it to them at all — a source the platform locks off is not. */
export interface OrderRow {
  source: SpentSource;
  kind: "live" | "stop" | "closed";
  on: boolean;
  locked: boolean;
  allowed: boolean;
  // The reader's own choice of it, where they made one.
  own: "on" | "off" | null;
  reason: SupplyReason | null;
}

/** The reader's order as its rows stand: the resolved order first, then the sources out of it the reader or the
 * platform's default leaves off — a locked one among them where the platform holds it off — then `stop`, then the
 * sources a later layer closed. The organisation's own supply stands only where the platform offers it to the reader's
 * company: in the order while it stands open, locked, and among the closed rows where a unit or the allowance closes
 * it. */
export function orderRows(me: Pick<SupplyMe, "order" | "sources">): OrderRow[] {
  const states = me.sources.filter((one) => one.source !== "stop" && !(one.source === "organisation" && !one.allowed && one.reason === "blocked-by-administrator"));
  const stateOf = (source: SpentSource) => states.find((one) => one.source === source);
  // A source closed with no reason of a later layer's is one the platform holds off for everyone.
  const closedByLayer = (source: SpentSource) => {
    const one = stateOf(source);

    return one !== undefined && !one.allowed && one.reason !== undefined;
  };
  const open = me.order.filter((one) => one !== "stop" && !closedByLayer(one));
  const off = states.filter((one) => !open.includes(one.source) && !closedByLayer(one.source)).map((one) => one.source);
  const ownOf = (source: SpentSource) => stateOf(source)?.own ?? null;
  const live = (source: SpentSource, on: boolean): OrderRow => ({ source, kind: "live", on, locked: stateOf(source)?.locked === true, allowed: stateOf(source)?.allowed === true, own: ownOf(source), reason: null });

  return [
    ...open.map((one) => live(one, true)),
    ...off.map((one) => live(one, false)),
    { source: "stop", kind: "stop", on: true, locked: false, allowed: true, own: null, reason: null },
    ...states.filter((one) => closedByLayer(one.source)).map((one): OrderRow => ({ source: one.source, kind: "closed", on: false, locked: one.locked, allowed: false, own: one.own ?? null, reason: one.reason ?? null }))
  ];
}

/** The reader's whole setting as its rows stand, with one change laid over it, as the account service takes it
 * (docs/boundary.md, 「Supply」; docs/accounts.md, 「How an order is resolved」): the order of every source the layers
 * above leave to them, each once and `stop` left for the service to append; and every choice they hold, on or off —
 * the one just switched among them — so a source they never chose keeps following the platform's default. The
 * service writes the choices whole, so a choice of a source a layer above closes, or one the platform locks, is sent
 * back as it stands: the service passes a choice already held, and leaving it out would erase it. Only a source the
 * reader may switch takes the change. */
export function meSetting(rows: readonly OrderRow[], cap: number | null, change: { order?: SpentSource[]; source?: SpentSource; on?: boolean; cap?: number | null } = {}): SupplyMeSetting {
  // The organisation's own supply is placed by the service and named in no write.
  const named = (source: SpentSource): source is SupplySource => source !== "organisation";
  const open = new Set(rows.filter((one) => one.kind === "live" && one.allowed).map((one) => one.source));
  const switchable = (row: OrderRow) => open.has(row.source) && !row.locked;
  const choiceOf = (row: OrderRow): "on" | "off" | null => (row.source === change.source && change.on !== undefined && switchable(row) ? (change.on ? "on" : "off") : row.own);
  const held = rows.filter((one) => one.kind !== "stop" && named(one.source));

  return {
    order: (change.order ?? rows.filter((one) => one.kind === "live").map((one) => one.source)).filter((one) => open.has(one)).filter(named),
    off: held.filter((one) => choiceOf(one) === "off").map((one) => one.source).filter(named),
    on: held.filter((one) => choiceOf(one) === "on").map((one) => one.source).filter(named),
    personalCreditCredits: change.cap === undefined ? cap : change.cap
  };
}

/** A source of the order moved one place among the live rows, the order the write then carries. */
export function movedSourceOrder(rows: readonly OrderRow[], from: number, to: number): SpentSource[] {
  const order = rows.filter((one) => one.kind === "live").map((one) => one.source);
  const [moved] = order.splice(from, 1);

  if (moved === undefined || to < 0 || to > order.length) return rows.filter((one) => one.kind === "live").map((one) => one.source);
  order.splice(to, 0, moved);

  return order;
}

// Whose a piece of supply is (docs/web.md, 「Administration」, the providers tab): the platform's, or one person's.

/** The person a gateway road belongs to: the one account every member of the road names, where every one names the
 * same; none where the road is the platform's, mixed, or has no member. */
export function roadOwner(members: readonly GatewayMember[], road: string): string | null {
  const accounts = members.filter((one) => one.road === road).map((one) => one.account);

  if (accounts.length === 0 || accounts.some((one) => one === null)) return null;

  return accounts.every((one) => one === accounts[0]) ? accounts[0]! : null;
}

/** The words a row says whose it is: the platform's, or one person's with the name the person's account goes by after a
 * middle dot. An owner is read by its number whichever way a unit wrote it, text or a number. */
export function ownerText(t: Translate, owner: string | number | null | undefined, names: ReadonlyMap<string, string>): string {
  const name = accountName(t, names, owner === null || owner === undefined ? null : String(owner));

  return name === null ? t("supply.label.owner_shared") : t("supply.label.owner_personal", { name });
}

// An organisation's plans (docs/web.md, 「Organisation」, the plans tab): the one it runs on and those it is shown.

/** The choice of none among a dialog's plans, since a choice's value is never empty. */
export const NO_PLAN = "none";

/** The dialog's choice the plan applied stands as: its id, or none. */
export function planChoice(applied: Pick<SupplyAppliedPlan, "plan"> | null): string {
  return applied === null ? NO_PLAN : String(applied.plan);
}

/** The plan applied as a plan row shows it, read off the answer itself, whatever its exposure. */
export function appliedPlanEntry(applied: SupplyAppliedPlan): SupplyPlanEntry {
  return { id: applied.plan, name: applied.name, price: applied.price, scope: applied.scope === "personal" ? "personal" : "organisation", period: applied.period, includedCredits: applied.includedCredits, creditsUsable: applied.creditsUsable };
}

/** The plans an apply dialog lists after none: the plan applied first where it is shown no longer, so the dialog opens
 * on a choice it holds, then the plans shown. */
export function applyChoices(plans: Pick<SupplyOrgPlans, "exposed" | "applied">): SupplyPlanEntry[] {
  const applied = plans.applied;

  return applied === null || plans.exposed.some((one) => one.id === applied.plan) ? [...plans.exposed] : [appliedPlanEntry(applied), ...plans.exposed];
}

/** How long the plan applied has run and runs on: the day it was applied to the day its period ends. */
export function planTermText(t: Translate, applied: Pick<SupplyAppliedPlan, "since" | "periodEnd">): string {
  return t("supply.label.plan_term_line", { since: dayKey(toUnixSeconds(applied.since)), end: dayKey(toUnixSeconds(applied.periodEnd)) });
}

/** The plans an organisation is shown once one plan's switch is thrown, the rest as they stand, in the list's order. */
export function withExposure(catalogue: readonly Pick<SupplyCataloguePlan, "id" | "exposed">[], plan: number, on: boolean): number[] {
  return catalogue.filter((one) => (one.id === plan ? on : one.exposed)).map((one) => one.id);
}
