import { agentRoadText } from "./role-agents";

import type { RoleView } from "#shared/axes";
import type { Translate } from "#shared/wording";
import type { CellChoice } from "./settings-cells";
import type { TodoItem } from "#shared/types";

// Whom an item's work runs on, as its detail chooses it (docs/web.md, the TODO panel's section): one agent, or a model
// and the role whose free agent takes it at the launch (the agency's docs/repositories.md, 「An agent an item names」).
// A model whose labels name no role is taken among the role its job runs as; it is read here and never chosen.

export type ItemAssignment = { agent: string } | { role: string | null; model: string };

// A choice's value: an agent by its name, a model by its role and its model behind a mark no agent's or role's name
// carries, since both are kebab-case keys.
const MODEL_MARK = "model:";

/** The value a choice of the assignment stands under. */
export function assignmentValue(assignment: ItemAssignment): string {
  return "agent" in assignment ? assignment.agent : `${MODEL_MARK}${assignment.role ?? ""}:${assignment.model}`;
}

/** The assignment a choice's value names. */
export function assignmentOf(value: string): ItemAssignment {
  if (!value.startsWith(MODEL_MARK)) return { agent: value };

  const rest = value.slice(MODEL_MARK.length);
  const at = rest.indexOf(":");

  return { role: at === 0 ? null : rest.slice(0, at), model: rest.slice(at + 1) };
}

/** What the item's labels name as a choice: the agent, which stands over a model, else the model; none where neither. */
export function namedAssignment(item: Pick<TodoItem, "agent" | "model" | "role">): ItemAssignment | null {
  if (item.agent !== null) return { agent: item.agent };
  if (item.model !== null) return { role: item.role ?? null, model: item.model };

  return null;
}

/** How an assignment reads on its own: the agent's name, or the role and the model, the model alone with no role. */
export function assignmentLabel(t: Translate, assignment: ItemAssignment): string {
  if ("agent" in assignment) return assignment.agent;

  return assignment.role === null ? assignment.model : t("todo.label.assign_model", { role: assignment.role, model: assignment.model });
}

/**
 * The chooser's groups, one to a role: under its name first every model its agents switched on run, each once, with
 * the agents running it, then each of those agents with its road. What the labels name stands first, alone, where the
 * listing does not hold it.
 */
export function assignmentChoices(t: Translate, roles: readonly RoleView[], named: ItemAssignment | null): CellChoice[][] {
  const groups: CellChoice[][] = roles.map((role) => {
    const on = role.agents.filter((agent) => agent.enabled);
    const models = [...new Set(on.flatMap((agent) => (agent.model === null ? [] : [agent.model])))];

    return [
      { type: "label", value: `@${role.name}`, label: role.name },
      ...models.map((model) => ({
        value: assignmentValue({ role: role.name, model }),
        label: assignmentLabel(t, { role: role.name, model }),
        icon: "i-material-symbols-groups-outline",
        description: t("todo.label.assign_model_agents", { agents: on.filter((agent) => agent.model === model).map((agent) => agent.name).join(", ") })
      })),
      ...on.map((agent) => ({
        value: agent.name,
        label: agent.name,
        icon: "i-material-symbols-smart-toy-outline",
        description: agentRoadText(null, agent) ?? t("live.label.space_follows")
      }))
    ];
  });

  if (named === null) return groups;

  const value = assignmentValue(named);

  return groups.some((group) => group.some((one) => one.value === value)) ? groups : [[{ value, label: assignmentLabel(t, named) }], ...groups];
}
