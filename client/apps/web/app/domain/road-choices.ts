import { computed, ref } from "vue";
import { failureText } from "bmo-ui/app/domain/errors";

import { useProviderModels } from "./axes";

import type { ProviderView } from "#shared/axes";
import type { Translate } from "#shared/wording";
import type { ComputedRef } from "vue";
import type { CellChoice } from "./settings-cells";

// The list a road is chosen from (docs/web.md, 「What a row runs on now」 and the TODO panel's model chip): every model
// a line may run on, a group to each provider whose program carries the line, in the agency's order of providers,
// each provider's models as `GET /provider-models/{provider}` answers them — the same values a provider order's editor
// offers. A road is `<provider>/<model>`, the provider what stands before the first slash and the model all after it,
// the shape an item's `model` label takes (the agency's `docs/repositories.md`, 「A model an item names」).

/** The value of a list's entry for no force: the row's order chooses. No provider's name takes an @. */
export const ROAD_ORDER = "@order";

/** A provider and model as one road. */
export function roadValue(provider: string, model: string): string {
  return `${provider}/${model}`;
}

/** A road read back as its provider and model; none where it names no provider and model. */
export function roadParts(value: string): { provider: string; model: string } | null {
  const at = value.indexOf("/");

  if (at <= 0 || at === value.length - 1) return null;

  return { provider: value.slice(0, at), model: value.slice(at + 1) };
}

// The providers as the list last read them, shared by every list on the page and read again as one opens.
const providers = ref<ProviderView[] | null>(null);
const reading = ref(false);

async function readProviders(): Promise<void> {
  if (reading.value) return;

  reading.value = true;

  try {
    providers.value = await $fetch<ProviderView[]>("/api/providers");
  } catch {
    // A read that fails leaves the providers last read standing; the list says what it has.
  } finally {
    reading.value = false;
  }
}

/** The providers whose program carries the line, in the agency's order, and the one a road names wherever it stands. */
function carrying(line: string, chosen: string): ProviderView[] {
  const named = roadParts(chosen)?.provider ?? null;

  return (providers.value ?? []).filter((one) => one.lines.length === 0 || one.lines.includes(line) || one.name === named);
}

export interface RoadChoices {
  // Reads the providers and each carrying provider's models; called as the list opens.
  read: () => Promise<void>;
  // Whether a read of the providers or of a provider's models is still under way.
  reading: ComputedRef<boolean>;
  // The list: the entry standing first, then a group to each provider, the chosen road kept where no list holds it and
  // the road the row runs on now marked as in use.
  groups: (first: CellChoice, chosen: string, inUse: string | null) => CellChoice[][];
}

/** The list of roads a line may run on, read as it opens. */
export function useRoadChoices(t: Translate, line: () => string): RoadChoices {
  const models = useProviderModels();

  async function read(): Promise<void> {
    await readProviders();

    await Promise.all(carrying(line(), "").map(async (one) => await models.read(one.name, (error) => failureText(error, t("agents.error.provider_models_read_failed")))));
  }

  const busy = computed(() => reading.value || carrying(line(), "").some((one) => models.stateOf(one.name).value.reading));

  function groups(first: CellChoice, chosen: string, inUse: string | null): CellChoice[][] {
    const chosenParts = roadParts(chosen);
    const listed = carrying(line(), chosen).map((provider): CellChoice[] => {
      const state = models.stateOf(provider.name).value;
      const said = state.failure ?? provider.reason;
      const head: CellChoice = { type: "label", value: `@${provider.name}`, label: said === null ? provider.label : `${provider.label} · ${said}` };
      const items = (state.view?.models ?? []).map((one): CellChoice => {
        const value = roadValue(provider.name, one.id);
        const notes = [one.inService === false ? t("agents.label.model_superseded") : null, value === inUse ? t("agents.label.active_in_use") : null].filter((note) => note !== null);

        return { value, label: one.id, ...(notes.length === 0 ? {} : { description: notes.join(" · ") }) };
      });

      // A road the row names that its provider's list does not carry still stands as its own entry.
      if (chosenParts !== null && chosenParts.provider === provider.name && !items.some((one) => one.value === chosen)) {
        items.unshift({ value: chosen, label: chosenParts.model });
      }

      return [head, ...items];
    });

    // A road naming a provider the agency no longer lists still stands, under its own name.
    const stray = chosenParts !== null && !listed.some((group) => group.some((one) => one.value === chosen))
      ? [[{ type: "label", value: `@${chosenParts.provider}`, label: chosenParts.provider }, { value: chosen, label: chosenParts.model }] as CellChoice[]]
      : [];

    return [[first], ...listed, ...stray];
  }

  return { read, reading: busy, groups };
}
