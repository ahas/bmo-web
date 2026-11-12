import { describe, expect, test } from "bun:test";

import { ALL_CHOICE, categoryLabel, levelChoices, setFilterCount, sourceChoices, sourceFilter, sourceValue } from "../../../apps/web/app/domain/monitor-logs";
import { logFiltered, logFilterFrom, logFilterQuery } from "../../../apps/web/shared/monitor-logs";
import { wording } from "../../../apps/web/shared/wording";

import type { LogFilter } from "../../../apps/web/shared/monitor-logs";

// The logs tab's filters (docs/web.md, 「Monitor's logs tab」): the filter as the address holds it, the category
// dropdown's choices with the servers' units under their category, and a category the pack does not name standing by
// its key.

const NONE: LogFilter = { category: null, unit: null, level: null, query: "" };

describe("the filter in the address", () => {
  test("reads what the address holds, a level it does not know and empty words read as none", () => {
    expect(logFilterFrom({ category: "backup", unit: " ", level: "loud", q: "failed" })).toEqual({ category: "backup", unit: null, level: null, query: "failed" });
    expect(logFilterFrom({})).toEqual(NONE);
  });

  test("is written back with nothing for what is not set, and says whether anything narrows the lines", () => {
    const filter: LogFilter = { category: null, unit: "bmo-unit-a.service", level: "error", query: " " };

    expect(logFilterQuery(filter)).toEqual({ category: undefined, unit: "bmo-unit-a.service", level: "error", q: undefined });
    expect(logFilterFrom(logFilterQuery(filter))).toEqual({ ...filter, query: "" });
    expect(logFiltered(NONE)).toBe(false);
    expect(logFiltered({ ...NONE, query: "x" })).toBe(true);
    expect(setFilterCount(filter)).toBe(2);
  });
});

describe("the category dropdown", () => {
  const sources = { categories: [{ key: "service", units: ["bmo-unit-a.service"] }, { key: "backup", units: [] }, { key: "newkind", units: [] }] };

  test("offers every category, each category, then the servers' units under their category's name", () => {
    const [head, units] = sourceChoices(wording, sources, NONE);

    expect(head).toEqual([
      { label: wording("monitor_logs.label.all_categories"), value: ALL_CHOICE },
      { label: wording("monitor_logs.label.category_service"), value: "service" },
      { label: wording("monitor_logs.label.category_backup"), value: "backup" },
      { label: "newkind", value: "newkind" }
    ]);
    expect(units).toEqual([{ label: wording("monitor_logs.label.category_service"), type: "label" }, { label: "bmo-unit-a.service", value: "unit:bmo-unit-a.service" }]);
  });

  test("keeps a unit the address names that the sources no longer list", () => {
    const [, units] = sourceChoices(wording, sources, { ...NONE, unit: "bmo-unit-gone.service" });

    expect(units?.map((one) => one.value)).toEqual([undefined, "unit:bmo-unit-gone.service", "unit:bmo-unit-a.service"]);
  });

  test("holds a choice as the filter it stands for, and back", () => {
    for (const filter of [NONE, { ...NONE, category: "backup" }, { ...NONE, unit: "bmo-unit-a.service" }]) {
      expect(sourceFilter(sourceValue(filter))).toEqual({ category: filter.category, unit: filter.unit });
    }
  });

  test("names a category the pack does not hold by its key", () => {
    expect(categoryLabel(wording, "deploy")).toBe(wording("monitor_logs.label.category_deploy"));
    expect(categoryLabel(wording, "toString")).toBe("toString");
  });
});

describe("the level dropdown", () => {
  test("offers every level, then errors, warnings and the rest", () => {
    expect(levelChoices(wording).map((one) => one.value)).toEqual([ALL_CHOICE, "error", "warning", "other"]);
  });
});
