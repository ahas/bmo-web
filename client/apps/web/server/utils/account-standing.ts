import { shownName, userNode, userOf } from "./account-service";
import { agency, agencyCall } from "./agency";
import { recordNameOf, standRecordIdentity } from "./console-rooms";
import { readSupervisors } from "./axes";
import { ownTitles, standOwnBmo } from "./bmo-profile";
import { defaultAnswerer } from "./owner";
import { setPersonNode } from "./person-node";
import { receiver, receiverCall } from "./receiver";

import type { components as ReceiverComponents } from "@bmo/receiver-client/schema";

export { ownTitles, type OwnTitles } from "./bmo-profile";

/**
 * An account made ready, given its own BMO and its agents (docs/web.md, 「The join page」): a supervisor of the account
 * on the provider and model of the default answerer's road, titled by the person's name, its identity on the record
 * road named by the name it is shown by and linked to it (docs/accounts.md, 「Users and senders」), the agents its
 * sign-up composition gives it, and its machine as the node its runs stand on. The BMO and the agents are made once, the identity is the
 * same one every time, and the BMO's titles and the node are set every time; a part that cannot be made is written to
 * the log and the rest goes on.
 */
export async function standAccount(user: number): Promise<void> {
  await standSupervisor(user).catch((error: unknown) => console.error(`account ${user}: its BMO could not be made: ${String(error)}`));
  await standNamedRecordIdentity(user).catch((error: unknown) => console.error(`account ${user}: its record identity could not be linked: ${String(error)}`));
  await standOwnBmo(user, { profile: true }).catch((error: unknown) => console.error(`account ${user}: its BMO could not take its name and profile: ${String(error)}`));
  await standAgents(user).catch((error: unknown) => console.error(`account ${user}: its agents could not be made: ${String(error)}`));
  await standNode(user).catch((error: unknown) => console.error(`account ${user}: its node could not be set: ${String(error)}`));
}

// The account's identity on the record road, stood with the name it is shown by; a name the account service cannot
// say now leaves the name as it stands, since the identity is what the account speaks under.
async function standNamedRecordIdentity(user: number): Promise<void> {
  const name = await recordNameOf(user).catch((error: unknown) => {
    console.warn(`account ${user}: its shown name could not be read for its record identity: ${String(error)}`);

    return null;
  });

  await standRecordIdentity(user, name);
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

  const titles = ownTitles(nameOf(user, await userOf(user)));

  await receiverCall(
    receiver().POST("/supervisors", {
      body: {
        name: `u${user}`,
        label: titles.label,
        room: titles.room,
        provider: road.provider,
        model: road.model,
        repository: null,
        ownerAccount: user,
        sessionScope: "agent"
      } as ReceiverComponents["schemas"]["SupervisorRequest"]
    })
  );
}

/**
 * A person's own BMO and its private room made to follow the name people read them by and the profile standing for
 * them (docs/web.md, 「The join page」 and 「A person's BMO profile on the agency and the receiver」). Only a title the
 * console made itself is followed, so a title someone chose by hand stands; `before` is the person's name until now.
 */
export async function followPersonName(user: number, before = ""): Promise<void> {
  await standOwnBmo(user, { before });
}

// The name a person is read by: their person's name, else their login, else the account's own key where the
// service does not answer the user at all.
function nameOf(user: number, person: { name: string; fullName: string } | null): string {
  if (person === null) return `u${user}`;

  return shownName(person);
}

async function standAgents(user: number): Promise<void> {
  // The agency makes them as the sign-up composition the delegation chain resolves for the person says, the platform's
  // own rule — one agent for every role with an agent of no account, on its road and settings — where nothing is set
  // (the agency's `docs/role-agents.md`, 「The agents an account is given」).
  await agencyCall(agency().POST("/composed-agents/{ownerAccount}", { params: { path: { ownerAccount: user } } }));
}
