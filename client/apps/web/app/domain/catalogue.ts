import { useInitialRead } from "bmo-ui/app/domain/loading";
import { holdCatalogue } from "./agents";
import { sameKept } from "./same-kept";

import type { AgentList } from "#shared/types";
import type { Ref } from "vue";

// The one read of the catalogue this browser makes. Every screen shares it — Nuxt keys the fetch
// — and what arrives is put where the naming functions find it, so a worker the owner added is
// called what they called it on every screen at once rather than on the ones that happened to ask.
export interface AgentCatalogue {
  agents: Ref<AgentList>;
  initial: Ref<boolean>;
  failed: Ref<boolean>;
  refresh: () => Promise<void>;
}

// The catalogue as this tab last read it, which a read bringing it back as it was hands on again.
let catalogueHeld: AgentList | undefined;

function keptCatalogue(answer: AgentList): AgentList {
  catalogueHeld = sameKept(catalogueHeld, answer);

  return catalogueHeld;
}

export function useAgentCatalogue(): AgentCatalogue {
  const { data, refresh, status } = useFetch<AgentList>("/api/agents", {
    key: "agents",
    lazy: true,
    server: false,
    default: () => ({ reachable: false, agents: [], roles: [], gateOrder: [], defaultAnswerer: null }),
    // A read bringing the catalogue back as it was keeps the one in hand, so the sidebar's agents draw nothing again
    // (docs/web.md, 「What the stream costs a tab」).
    transform: keptCatalogue
  });

  watch(data, (list) => holdCatalogue(list?.agents ?? [], list?.gateOrder ?? [], list?.defaultAnswerer ?? null), { immediate: true });

  return { initial: useInitialRead(status), failed: computed(() => status.value === "error"), agents: data as Ref<AgentList>, refresh: async () => void (await refresh()) };
}
