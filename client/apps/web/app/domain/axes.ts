import { ref } from "vue";
import { failureText } from "bmo-ui/app/domain/errors";
import { shortModel } from "#shared/model-short";

import type { ProviderModelsView, ProviderView, RoadView, RoleSessions, SupportCount } from "#shared/axes";
import type { Translate } from "#shared/wording";
import type { Ref } from "vue";

// The agent management screen's two axes and its places (docs/web.md, 「Agent management screen」): what a road reads
// as, how a share or a threshold is written, and the agency's defaults — those its
// documents state, and those its providers and models declare, read as its routes answer them (docs/web.md, 「The
// default among choices」).

// A role's sessions where it names none (the agency's `docs/api.md`, 「roles」).
export const DEFAULT_ROLE_SESSIONS: RoleSessions = "keep";
// A repository's downgrade heal unless the owner turns it off (the agency's `docs/repositories.md`).
export const DEFAULT_DOWNGRADE_HEAL = true;
// A repository's support count unless the owner fixes one, and the most it may fix (the agency's
// `docs/repositories.md`).
export const DEFAULT_SUPPORT_COUNT: SupportCount = "auto";
export const SUPPORT_COUNT_MOST = 8;

// The one effort scale a road names a level on, lowest first (the agency's `docs/provider-order.md`, 「Effort and
// thinking」).
export const EFFORT_LEVELS = ["low", "medium", "high", "xhigh", "max"] as const;

// The line a supervisor's program carries; a role names its own (the agency's `docs/provider-order.md`).
export const SUPERVISOR_LINE = "chat";
// The line a job's run goes out on: a repository's pin and a work order's builder model are chosen among the providers
// carrying it.
export const JOB_LINE = "worker";

// The fields of a road a form holds, by the names a refusal carries them under.
export const ROAD_FIELDS: ReadonlySet<string> = new Set(["provider", "model", "effort", "thinking", "answerTokens", "advisor"]);

/** A road that names no provider yet, as a form opens on one. */
export function emptyRoad(): RoadView {
  return { provider: "", model: "", effort: null, thinking: null, answerTokens: null, advisor: null };
}

// The choice that names no advisor. A select takes no empty value, and no family word or model id begins with a colon.
export const ADVISOR_NONE = ":none";

export interface AdvisorChoice {
  label: string;
  value: string;
  description?: string;
}

/** The advisors a road may name on its provider, in groups: none, the family words the provider declares, and the
 * models its catalogue holds, the superseded generations marked, an advisor the road names that neither carries
 * standing as its own choice. No group where the provider takes no advisor; which advisor may advise which model is
 * the agency's to judge. */
export function advisorChoices(t: Translate, provider: ProviderView | undefined, models: ProviderModelsView | null, advisor: string | null): AdvisorChoice[][] {
  if (provider?.takesAdvisor !== true) return [];

  const words = provider.advisorWords.map((word) => ({ label: word, value: word }));
  const held: AdvisorChoice[] = (models?.models ?? []).map((one) => ({ label: one.id, value: one.id, ...(one.inService === false ? { description: t("agents.label.model_superseded") } : {}) }));
  const named = advisor === null || [...words, ...held].some((one) => one.value === advisor);

  // Naming none is every road's own advisor until one is set, so it is the value marked as the default.
  return [[{ label: markedDefault(t, t("agents.label.switch_off"), true), value: ADVISOR_NONE }], words, named ? held : [{ label: advisor, value: advisor }, ...held]].filter((group) => group.length > 0);
}

/** An advisor as its select holds it, and the one a choice names. */
export function advisorShown(advisor: string | null): string {
  return advisor ?? ADVISOR_NONE;
}

export function advisorPicked(value: string): string | null {
  return value === ADVISOR_NONE ? null : value;
}

/** The line a road whose provider takes no advisor stands with: the providers that declare one, by their words; empty
 * while none does or the providers have not been read. */
export function advisorElsewhere(t: Translate, providers: readonly ProviderView[] | null | undefined): string {
  const taking = (providers ?? []).filter((one) => one.takesAdvisor).map((one) => one.label);

  return taking.length === 0 ? "" : t("agents.message.advisor_only_on", { providers: taking.join(", ") });
}

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

/** The compaction threshold a row stands on where it sets none: the declared one of its road's provider, or none where
 * it names no road, or that provider has not been read or declares none. */
export function defaultThreshold(providers: readonly ProviderView[] | null | undefined, provider: string | null): number | null {
  return provider === null ? null : (providers?.find((one) => one.name === provider)?.foldRatioDefault ?? null);
}

/** Whether a whole percent is the row's default threshold. */
export function isDefaultThreshold(percent: number | null, fallback: number | null): boolean {
  return percent !== null && fallback !== null && percent === percentOf(fallback);
}

/** A compaction threshold as a whole percent, marked as the default where it is its road's provider's declared one. */
export function thresholdText(t: Translate, threshold: number, fallback: number | null): string {
  return markedDefault(t, `${percentOf(threshold)}%`, isDefaultThreshold(percentOf(threshold), fallback));
}

/** The thinking default the model a road names declares, from its provider's catalogue; none where it declares none
 * or the catalogue has not been read. */
export function thinkingDefault(models: ProviderModelsView | null, model: string): boolean | null {
  return models?.models.find((one) => one.id === model)?.thinking ?? null;
}

/** The answer ceiling the model a road names declares; none where it declares none. */
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

/** A road on one line: its provider's word, its model whole and its effort; none where it names no provider. */
export function roadText(providers: readonly ProviderView[] | null | undefined, road: { provider: string | null; model: string | null; effort: string | null }): string | null {
  if (road.provider === null) return null;

  return [providerWord(providers, road.provider), road.model, road.effort].filter((part) => part !== null && part !== "").join(" · ");
}

/** The levels a road may name for a model: those its catalogue entry names, every level where it names none, and none
 * on the registry's provider, whose registrations take no level. */
export function effortChoices(provider: ProviderView | undefined, models: ProviderModelsView | null, model: string): string[] {
  if (provider?.registered === true) return [];

  const named = models?.models.find((one) => one.id === model)?.efforts ?? [];

  return named.length === 0 ? [...EFFORT_LEVELS] : named;
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
