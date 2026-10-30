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

// What the research screen says about the research unit's state, its queue and a run (docs/web.md, 「Research
// screen」). Every state, shape and kind is the unit's own word, and one this screen has no words for stands as a
// sentence naming it.

/** A word the unit names, said by the pack's key the table holds for it. */
function said(t: Translate, table: Readonly<Record<string, string>>, value: string): string {
  const label = table[value];

  return label === undefined ? t("research.label.unknown_value", { value }) : t(label);
}

// A chip's colour, as Nuxt UI names its colours.
export type ChipColor = "neutral" | "primary" | "info" | "success" | "warning" | "error";

export interface ChipLook {
  label: string;
  color: ChipColor;
}

// An item's states, in the order the state choice offers them.
export const ITEM_STATES: readonly string[] = ["waiting", "running", "reported", "fit", "failed", "taken", "dismissed"];

const ITEM_STATE_LOOKS: Record<string, { key: string; color: ChipColor }> = {
  waiting: { key: "research.label.item_state_waiting", color: "neutral" },
  running: { key: "research.label.item_state_running", color: "info" },
  reported: { key: "research.label.item_state_reported", color: "success" },
  fit: { key: "research.label.item_state_fit", color: "primary" },
  failed: { key: "research.label.item_state_failed", color: "error" },
  taken: { key: "research.label.item_state_taken", color: "success" },
  dismissed: { key: "research.label.item_state_dismissed", color: "neutral" }
};

export function itemStateLook(t: Translate, state: string): ChipLook {
  const look = ITEM_STATE_LOOKS[state];

  return look === undefined ? { label: t("research.label.unknown_value", { value: state }), color: "neutral" } : { label: t(look.key), color: look.color };
}

/** Whether the unit still dismisses an item: in every state but taken and dismissed. */
export function dismissible(state: string): boolean {
  return state !== "taken" && state !== "dismissed";
}

const SHAPE_LABELS: Record<string, string> = {
  manual: "research.label.shape_manual",
  investigation: "research.label.shape_investigation",
  advisory: "research.label.shape_advisory",
  brief: "research.label.shape_brief",
  "manual-or-investigation": "research.label.shape_manual_or_investigation"
};

/** An item's or a category's shape. */
export function shapeLabel(t: Translate, shape: string): string {
  return said(t, SHAPE_LABELS, shape);
}

const CATEGORY_STATE_LOOKS: Record<string, { key: string; color: ChipColor }> = {
  running: { key: "research.label.state_running", color: "success" },
  stopped: { key: "research.label.state_stopped", color: "neutral" }
};

export function categoryStateLook(t: Translate, state: string): ChipLook {
  const look = CATEGORY_STATE_LOOKS[state];

  return look === undefined ? { label: t("research.label.unknown_value", { value: state }), color: "neutral" } : { label: t(look.key), color: look.color };
}

const LANGUAGE_LABELS: Record<string, string> = {
  ko: "research.label.language_ko",
  en: "research.label.language_en"
};

/** A language a document's page holds; one this screen has no word for stands as the code the unit gave. */
export function languageLabel(t: Translate, language: string): string {
  const label = LANGUAGE_LABELS[language];

  return label === undefined ? language : t(label);
}

const LOG_KIND_LOOKS: Record<string, { key: string; color: ChipColor }> = {
  asked: { key: "research.label.log_kind_asked", color: "neutral" },
  seated: { key: "research.label.log_kind_seated", color: "neutral" },
  answer: { key: "research.label.log_kind_answer", color: "primary" },
  round: { key: "research.label.log_kind_round", color: "primary" },
  branch: { key: "research.label.log_kind_branch", color: "info" },
  filed: { key: "research.label.log_kind_filed", color: "success" },
  told: { key: "research.label.log_kind_told", color: "success" },
  ended: { key: "research.label.log_kind_ended", color: "warning" }
};

export function logKindLook(t: Translate, kind: string): ChipLook {
  const look = LOG_KIND_LOOKS[kind];

  return look === undefined ? { label: t("research.label.unknown_value", { value: kind }), color: "neutral" } : { label: t(look.key), color: look.color };
}

const RUN_STATE_LABELS: Record<string, string> = {
  waiting: "research.label.run_state_waiting",
  running: "research.label.run_state_running",
  closed: "research.label.run_state_closed"
};

export function runStateLabel(t: Translate, state: string): string {
  return said(t, RUN_STATE_LABELS, state);
}

const OUTCOME_LABELS: Record<string, string> = {
  answered: "research.label.outcome_answered",
  failed: "research.label.outcome_failed",
  cut: "research.label.outcome_cut"
};

export function outcomeLabel(t: Translate, outcome: string): string {
  return said(t, OUTCOME_LABELS, outcome);
}

/** Whether a run may still move, so its sheet asks again on its clock: every state but closed. */
export function runOpen(state: string): boolean {
  return state !== "closed";
}

/** A hold's reason in words: a bench on its node, or the wait on the model's health. */
export function holdReasonText(t: Translate, hold: { reason: string; nodeName: string | null }): string {
  if (hold.reason === "bench") return t("research.label.hold_bench", { node: hold.nodeName ?? "—" });
  if (hold.reason === "restore") return t("research.label.hold_restore");

  return t("research.label.unknown_value", { value: hold.reason });
}

/** The holds that name a category. */
export function holdsOf<T extends { categoryNames: readonly string[] }>(holds: readonly T[], categoryName: string): T[] {
  return holds.filter((hold) => hold.categoryNames.includes(categoryName));
}

/** A category's road: its provider and model, or the settings' road where it names none. */
export function roadText(t: Translate, category: { provider: string | null; model: string | null }): string {
  const parts = [category.provider, category.model].filter((part): part is string => part !== null && part !== "");

  return parts.length === 0 ? t("research.label.default_road") : parts.join(" · ");
}

/** What an item's maker link reads as: the maker, else the address's host, else the address as it stands. */
export function makerText(item: { maker: string | null; address: string | null }): string | null {
  if (item.maker !== null && item.maker !== "") return item.maker;
  if (item.address === null) return null;

  try {
    return new URL(item.address).host;
  } catch {
    return item.address;
  }
}

/** An address a link may open: an http or https one alone. */
export function openableAddress(address: string | null): string | null {
  if (address === null) return null;

  try {
    const url = new URL(address);

    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

/** The items read, newest first by when each was made, and by id among those made at once. */
export function newestFirst<T extends { id: number; createdAt: number }>(items: readonly T[]): T[] {
  return [...items].sort((one, other) => other.createdAt - one.createdAt || other.id - one.id);
}

/** Pages read one after the other, an item read again standing once, as its latest page has it. */
export function mergedPages<T extends { id: number }>(pages: readonly (readonly T[])[]): T[] {
  const byId = new Map<number, T>();

  for (const page of pages) {
    for (const item of page) byId.set(item.id, item);
  }

  return [...byId.values()];
}

// The kinds of source the research unit reads, in the order the kind choice offers them (bmo-research's
// `docs/sources.md`, 「The kinds」).
export const SOURCE_KIND_LABELS: Record<string, string> = {
  "huggingface-trending": "research.label.kind_huggingface_trending",
  "huggingface-search": "research.label.kind_huggingface_search",
  arxiv: "research.label.kind_arxiv",
  "github-releases": "research.label.kind_github_releases",
  rss: "research.label.kind_rss"
};

export function sourceKindLabel(t: Translate, kind: string): string {
  return said(t, SOURCE_KIND_LABELS, kind);
}

/** A list of words as a box holds it, comma-separated, and back. */
export function wordsText(words: readonly string[]): string {
  return words.join(", ");
}

export function wordsOf(text: string): string[] {
  return text.split(",").map((word) => word.trim()).filter((word) => word !== "");
}

/** How often a source is read: its own cadence, or its category's where it names none. */
export function everyText(t: Translate, everyMinutes: number | null, cadenceMinutes: number | null): string {
  if (everyMinutes !== null) return t("research.label.every_value", { n: everyMinutes.toLocaleString("ko-KR") });

  return cadenceMinutes === null ? "—" : t("research.label.every_category", { n: cadenceMinutes.toLocaleString("ko-KR") });
}
