import { setModelRegistrations } from "#shared/model-short";

import type { ModelPage } from "#shared/agency";

// The deployment's registrations, laid into the one function that shortens a model name (docs/web.md, 「Model names
// where room is short」): an alias a run records is read as the engine its registration names. The list is the
// administrator's own, so it is read once by the shell that holds the rows naming a model, and read again by the
// registry's own screen when a registration changes.
export function useModelNames(): void {
  const { data } = useFetch<ModelPage>("/api/models", {
    key: "models",
    lazy: true,
    server: false,
    default: () => ({ items: [], more: false })
  });

  watchEffect(() => setModelRegistrations(data.value?.items ?? []));
}
