import { failureText } from "bmo-ui/app/domain/errors";
import { shortModel } from "#shared/model-short";

import type { OrderEntryView, ProviderModelsView, ProviderView, QuotaView, RoleSessions } from "#shared/axes";
import type { Translate } from "#shared/wording";
import type { Ref } from "vue";

// The agent management screen's two axes and its places (docs/web.md, 「Agent management screen」): what a supervisor's
// or a role's provider order reads as, how a share or a threshold is written, and the agency's defaults — those its
// documents state, and those its providers and models declare, read as its routes answer them (docs/web.md, 「The
// default among choices」).

// The agency's quota share where a row sets none (the agency's `docs/provider-order.md`, 「What an order is」).
export const DEFAULT_QUOTA_SHARE = 0.01;
// A role's sessions where it names none (the agency's `docs/api.md`, 「roles」).
export const DEFAULT_ROLE_SESSIONS: RoleSessions = "keep";
// A repository's downgrade heal unless the owner turns it off (the agency's `docs/repositories.md`).
export const DEFAULT_DOWNGRADE_HEAL = true;

// The one effort scale an entry names a level on, lowest first (the agency's `docs/provider-order.md`, 「Effort and
// thinking」).
export const EFFORT_LEVELS = ["low", "medium", "high", "xhigh", "max"] as const;

// The line a supervisor's program carries; a role names its own (the agency's `docs/provider-order.md`).
export const SUPERVISOR_LINE = "chat";

/** A fraction from 0 to 1 as a whole percent. */
export function percentOf(fraction: number): number {
  return Math.round(fraction * 100);
}

/** A whole percent as the fraction the agency keeps. */
export function fractionOf(percent: number): number {
  return Math.round(percent) / 100;
}

/** A value with the pack's mark after it where it is the default the agency's documents state. */
export function markedDefault(t: Translate, text: string, isDefault: boolean): string {
  return isDefault ? t("agents.label.default_marked", { value: text }) : text;
}

/** A quota share as a cell and a box read it: a whole percent, marked as the default at the agency's own. */
export function shareText(t: Translate, share: number): string {
  return markedDefault(t, `${percentOf(share)}%`, percentOf(share) === percentOf(DEFAULT_QUOTA_SHARE));
}

/** The compaction threshold a row is given where its add names none: the declared one of the first provider of its
 * order, or none where that provider has not been read or declares none. */
export function defaultThreshold(providers: readonly ProviderView[] | null | undefined, order: readonly OrderEntryView[]): number | null {
  const first = order[0]?.provider;

  return first === undefined ? null : (providers?.find((one) => one.name === first)?.foldRatioDefault ?? null);
}

/** Whether a whole percent is the row's default threshold. */
export function isDefaultThreshold(percent: number | null, fallback: number | null): boolean {
  return percent !== null && fallback !== null && percent === percentOf(fallback);
}

/** A compaction threshold as a whole percent, marked as the default where it is the first provider's declared one. */
export function thresholdText(t: Translate, threshold: number, fallback: number | null): string {
  return markedDefault(t, `${percentOf(threshold)}%`, isDefaultThreshold(percentOf(threshold), fallback));
}

/** The thinking default the model an entry names declares, from its provider's catalogue; none where it declares none
 * or the catalogue has not been read. */
export function thinkingDefault(models: ProviderModelsView | null, model: string): boolean | null {
  return models?.models.find((one) => one.id === model)?.thinking ?? null;
}

/** The answer ceiling the model an entry names declares; none where it declares none. */
export function ceilingDefault(models: ProviderModelsView | null, model: string): number | null {
  return models?.models.find((one) => one.id === model)?.answerTokens ?? null;
}

/** A role's sessions in the pack's words, keep marked as the default. */
export function sessionsText(t: Translate, sessions: string): string {
  const word = sessions === "keep" ? t("agents.label.sessions_keep") : sessions === "fresh" ? t("agents.label.sessions_fresh") : sessions;

  return markedDefault(t, word, sessions === DEFAULT_ROLE_SESSIONS);
}

/** A model's short name on a provider, without the provider's own letters, which the provider's word says already. */
export function shortOnProvider(provider: string, model: string): string {
  const short = shortModel(`${provider}/${model}`);
  const at = short.indexOf("/");

  return at === -1 ? short : short.slice(at + 1);
}

/** The pack's word a provider stands under, from the providers' read, or its own name where it has not landed. */
export function providerWord(providers: readonly ProviderView[] | null | undefined, name: string): string {
  return providers?.find((one) => one.name === name)?.label ?? name;
}

/** One entry of an order on a line: the provider's word, its model named short and its effort. */
export function entryText(providers: readonly ProviderView[] | null | undefined, entry: OrderEntryView): string {
  return [providerWord(providers, entry.provider), shortOnProvider(entry.provider, entry.model), entry.effort].filter((part) => part !== null && part !== "").join(" ");
}

/** The levels an entry may name for a model: those its catalogue entry names, every level where it names none, and none
 * on the registry's provider, whose registrations take no level. */
export function effortChoices(provider: ProviderView | undefined, models: ProviderModelsView | null, model: string): string[] {
  if (provider?.registered === true) return [];

  const named = models?.models.find((one) => one.id === model)?.efforts ?? [];

  return named.length === 0 ? [...EFFORT_LEVELS] : named;
}

/** What a provider has left, in words: the share left and the window that counted, or a balance; empty where it reports
 * none. */
export function quotaText(t: Translate, quota: QuotaView | null): string {
  if (quota === null) return "";
  if (quota.left !== null) {
    const share = `${percentOf(quota.left)}%`;

    return quota.window === null ? t("agents.label.quota_left", { share }) : t("agents.label.quota_left_window", { share, window: quota.window });
  }

  if (quota.balance !== null) return t("agents.label.quota_balance", { amount: quota.balance.toLocaleString("ko-KR") });

  return "";
}

/** Where in an order's form a refusal stands: the entry whose place the agency's field names, or the form. */
export function orderRefusalEntry(field: string | null): number | null {
  const found = field === null ? null : /\d+/.exec(field);

  return found === null ? null : Number(found[0]);
}

// The models each provider holds, read once a screen asks for them and held while the page stands; a read that failed
// keeps its sentence, and asking again reads again.
export interface ProviderModelsState {
  view: ProviderModelsView | null;
  failure: string | null;
  reading: boolean;
}

const held = new Map<string, Ref<ProviderModelsState>>();

export function useProviderModels(): { stateOf: (provider: string) => Ref<ProviderModelsState>; read: (provider: string, failed: (error: unknown) => string) => Promise<void> } {
  function stateOf(provider: string): Ref<ProviderModelsState> {
    let state = held.get(provider);

    if (state === undefined) {
      state = ref<ProviderModelsState>({ view: null, failure: null, reading: false });
      held.set(provider, state);
    }

    return state;
  }

  async function read(provider: string, failed: (error: unknown) => string): Promise<void> {
    const state = stateOf(provider);

    if (state.value.reading || state.value.view !== null) return;

    state.value = { ...state.value, reading: true, failure: null };

    try {
      state.value = { view: await $fetch<ProviderModelsView>(`/api/provider-models/${encodeURIComponent(provider)}`), failure: null, reading: false };
    } catch (error) {
      state.value = { view: null, failure: failed(error), reading: false };
    }
  }

  return { stateOf, read };
}

/** The providers the agency carries, one read every screen of the agent management shares. */
export function useProviders() {
  return useFetch<ProviderView[]>("/api/providers", { key: "agency-providers", lazy: true, server: false });
}

/** The field a refusal names, as a console route carries it on. */
export function refusedField(error: unknown): string | null {
  const field = (error as { data?: { data?: { field?: unknown } } } | null)?.data?.data?.field;

  return typeof field === "string" ? field : null;
}

/** A refused save as a form shows it: the field the agency named, and the pack's sentence for its code. */
export function refusalOf(t: Translate, error: unknown): { field: string | null; text: string } {
  return { field: refusedField(error), text: failureText(error, t("common.error.save_failed")) };
}
