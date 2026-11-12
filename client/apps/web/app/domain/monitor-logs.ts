import { logFilterFrom, logFilterQuery, SERVICE_CATEGORY } from "#shared/monitor-logs";

import type { LogFilter, LogLevel, LogSources } from "#shared/monitor-logs";
import type { Translate } from "#shared/wording";

// The monitor's logs tab (docs/web.md, 「Monitor's logs tab」): the filter stands in the address beside the tab, so a
// link opens the same lines, and every change replaces the address rather than adding a step.

/** The filter the address holds, and a way to change part of it. */
export function useMonitorLogFilter(): { filter: ComputedRef<LogFilter>; change: (part: Partial<LogFilter>) => void } {
  const route = useRoute();
  const router = useRouter();
  const filter = computed(() => logFilterFrom(route.query));

  function change(part: Partial<LogFilter>): void {
    const next = { ...filter.value, ...part };

    void router.replace({ query: { ...route.query, ...logFilterQuery(next) } });
  }

  return { filter, change };
}

// The pack's word for each category the units' repositories bring. The category a unit stands in is the unit's own,
// read from its slice; the console holds only what each is called.
const CATEGORY_WORDS: Readonly<Record<string, string>> = {
  [SERVICE_CATEGORY]: "monitor_logs.label.category_service",
  backup: "monitor_logs.label.category_backup",
  deploy: "monitor_logs.label.category_deploy",
  suite: "monitor_logs.label.category_suite",
  upkeep: "monitor_logs.label.category_upkeep"
};

/** A category's name: the pack's word for its key, or the key itself where the pack has none. */
export function categoryLabel(t: Translate, key: string): string {
  const word = Object.hasOwn(CATEGORY_WORDS, key) ? CATEGORY_WORDS[key] : undefined;

  return word === undefined ? key : t(word);
}

/** One choice of the category dropdown: every category, a category, or one unit of the servers' category. */
export interface LogSourceChoice {
  label: string;
  value?: string;
  type?: "label";
}

// A select's choice cannot be held under an empty value, so every category and every level is held under this one.
export const ALL_CHOICE = "*";
const UNIT_PREFIX = "unit:";

/** The value a choice is held under: a category by its key, a unit marked as one, every category as the all choice. */
export function sourceValue(filter: LogFilter): string {
  if (filter.unit !== null) return `${UNIT_PREFIX}${filter.unit}`;

  return filter.category ?? ALL_CHOICE;
}

/** The filter a chosen value stands for. */
export function sourceFilter(value: string): Pick<LogFilter, "category" | "unit"> {
  if (value.startsWith(UNIT_PREFIX)) return { category: null, unit: value.slice(UNIT_PREFIX.length) };

  return { category: value === ALL_CHOICE ? null : value, unit: null };
}

/**
 * The category dropdown's choices: every category first, then each category, then the servers' units under their
 * category's name. A unit the address names that the sources no longer list still stands, so the dropdown shows it.
 */
export function sourceChoices(t: Translate, sources: LogSources | null, filter: LogFilter): LogSourceChoice[][] {
  const categories = sources?.categories ?? [{ key: SERVICE_CATEGORY, units: [] }];
  const units = categories.find((category) => category.key === SERVICE_CATEGORY)?.units ?? [];
  const named = filter.unit !== null && !units.includes(filter.unit) ? [filter.unit, ...units] : units;
  const head: LogSourceChoice[] = [
    { label: t("monitor_logs.label.all_categories"), value: ALL_CHOICE },
    ...categories.map((category) => ({ label: categoryLabel(t, category.key), value: category.key }))
  ];

  if (named.length === 0) return [head];

  return [head, [{ label: categoryLabel(t, SERVICE_CATEGORY), type: "label" }, ...named.map((unit) => ({ label: unit, value: `${UNIT_PREFIX}${unit}` }))]];
}

/** The level dropdown's choices: every level, then each. */
export function levelChoices(t: Translate): { label: string; value: LogLevel | typeof ALL_CHOICE }[] {
  return [
    { label: t("monitor_logs.label.all_levels"), value: ALL_CHOICE },
    { label: t("monitor_logs.label.level_error"), value: "error" },
    { label: t("monitor_logs.label.level_warning"), value: "warning" },
    { label: t("monitor_logs.label.level_other"), value: "other" }
  ];
}

/** How many of the three filters are set, which the folded filter button carries. */
export function setFilterCount(filter: LogFilter): number {
  return [filter.category !== null || filter.unit !== null, filter.level !== null, filter.query.trim() !== ""].filter(Boolean).length;
}
