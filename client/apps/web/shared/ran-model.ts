import { shortModel } from "./model-short";

import type { RanOn } from "./types";

// The model a run is shown by, read the same way wherever a step, an item or a job's run is shown: the road its last
// execution actually went out on, or the requested model where nothing has gone out yet (bmo-job's docs/reading.md,
// 「The model an item ran on」). A model stands alone: why its road was taken is the road table's to say
// (docs/web.md, 「Model names where room is short」).

export interface RanModel {
  // `provider/model` of the road taken, or the requested model where nothing has gone out yet.
  shown: string;
}

export function ranModel(requested: string, ran: RanOn | null | undefined): RanModel {
  if (ran === null || ran === undefined || ran.provider === "" || ran.model === "") return { shown: requested };

  return { shown: `${ran.provider}/${ran.model}` };
}

/**
 * An item's model read the same way: what its work last went out on, and the model it asked for — `auto`
 * above all — where nothing has gone out yet; nothing where it asked for the default and nothing has gone out.
 */
export function itemRanModel(requested: string | null, ran: RanOn | null): RanModel | null {
  return requested === null && ran === null ? null : ranModel(requested ?? "", ran);
}

/** The model as a line names it: short in a compact line (docs/web.md, 「Model names where room is short」), else whole. */
export function ranModelText(model: RanModel, short: boolean): string {
  return short ? shortModel(model.shown) : model.shown;
}
