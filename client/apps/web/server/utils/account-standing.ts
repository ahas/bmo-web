import { userNode, userOf } from "./account-service";
import { agency, agencyCall } from "./agency";
import { standRecordIdentity } from "./console-rooms";
import { readSupervisors } from "./axes";
import { defaultAnswerer } from "./owner";
import { setPersonNode } from "./person-node";
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
 * on the provider and model of the default answerer's road, its identity on the record road linked to it
 * (docs/accounts.md, 「Users and senders」), one agent of the account for every role with an agent of no account, and its
 * machine as the node its runs stand on. The BMO and the agents are made once, the identity is the same one every
 * time, and the node is set every time; a part that cannot be made is written to the log and the rest goes on.
 */
export async function standAccount(user: number): Promise<void> {
  await standSupervisor(user).catch((error: unknown) => console.error(`account ${user}: its BMO could not be made: ${String(error)}`));
  await standRecordIdentity(user).catch((error: unknown) => console.error(`account ${user}: its record identity could not be linked: ${String(error)}`));
  await standAgents(user).catch((error: unknown) => console.error(`account ${user}: its agents could not be made: ${String(error)}`));
  await standNode(user).catch((error: unknown) => console.error(`account ${user}: its node could not be set: ${String(error)}`));
}

// The machine the account is bound to, set in agency as the node its runs stand on (docs/accounts.md, 「Invitations and
// a person's machine」); only a machine the hub holds now is set. Nobody reads this refusal on a screen, so agency's
// own code goes to the log.
async function standNode(user: number): Promise<void> {
  const machine = await userNode(user);

  if (typeof machine.agent !== "string" || !machine.attached) return;

  try {
    await setPersonNode(user, machine.agent, machine.shared);
  } catch (error) {
    const code = (error as { data?: { code?: string | null } }).data?.code ?? "no code";

    throw new Error(`agency did not set ${machine.agent} (${code})`, { cause: error });
  }
}

async function standSupervisor(user: number): Promise<void> {
  const supervisors = await readSupervisors();

  if (supervisors.some((supervisor) => supervisor.ownerAccount === user)) return;

  const answering = await defaultAnswerer();
  const template = supervisors.find((supervisor) => supervisor.name === answering) ?? supervisors[0];
  const road = template?.road ?? null;

  if (road === null) throw new Error("the agency holds no supervisor whose road a new one could take");

  const person = await userOf(user);
  const label = person?.name ?? `u${user}`;

  await receiverCall(
    receiver().POST("/supervisors", {
      body: {
        name: `u${user}`,
        label,
        room: label,
        provider: road.provider,
        model: road.model,
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
      foldRatio: shared.foldRatio,
      prompt: shared.prompt,
      bundles: shared.bundles,
      skills: shared.skills
    };

    await agencyCall(agency().POST("/role-agents", { body: taken }));
  }
}
