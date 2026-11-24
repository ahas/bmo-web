import { wording } from "#shared/wording";

import { AccountRefusal, chainEntry, resolveChain, setChainDelegation, setChainValue } from "./account-service";
import { unitNamed } from "./chain-names";
import { fail } from "./fail";
import { callerOf } from "./organization";

import type { SignedIn } from "./accounts";
import type { ChainDelegation } from "#shared/organisation-supply";
import type { BrainLayer, BrainLayerSetting, BrainLayersView } from "#shared/org-memory";

// Whether the base and the org brains are read for the people under a link (docs/web.md, 「Organisation」, the org
// memory tab, the read layers; the brain's `docs/design.md`, 「The layers a reading takes」): two narrowing flags the brain
// declares on the delegation chain, read and written on the chain's own routes as the reader, so who writes a link
// and a lock above it are the account service's word. A link only turns a layer off: turning it on again follows
// the link above.

/** The chain's kind of each layer, as the brain declares it. */
const KINDS: Readonly<Record<BrainLayer, string>> = {
  global: "brain.global",
  organisation: "brain.organisation"
};

const LAYERS: readonly BrainLayer[] = ["global", "organisation"];

/** Whether a word names a layer. */
export function isBrainLayer(value: unknown): value is BrainLayer {
  return typeof value === "string" && (LAYERS as readonly string[]).includes(value);
}

// One layer at a link, none where the reader may not read the link or the brain has not declared the kind yet.
async function layerAt(layer: BrainLayer, link: string, unit: number | null, signed: SignedIn): Promise<BrainLayerSetting | null> {
  const key = KINDS[layer];

  try {
    const [entry, resolved] = await Promise.all([chainEntry(key, link, callerOf(signed)), unit === null ? Promise.resolve(null) : resolveChain(key, { unit })]);
    const closing = (resolved?.layers ?? []).find((one) => one.link !== link && one.value === false);
    const closedAbove = closing !== undefined;
    const own = entry.value === false ? false : null;
    const [closer, locker] = await Promise.all([unitNamed(closing?.link), unitNamed(entry.lockedBy)]);

    return { read: !closedAbove && own !== false, own, closedAbove, delegation: entry.delegation, writable: entry.writable, lockedBy: entry.lockedBy ?? null, closer, locker };
  } catch (error) {
    if (error instanceof AccountRefusal && (error.status === 403 || error.status === 404)) return null;

    throw error;
  }
}

/** The two layers at a unit's link, or at the platform's where `unit` is null; refused where the reader reads neither. */
export async function brainLayers(unit: number | null, signed: SignedIn): Promise<BrainLayersView> {
  const link = unit === null ? "platform" : `unit:${unit}`;
  const [global, organisation] = await Promise.all(LAYERS.map((layer) => layerAt(layer, link, unit, signed)));

  if (global === null && organisation === null) throw fail(403, wording("org_memory.error.layers_forbidden"));

  return { global: global ?? null, organisation: organisation ?? null };
}

/** A layer turned off at a link, or on again to follow above, and its delegation set. */
export async function changeBrainLayer(unit: number | null, layer: BrainLayer, change: { value?: false | null; delegation?: ChainDelegation }, signed: SignedIn): Promise<void> {
  const link = unit === null ? "platform" : `unit:${unit}`;
  const caller = callerOf(signed);

  if (change.value !== undefined) await setChainValue(KINDS[layer], link, change.value, caller);
  if (change.delegation !== undefined) await setChainDelegation(KINDS[layer], link, change.delegation, caller);
}

/** A change as the screen sends it: `layer`, `value` false or null, and `delegation`; null where it names none. */
export function brainLayerChange(body: unknown): { layer: BrainLayer; value?: false | null; delegation?: ChainDelegation } | null {
  const asked = (body ?? {}) as { layer?: unknown; value?: unknown; delegation?: unknown };

  if (!isBrainLayer(asked.layer)) return null;

  const value = asked.value === false || asked.value === null ? asked.value : undefined;
  const delegation = asked.delegation === "allow" || asked.delegation === "lock" || asked.delegation === "inherit" ? asked.delegation : undefined;

  if (value === undefined && delegation === undefined) return null;

  return { layer: asked.layer, ...(value === undefined ? {} : { value }), ...(delegation === undefined ? {} : { delegation }) };
}
