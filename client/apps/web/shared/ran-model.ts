import { shortModel } from "./model-short";
import { agentProviderNames } from "./types";

import type { RanOn } from "./types";

// The model a run is shown by, read the same way wherever a step, an item or a job's run is shown: the road
// its last execution actually went out on, whether that road is one the provider order fell to, whether its
// executions went out on more than one road, and the requested one where the two differ, which only a
// detail view says (bmo-job's docs/reading.md, 「The model an item ran on」). Each surface puts its own words around
// these; the values are this one reading.

export interface RanModel {
  // `provider/model` of the road taken, or the requested model where nothing has gone out yet.
  shown: string;
  // The requested model, only where it is not the road taken.
  requested: string | null;
  fallback: boolean;
  changed: boolean;
}

// The provider a request naming none walks to first: the head of the default provider order.
const headProvider = agentProviderNames[0];

// A requested model is `provider::model`, or a bare model where no provider was named; a bare one is the
// road taken whenever the model matches.
function split(requested: string): { provider: string | null; model: string } {
  const at = requested.indexOf("::");

  return at === -1 ? { provider: null, model: requested } : { provider: requested.slice(0, at), model: requested.slice(at + 2) };
}

function asked(requested: string, ran: RanOn): boolean {
  const { provider, model } = split(requested);

  return (provider === null || provider === ran.provider) && model === ran.model;
}

// A road is a fallback when it is on another provider than the one asked for — the head of the order where
// the request named none, `auto` and the default included. Another model on the provider asked for is the
// provider's own choice, not the order's.
function fellBack(requested: string, ran: RanOn): boolean {
  return !asked(requested, ran) && (split(requested).provider ?? headProvider) !== ran.provider;
}

export function ranModel(requested: string, ran: RanOn | null | undefined): RanModel {
  if (ran === null || ran === undefined || ran.provider === "" || ran.model === "") {
    return { shown: requested, requested: null, fallback: false, changed: false };
  }

  return {
    shown: `${ran.provider}/${ran.model}`,
    requested: requested === "" || asked(requested, ran) ? null : requested,
    fallback: fellBack(requested, ran),
    changed: ran.changed,
  };
}

/**
 * An item's model read the same way: what its work last went out on, and the model it asked for — `auto`
 * above all — where nothing has gone out yet; nothing where it asked for the default and nothing has gone out.
 */
export function itemRanModel(requested: string | null, ran: RanOn | null): RanModel | null {
  return requested === null && ran === null ? null : ranModel(requested ?? "", ran);
}

export interface RanModelWords {
  fallback: string;
  changed: string;
  // Whether the road is named short, for a place with room for a few letters only (docs/web.md, 「Model names where
  // room is short」).
  short?: boolean;
  // Fills the requested model into a detail view's words; a line leaves it out and says the road alone.
  requested?: (requested: string) => string;
}

/** The reading in one line: the road taken, its fallback and changed marks, and the request where the words ask for it. */
export function ranModelText(model: RanModel, words: RanModelWords): string {
  return [
    words.short === true ? shortModel(model.shown) : model.shown,
    ...(model.fallback ? [words.fallback] : []),
    ...(model.changed ? [words.changed] : []),
    ...(model.requested === null || words.requested === undefined ? [] : [words.requested(model.requested)]),
  ].join(" ");
}
