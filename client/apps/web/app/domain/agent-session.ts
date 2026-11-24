import type { DropdownMenuItem } from "@nuxt/ui";
import type { Translate } from "#shared/wording";

// A supervisor's session handed over or reset (docs/web.md, 「A supervisor's session handed over or reset」): what a
// place offering the two acts hands the one dialog that carries them out.

/** Which act, of which supervisors — the first chosen where more than one is offered — and the room it is asked
 * from, or none from an agent's row. */
export interface AgentSessionAsk {
  kind: "handoff" | "reset";
  agents: string[];
  room: number | null;
}

/** The two acts as entries of a menu, each opening the dialog on `agents` through `open`; none where no agent is
 * offered. */
export function agentSessionItems(t: Translate, agents: readonly string[], room: number | null, open: (ask: AgentSessionAsk) => void): DropdownMenuItem[] {
  if (agents.length === 0) return [];

  return [
    { label: t("agent_session.action.handoff"), icon: "i-material-symbols-swap-horiz", onSelect: () => open({ kind: "handoff", agents: [...agents], room }) },
    { label: t("agent_session.action.reset"), icon: "i-material-symbols-restart-alt", onSelect: () => open({ kind: "reset", agents: [...agents], room }) }
  ];
}
