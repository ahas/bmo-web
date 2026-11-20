import type { MonitorNode, NodeOwnership, NodeState, NodeTone } from "#shared/types";
import type { Translate } from "#shared/wording";
import type { UserSummary } from "@web/server-client";
import type { Ref } from "vue";

// The node service's list as the monitor reads it (docs/web.md, 「Monitor screen」 and 「The node list」): the nodes in
// the list's order, each by its name, its label, how it is reached, whether it is this machine, its last check and
// whose it is.

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

/** The node's own screen: its monitor, for a personal node as well. */
export function nodeScreenPath(name: string): string {
  return `/monitor/${encodeURIComponent(name)}`;
}

// The colour a state's dot stands in, as the tone the node service hands with it: a personal node that is merely off
// is `unknown`, and stands in the neutral grey rather than as a failure.
const TONE_DOTS: Record<NodeTone, string> = {
  good: "bg-success",
  bad: "bg-error",
  unknown: "bg-(--ui-text-dimmed)"
};

export function toneDot(tone: NodeTone): string {
  return TONE_DOTS[tone];
}

const STATE_WORDS: Record<NodeState, string> = {
  connected: "hardware.label.state_connected",
  disconnected: "hardware.label.state_disconnected",
  auth: "hardware.label.state_auth",
  hostkey: "hardware.label.state_hostkey",
  unreachable: "hardware.label.state_unreachable",
  error: "hardware.label.state_error",
  unknown: "hardware.label.state_unknown"
};

/** A state in the console's words; one a later node service names that the console does not know reads as unchecked. */
export function stateWord(t: Translate, state: NodeState): string {
  return t(STATE_WORDS[state] ?? STATE_WORDS.unknown);
}

const OWNERSHIP_WORDS: Record<NodeOwnership, { short: string; node: string }> = {
  shared: { short: "hardware.label.ownership_shared", node: "hardware.label.ownership_shared_node" },
  personal: { short: "hardware.label.ownership_personal", node: "hardware.label.ownership_personal_node" }
};

export function ownershipWord(t: Translate, ownership: NodeOwnership): string {
  return t(OWNERSHIP_WORDS[ownership].short);
}

export function ownershipNodeWord(t: Translate, ownership: NodeOwnership): string {
  return t(OWNERSHIP_WORDS[ownership].node);
}

// The node list's filter, kept in the address as `?ownership=` beside the tab: every node where it names neither.
export type OwnershipFilter = NodeOwnership | "all";

export function ownershipFilterOf(asked: unknown): OwnershipFilter {
  return asked === "shared" || asked === "personal" ? asked : "all";
}

export function filteredNodes(nodes: readonly MonitorNode[], filter: OwnershipFilter): MonitorNode[] {
  return filter === "all" ? [...nodes] : nodes.filter((node) => node.ownership === filter);
}

// The account service's users by their id, for the name a personal node's account goes by: the person's name, their
// login where none stands (docs/accounts.md, 「Users and senders」).
export function accountNames(users: readonly UserSummary[]): Map<string, string> {
  return new Map(users.map((user) => [user.user, user.fullName.trim() === "" ? user.name : user.fullName]));
}

/** The name a personal node's account goes by; null for a node that names none. */
export function accountName(t: Translate, names: ReadonlyMap<string, string>, account: string | null): string | null {
  if (account === null) return null;

  return names.get(account) ?? t("hardware.label.unknown_account", { id: account });
}

/** What a node is, in a line: a shared node, or a personal node with the name its account goes by where it names
 * one. */
export function ownershipText(t: Translate, names: ReadonlyMap<string, string>, node: Pick<MonitorNode, "ownership" | "account">): string {
  const name = node.ownership === "personal" ? accountName(t, names, node.account) : null;

  return name === null ? ownershipNodeWord(t, node.ownership) : t("hardware.label.ownership_personal_of", { name });
}

/** The owner a monitored personal node's tile names: the personal node with its account's name where the names are
 * read, the word alone where they are not; null for a machine with no account, this machine and a shared node. */
export function machineOwnerText(t: Translate, names: ReadonlyMap<string, string> | null, account: string | null): string | null {
  if (account === null) return null;

  return names === null ? ownershipNodeWord(t, "personal") : ownershipText(t, names, { ownership: "personal", account });
}

/** The administrator's read of every user, for the names the node list and a node's screen show. */
export function useAccountNames(): { names: Ref<Map<string, string>>; users: Ref<UserSummary[]>; read: Ref<boolean>; error: Ref<unknown> } {
  const { data, status, error } = useFetch<UserSummary[]>("/api/users", { key: "node-account-users", lazy: true, server: false, default: () => [] });

  // Whether the names have come, so an account is never called unknown before they have.
  const read = computed(() => status.value === "success" || status.value === "error");

  return { names: computed(() => accountNames(data.value ?? [])), users: data as Ref<UserSummary[]>, read, error };
}

/** The node list's filter as the address holds it, and its change, which replaces the address rather than adding a
 * step of the history. */
export function useOwnershipFilter(): { filter: Ref<OwnershipFilter>; change: (next: OwnershipFilter) => void } {
  const route = useRoute();
  const router = useRouter();
  const filter = computed(() => ownershipFilterOf(route.query.ownership));

  function change(next: OwnershipFilter): void {
    void router.replace({ query: { ...route.query, ownership: next === "all" ? undefined : next } });
  }

  return { filter, change };
}
