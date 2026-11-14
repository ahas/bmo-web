import { matchFields } from "bmo-ui/shared/search";

import type { SearchField, SearchMatch } from "bmo-ui/shared/search";
import type { FallbackView } from "#shared/types";
import type { Translate } from "#shared/wording";

// The agent management screen's sections, each a tab of its own (docs/web.md, 「Agent management screen」): the two axes
// the agency runs work on, the places it runs it, and the two things a provider order may name of the deployment's
// own. The tab stands in the address, so a shared link opens the same section; the first is the screen's own address.
export const AGENT_TABS = [
  { value: "roles", label: "agents.label.tab_roles", icon: "i-material-symbols-badge-outline" },
  { value: "supervisors", label: "agents.label.tab_supervisors", icon: "i-material-symbols-supervisor-account" },
  { value: "repositories", label: "agents.label.tab_repositories", icon: "i-material-symbols-folder-outline" },
  { value: "models", label: "agents.label.tab_models", icon: "i-material-symbols-model-training" },
  { value: "model-files", label: "agents.label.tab_model_files", icon: "i-material-symbols-deployed-code-outline" }
] as const;

export type AgentTab = (typeof AGENT_TABS)[number]["value"];

export function isAgentTab(value: unknown): value is AgentTab {
  return AGENT_TABS.some((tab) => tab.value === value);
}

export function agentTabLabel(t: Translate, tab: AgentTab): string {
  const key = AGENT_TABS.find((one) => one.value === tab)?.label;

  return key === undefined ? tab : t(key);
}

// What the shared fallback read holds before the agency has answered. Every screen that reads it under the same key
// gives the same empty shape, so none of them sees nothing at all.
export function emptyFallbackView(): FallbackView {
  return { active: { provider: "claude-code", account: null, accountName: "", accounts: 0, session: null, week: null }, codexPresent: false, keyPresent: false, services: [], order: [], orderIsDefault: true, accounts: [], profiles: [] };
}

// A chooser's word for letting the agency pick, as the Claude accounts' choice offers it.
export const AUTO_LABEL = "common.label.auto";

// The cells a settings table is built of, as every screen's settings table names them.
export { CELL_BUTTON, CELL_TEXT } from "./settings-cells";
export type { CellChoice } from "./settings-cells";

// One place the settings search can land on: the tab it stands in, the row it is, and every text the row shows or
// holds.
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
