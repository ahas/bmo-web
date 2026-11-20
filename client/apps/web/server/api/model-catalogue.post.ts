import { wording } from "#shared/wording";

import type { components } from "@agency/client/schema";

type ModelCatalogueChange = components["schemas"]["ModelCatalogueChange"];
import type { CatalogueView, ModelUseState } from "#shared/agency";

const text = (value: unknown): string | null => (typeof value === "string" ? value : null);
const whole = (value: unknown): number | null => (typeof value === "number" && Number.isFinite(value) ? value : null);
const truth = (value: unknown): boolean | null => (typeof value === "boolean" ? value : null);

// One change of the model catalogue, or a choice of an entry for its engine, carried to the agency under the
// signed-in user (the agency's `docs/api.md`, 「providers, models, pin-checks, tiers and fallback」). A choice asks
// the engine's health and stands a unit up before it answers, so it is given longer than a save.
export default defineEventHandler(async (event): Promise<CatalogueView> => {
  const session = await requireUserSession(event);
  const body = await readBody<Record<string, unknown>>(event);

  if (typeof body !== "object" || body === null || typeof body.action !== "string") throw fail(400, wording("agents.error.catalogue_action"));

  const name = text(body.name);

  if (name === null) throw fail(400, wording("agents.error.catalogue_action"));

  const change: ModelCatalogueChange = {
    action: body.action,
    name,
    label: text(body.label),
    file: text(body.file),
    bytes: whole(body.bytes),
    sha256: text(body.sha256),
    source: text(body.source),
    engine: text(body.engine),
    registration: text(body.registration),
    note: text(body.note),
    thinking: truth(body.thinking),
    temperature: whole(body.temperature),
    topP: whole(body.topP),
    presencePenalty: whole(body.presencePenalty),
    maxTokens: whole(body.maxTokens),
    by: session.user.name
  };
  const view = await agencyCall(
    agency(event).POST("/model-catalogue", { body: change })
  );

  return { entries: view.entries, uses: view.uses.map((use) => ({ ...use, state: use.state as ModelUseState })) };
});
