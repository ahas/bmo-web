import { countText } from "./numbers";

import type { PersonalSupplyKey, SupplyPolicy, SupplyReason, SupplySource, SupplyUnit } from "#shared/supply";
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

/** The word a source is shown by, whole from the pack. */
export function sourceLabel(t: Translate, source: SupplySource): string {
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

// What one's own Claude login can do now, in the pack's word: a login that has ended needs a person, one the
// windows have filled needs waiting, an off one is only switched back on, and the rest go out.
export function loginStatus(t: Translate, account: ClaudeAccountView, nowSeconds: number): { label: string; tone: string; icon: string } {
  if (!account.enabled) {
    return { label: t("supply.label.login_off"), tone: "text-muted", icon: "i-material-symbols-block-outline" };
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

/** The policy a form opened with, as whole values, so a save writes it as one. */
export interface PolicyDraft {
  allowed: SupplySource[];
  order: SupplySource[];
  memberCreditCredits: number | null;
}

/** The policy a unit's or a person's form opens on: the row standing for them as it is, own or inherited — where
 * none stands at all, the contract's own opening: every payable source, in that order. */
export function policyDraft(policy: SupplyPolicy | null): PolicyDraft {
  return {
    allowed: policy === null ? ["personal", "global", "org_credits", "personal_credits"] : [...policy.allowed],
    order: policy === null ? ["personal", "global", "org_credits", "personal_credits", "stop"] : [...policy.order],
    memberCreditCredits: policy?.memberCreditCredits ?? null
  };
}

/** Every source the form holds a row for, in the order it stands: the allowed first, each where the draft's own
 * order puts it, the closed after them in that order too, and `stop` last whatever the draft says. */
export function draftRows(draft: PolicyDraft): SupplySource[] {
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

  return computed(() => (status.value === "success" ? (data.value ?? []) : []));
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
