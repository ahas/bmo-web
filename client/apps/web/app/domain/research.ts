import type { FallbackProfile } from "#shared/types";
import type { Translate } from "#shared/wording";

// What the agent-management screen says about the searchers: which work keys are theirs and the names
// they stand under (docs/web.md, 「Agent management screen」).

// The run lines a research goes out on, as the agency names them.
const RESEARCH_LINES: readonly string[] = ["search", "browse"];

// Each research key's name, by the key of the words it is said in.
export const PROFILE_LABELS: Record<string, string> = {
  "search:basic": "research.label.profile_search_basic",
  "search:thorough": "research.label.profile_search_thorough",
  "search:exhaustive": "research.label.profile_search_exhaustive",
  browse: "research.label.profile_browse"
};

// A research key this screen has no words for stands under the key the agency gave it.
export function profileLabel(t: Translate, key: string): string {
  const label = PROFILE_LABELS[key];

  return label === undefined ? key : t(label);
}

// The line a key no profile declares goes out on, read off its name the way the agency reads it.
function lineByName(key: string): string | null {
  if (key === "browse") return "browse";
  if (key.startsWith("search")) return "search";

  return null;
}

function onResearchLine(line: string | null): boolean {
  return line !== null && RESEARCH_LINES.includes(line);
}

/** The searchers' work keys: every profile on a research line, then every assigned key no profile declares that goes out on one. */
export function researchKeys(profiles: readonly Pick<FallbackProfile, "key" | "line">[], assignments: readonly { key: string }[]): string[] {
  const keys = profiles.filter((profile) => onResearchLine(profile.line)).map((profile) => profile.key);

  for (const { key } of assignments) {
    if (!keys.includes(key) && !profiles.some((profile) => profile.key === key) && onResearchLine(lineByName(key))) keys.push(key);
  }

  return keys;
}

// The fetch strategies the research unit holds a research run to, in the order the choice offers them, each by the
// key of the words it is said in (bmo-research's `docs/runner.md`, 「What a run is held to: the research settings」).
export const STRATEGY_LABELS: Record<string, string> = {
  "direct-then-browser": "research.label.strategy_direct_then_browser",
  "browser-first": "research.label.strategy_browser_first",
  "direct-only": "research.label.strategy_direct_only"
};

/** A strategy's words; one this screen has no words for stands as a sentence naming it. */
export function strategyLabel(t: Translate, strategy: string): string {
  const label = STRATEGY_LABELS[strategy];

  return label === undefined ? t("research.label.unknown_value", { value: strategy }) : t(label);
}

/** A gap between two requests, in milliseconds, or the web tools' own where none is set. */
export function gapText(t: Translate, ms: number | null): string {
  return ms === null ? t("research.label.default") : t("research.label.gap_value", { n: ms.toLocaleString("ko-KR") });
}

/** What a gap's box holds once saved: an emptied box sets the gap back to the web tools' own. */
export function gapOf(text: string): number | null {
  const trimmed = text.trim();

  return trimmed === "" ? null : Number(trimmed);
}

// How a search engine's state stands: its mark, its tone and its words.
export interface EngineLook {
  icon: string;
  tone: string;
  label: string;
}

const ENGINE_LOOKS: Record<string, Omit<EngineLook, "label"> & { key: string }> = {
  healthy: { icon: "i-material-symbols-check-circle-outline", tone: "text-success", key: "research.label.state_healthy" },
  degraded: { icon: "i-material-symbols-warning-outline", tone: "text-warning", key: "research.label.state_degraded" },
  suspended: { icon: "i-material-symbols-pause-circle-outline", tone: "text-error", key: "research.label.state_suspended" }
};

export function engineLook(t: Translate, state: string): EngineLook {
  const look = ENGINE_LOOKS[state];

  return look === undefined
    ? { icon: "i-material-symbols-help-outline", tone: "text-muted", label: t("research.label.unknown_value", { value: state }) }
    : { icon: look.icon, tone: look.tone, label: t(look.key) };
}
