import { userOf } from "./account-service";
import { agency, agencyCall } from "./agency";
import { orderBody, readSupervisors } from "./axes";
import { defaultAnswerer } from "./owner";
import { receiver, receiverCall } from "./receiver";

import type { components } from "@agency/client/schema";
import type { components as ReceiverComponents } from "@bmo/receiver-client/schema";

type Schemas = components["schemas"];

// The agency's agent row as it answers it, with the account the seat belongs to, which its published schema leaves
// out (the agency's `docs/api.md`, 「Role agents」).
type HeldAgent = Schemas["RoleAgent"] & { ownerAccount?: string | null };

// The settings of an agent a new account's agent of the same role takes on.
type TakenOver = Schemas["RoleAgentChange"] & { role: string; name: string; ownerAccount: string };

/**
 * An account made ready, given its own BMO and its agents (docs/web.md, 「The join page」): a supervisor of the account
 * on the default answerer's provider order, and one agent of the account for every role with an agent of no account.
 * Each part is made once; a part that cannot be made is written to the log and the rest goes on.
 */
export async function standAccount(user: number): Promise<void> {
  await standSupervisor(user).catch((error: unknown) => console.error(`account ${user}: its BMO could not be made: ${String(error)}`));
  await standAgents(user).catch((error: unknown) => console.error(`account ${user}: its agents could not be made: ${String(error)}`));
}

async function standSupervisor(user: number): Promise<void> {
  const supervisors = await readSupervisors();

  if (supervisors.some((supervisor) => supervisor.ownerAccount === user)) return;

  const answering = await defaultAnswerer();
  const template = supervisors.find((supervisor) => supervisor.name === answering) ?? supervisors[0];

  if (template === undefined) throw new Error("the agency holds no supervisor whose order a new one could take");

  const person = await userOf(user);
  const label = person?.name ?? `u${user}`;

  await receiverCall(
    receiver().POST("/supervisors", {
      body: {
        name: `u${user}`,
        label,
        room: label,
        order: orderBody(template.order),
        quotaShare: template.quotaShare,
        repository: null,
        ownerAccount: user,
        sessionScope: "agent"
      } as ReceiverComponents["schemas"]["SupervisorRequest"]
    })
  );
}

async function standAgents(user: number): Promise<void> {
  const account = String(user);
  const roles = (await agencyCall(agency().GET("/roles"))).roles;

  for (const role of roles) {
    const agents = (role.agents ?? []) as HeldAgent[];

    if (agents.some((agent) => agent.ownerAccount === account)) continue;

    const shared = agents.find((agent) => (agent.ownerAccount ?? null) === null && agent.enabled);

    if (shared === undefined) continue;

    const taken: TakenOver = {
      role: role.name,
      name: `${role.name}-u${user}`.slice(0, 32),
      ownerAccount: account,
      provider: shared.provider,
      model: shared.model,
      effort: shared.effort,
      thinking: shared.thinking,
      answerTokens: shared.answerTokens,
      enabled: true,
      keepsCache: shared.keepsCache,
      sessions: shared.sessions,
      callable: shared.callable,
      foldRatio: shared.foldRatio,
      prompt: shared.prompt,
      bundles: shared.bundles,
      skills: shared.skills
    };

    await agencyCall(agency().POST("/role-agents", { body: taken }));
  }
}
