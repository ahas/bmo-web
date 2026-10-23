import { matchFields } from "bmo-ui/shared/search";
import { agentProviderNames } from "#shared/types";
import { modeLabel } from "./status";

import type { SearchField, SearchMatch } from "bmo-ui/shared/search";
import type { AgentMode, FallbackProfile, FallbackView, KeepaliveView, OfferedProvider } from "#shared/types";
import type { Translate } from "#shared/wording";

// The agent management screen's sections, each a tab of its own (docs/web.md, 「Agent management
// screen」). The tab stands in the address, so a shared link opens the same section.
export const AGENT_TABS = [
  { value: "general", label: "agents.label.tab_general", icon: "i-material-symbols-tune" },
  { value: "supply", label: "agents.label.tab_supply", icon: "i-material-symbols-swap-vert" },
  { value: "agents", label: "agents.label.tab_agents", icon: "i-material-symbols-smart-toy-outline" },
  { value: "workers", label: "agents.label.tab_workers", icon: "i-material-symbols-construction" },
  { value: "tiers", label: "agents.label.tab_tiers", icon: "i-material-symbols-stacks-outline" },
  { value: "routes", label: "agents.label.tab_routes", icon: "i-material-symbols-alt-route" },
  { value: "gates", label: "agents.label.tab_gates", icon: "i-material-symbols-balance" },
  { value: "companions", label: "agents.label.tab_companions", icon: "i-material-symbols-pets" },
  { value: "research", label: "agents.label.tab_research", icon: "i-material-symbols-travel-explore" }
] as const;

export type AgentTab = (typeof AGENT_TABS)[number]["value"];

export function isAgentTab(value: unknown): value is AgentTab {
  return AGENT_TABS.some((tab) => tab.value === value);
}

export function agentTabLabel(t: Translate, tab: AgentTab): string {
  const key = AGENT_TABS.find((one) => one.value === tab)?.label;

  return key === undefined ? tab : t(key);
}

// What the shared fallback and keepalive reads hold before the bot has answered. Every screen that
// reads them under the same key gives the same empty shape, so none of them sees nothing at all.
export function emptyFallbackView(): FallbackView {
  return { active: { provider: "claude-code", account: null, accountName: "", accounts: 0, session: null, week: null }, codexPresent: false, keyPresent: false, services: [], since: null, order: [], orderIsDefault: true, accounts: [], profiles: [] };
}

export function emptyKeepaliveView(): KeepaliveView {
  return { stopped: false };
}

// Every provider the bot carries, in the order every table stands them.
export const PROVIDER_COLUMNS: readonly AgentMode[] = agentProviderNames;

export const AUTO_LABEL = "common.label.auto";

// A settings cell that is pressed: it fills its cell, so the whole cell is what is pressed, and it
// says so on hover and on press.
export const CELL_BUTTON =
  "relative flex min-h-12 w-full min-w-0 flex-col items-start justify-center px-2 py-1 text-start transition-colors hover:bg-elevated active:bg-accented focus-inset disabled:cursor-default disabled:hover:bg-transparent disabled:active:bg-transparent";

// A cell that only shows what the bot worked out.
export const CELL_TEXT = "flex min-h-12 min-w-0 flex-col justify-center px-2 py-1";

// One choice a choice cell offers.
export interface CellChoice {
  value: string | number;
  label: string;
  description?: string;
  disabled?: boolean;
}

// The sizes an own LLM service's answer may be given, and what a blank means.
export const ANSWER_TOKEN_CHOICES = [1024, 2048, 4096, 8192] as const;

// The waits a gate's time limit offers. The bot takes any whole number of seconds from one to three
// hundred; these are the ones worth a tap.
export const GATE_TIMEOUTS = [5_000, 10_000, 15_000, 20_000, 30_000, 45_000, 60_000, 90_000, 120_000, 180_000, 240_000, 300_000] as const;

export function secondsText(t: Translate, ms: number): string {
  return t("common.label.seconds", { n: Math.round(ms / 1000).toLocaleString("ko-KR") });
}

export function tokensText(t: Translate, tokens: number | null | undefined): string {
  return tokens === null || tokens === undefined ? t("common.label.default") : tokens.toLocaleString("ko-KR");
}

// A tier mapping as a table cell reads it: the model, then the effort — or, on a provider whose
// mapping carries an answer ceiling, the answer size and whether it thinks.
export function mappingText(
  t: Translate,
  mapping: { provider: string; model: string; effort: string | null; answerTokens?: number | null } | null | undefined,
  capsAnswerTokens: boolean,
  // Whether a mapping that names no thinking leaves it to the model's own default rather than off.
  thinkingByDefault = false
): { model: string; detail: string } | null {
  if (mapping === null || mapping === undefined) {
    return null;
  }

  if (capsAnswerTokens) {
    const tokens = tokensText(t, mapping.answerTokens);

    return {
      model: mapping.model,
      detail: mapping.effort === "thinking"
        ? t("agents.label.thinking_on", { tokens })
        : mapping.effort === null && thinkingByDefault ? t("agents.label.thinking_default", { tokens }) : t("agents.label.thinking_off", { tokens })
    };
  }

  return { model: mapping.model, detail: mapping.effort ?? t("common.label.no_effort") };
}

export interface RouteModeChoice {
  value: string;
  label: string;
  disabled: boolean;
  // Why a refused provider cannot be chosen, in the bot's own sentence.
  description?: string;
}

// The road a work key stands on, in the words its chooser shows: auto, a provider, or a road only a
// gate is offered, named by the bot's own offer of it.
export function routeModeText(t: Translate, profile: Pick<FallbackProfile, "routeMode" | "offered">): string {
  if (profile.routeMode === "auto") return t(AUTO_LABEL);

  return profile.offered.find((one) => one.name === profile.routeMode)?.label ?? modeLabel(t, profile.routeMode as AgentMode);
}

// What a work key's provider chooser offers: auto, which is a policy and always may be chosen,
// then every provider the bot offered under its own label, a refused one standing disabled with
// its reason under it.
export function routeModeChoices(t: Translate, offered: readonly OfferedProvider[]): RouteModeChoice[] {
  return [
    { value: "auto", label: t(AUTO_LABEL), disabled: false },
    ...offered.map((one) => ({ value: one.name, label: one.label, disabled: one.reason !== null, ...(one.reason === null ? {} : { description: one.reason }) }))
  ];
}

// One place the settings search can land on: the tab it stands in, the row it is, and every text
// the row shows or holds.
export interface SettingsEntry {
  id: string;
  tab: AgentTab;
  label: string;
  fields: readonly SearchField[];
}

export interface SettingsHit {
  entry: SettingsEntry;
  match: SearchMatch;
}

// The entries that match the phrase, in the order the screen stands them.
export function searchSettings(t: Translate, entries: readonly SettingsEntry[], query: string): SettingsHit[] {
  return entries.flatMap((entry) => {
    const match = matchFields([{ label: t("agents.label.search_tab"), text: agentTabLabel(t, entry.tab), shown: true }, ...entry.fields], query);

    return match === null ? [] : [{ entry, match }];
  });
}

// The id a row carries on the screen, so a search result can scroll to it and mark it.
export function settingsAnchor(id: string): string {
  return `setting-${id.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
}
