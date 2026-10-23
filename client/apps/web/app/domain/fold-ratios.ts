import type { FoldRatioSource, FoldRatiosView, FoldRatioView, ModelTier, TierProvider } from "#shared/agency";
import type { Translate } from "#shared/wording";

// What the fold-ratio grid on the tier tab says, and how a percent typed into one of its cells is checked and
// sent (docs/web.md, 「Agent management screen」).

// Each source by the key of the words it is said in.
const SOURCE_LABELS: Record<FoldRatioSource, string> = {
  set: "agents.label.fold_source_set",
  provider: "agents.label.fold_source_provider",
  default: "agents.label.fold_source_default"
};

// A cell takes a whole percent in this range: a ratio above 0 and at most 1, as the agency takes it.
export const FOLD_PERCENT_MIN = 1;
export const FOLD_PERCENT_MAX = 100;

/** The ratio one provider holds at one tier, or null where the grid carries none. */
export function foldRatioAt(view: FoldRatiosView | null | undefined, tier: ModelTier, provider: TierProvider): FoldRatioView | null {
  return view?.ratios.find((one) => one.tier === tier && one.provider === provider) ?? null;
}

/** A ratio as the percent a cell holds, to one decimal place. */
export function foldPercent(ratio: number): number {
  return Math.round(ratio * 1000) / 10;
}

/** A ratio as a cell shows it. */
export function foldPercentText(t: Translate, ratio: number): string {
  return t("agents.label.fold_percent", { percent: foldPercent(ratio).toLocaleString("ko-KR") });
}

/** Where a ratio comes from, in words. */
export function foldSourceText(t: Translate, source: FoldRatioSource): string {
  return t(SOURCE_LABELS[source]);
}

/** Why a typed percent cannot be sent, or null where it can: a whole number from 1 to 100. */
export function foldPercentFault(t: Translate, text: string): string | null {
  const percent = text.trim() === "" ? Number.NaN : Number(text);

  return Number.isInteger(percent) && percent >= FOLD_PERCENT_MIN && percent <= FOLD_PERCENT_MAX
    ? null
    : t("agents.error.fold_percent", { min: FOLD_PERCENT_MIN, max: FOLD_PERCENT_MAX });
}

/** The body that sets one provider's ratio at one tier from the percent typed. */
export function foldRatioChange(provider: TierProvider, tier: ModelTier, text: string): { provider: TierProvider; tier: ModelTier; ratio: number } {
  return { provider, tier, ratio: Number(text) / 100 };
}
