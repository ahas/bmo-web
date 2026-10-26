import { emptyFallbackView } from "../../app/domain/agent-settings";
import { gateOptionsOf } from "../utils/gate";

import type { FallbackView } from "#shared/types";

// The ordered fallback as the agency answers it (the agency's `docs/api.md`, 「providers, models, pin-checks, tiers
// and fallback」): the provider order with each provider's reason, the Claude accounts in their order, the slot the
// chat runs on, the own-LLM services and every work key's profile. A field the answer leaves out stands as the empty
// view has it. A gate's options are the gate unit's and are read from it beside the agency's answer (docs/web.md,
// the agents page's gates tab). The OpenRouter secret is not in the agency's answer and so cannot be in this one — a key that
// reached the browser would be a key in a page's memory and in whatever cached it.
export default defineEventHandler(async (event): Promise<FallbackView> => {
  await requireUserSession(event);

  // The agency's generated schema names only some of the fields read here; each one missing stands as below.
  const fallback = (await agencyCall(agency().GET("/fallback"))) as Partial<FallbackView>;
  const empty = emptyFallbackView();
  const profiles = Array.isArray(fallback.profiles) ? fallback.profiles : empty.profiles;
  const options = await gateOptionsOf(profiles.filter((profile) => profile.kind === "gate").map((profile) => profile.key));

  return {
    active: fallback.active ?? empty.active,
    codexPresent: fallback.codexPresent ?? empty.codexPresent,
    keyPresent: fallback.keyPresent ?? empty.keyPresent,
    services: Array.isArray(fallback.services) ? fallback.services : empty.services,
    since: fallback.since ?? null,
    order: Array.isArray(fallback.order) ? fallback.order : empty.order,
    orderIsDefault: fallback.orderIsDefault ?? empty.orderIsDefault,
    accounts: Array.isArray(fallback.accounts) ? fallback.accounts : empty.accounts,
    profiles: profiles.map((profile) => {
      const held = options.get(profile.key);

      return held === undefined ? profile : { ...profile, gateOptions: held };
    })
  };
});
