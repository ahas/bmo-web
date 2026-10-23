import type { MonitorNode } from "#shared/types";
import type { Ref } from "vue";

// The node service's list as the monitor reads it (docs/web.md, 「Monitor screen」): the nodes in the list's order,
// each by its name, its label, how it is reached and whether it is this machine.

// A node's mark where a screen stands it beside its name.
export const NODE_ICON = "i-material-symbols-dns-outline";

export function useNodes(): { nodes: Ref<MonitorNode[]>; status: Ref<string>; error: Ref<unknown>; refresh: () => Promise<void> } {
  const { data, status, error, refresh } = useFetch<MonitorNode[]>("/api/nodes", {
    key: "nodes",
    lazy: true,
    server: false,
    default: () => []
  });

  return { nodes: data as Ref<MonitorNode[]>, status, error, refresh: () => refresh() };
}
