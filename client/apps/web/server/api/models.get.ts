import type { ModelPage, ModelView } from "#shared/agency";

// The models the registry holds (the agency's `docs/api.md`, 「providers, models and model files」): each
// registration's key and name, the model behind it, its card service, whether its engine answers and what names it.
// `usedBy` is answered beside the fields the published type states, and is read as a list of the agency's own names.
export default defineEventHandler(async (event): Promise<ModelPage> => {
  await requireUserSession(event);

  const page = await agencyCall(agency(event).GET("/models"));

  return {
    items: page.items.map((one): ModelView => {
      const usedBy = (one as { usedBy?: unknown }).usedBy;

      return { ...one, usedBy: Array.isArray(usedBy) ? usedBy.filter((name): name is string => typeof name === "string") : [] };
    }),
    more: page.more
  };
});
