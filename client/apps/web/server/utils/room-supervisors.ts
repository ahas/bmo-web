import { agency, agencyCall } from "./agency";
import { receiver, receiverCall, receiverRoute } from "./receiver";

import type { RoomSupervisorOption, RoomSupervisorStanding, RoomSupervisorsView } from "#shared/types";

// The supervisors an avatar room may call (docs/web.md, the room screen's chat services): the list the room stands on
// and the ones it may still be told to call. The candidates are the supervisors the agency registers less the agents
// already standing in the room, which is the receiver's own test — the room's record holds their lines, answered as
// `standingAgents` of its registration — since an agent answering there already is no choice to make. A name the room
// carries though it stands there is left out of the candidates and kept by the row, which offers what the room holds
// beside what it may take.
//
// The room's list and its mode come from the published client; only `standingAgents` is asked on the receiver's
// address, the pack this console installs not naming it yet (docs/boundary.md, 「Gaps the console meets」). An agency
// that does not answer is a failure the row says, not an empty choice.

/** Who stands in a room, as its registration answers it: the agents whose own words its record holds. */
interface StandingRegistration {
  standingAgents?: unknown;
}

/** The names an answer holds in a list, each trimmed, none empty, none twice. */
function names(held: unknown): string[] {
  if (!Array.isArray(held)) return [];

  return [
    ...new Set(
      held
        .filter((one): one is string => typeof one === "string")
        .map((one) => one.trim())
        .filter((one) => one !== "")
    ),
  ];
}

/** The room's list of supervisors and the candidates to choose among, for the administrator who reads it. */
export async function roomSupervisors(roomId: number, by: string): Promise<RoomSupervisorsView> {
  const [room, registration, supervisors, answerers] = await Promise.all([
    receiverCall(receiver().GET("/rooms/{roomId}", { params: { path: { roomId } } })),
    receiverRoute<StandingRegistration>(`/rooms/${roomId}/registration?${new URLSearchParams({ by })}`),
    agencyCall(agency().GET("/supervisors")),
    receiverCall(receiver().GET("/rooms/{roomId}/answerers", { params: { path: { roomId } } }))
  ]);
  const labelOf = (name: string): string => supervisors.items.find((one) => one.name === name)?.label?.trim() || name;
  // The supervisors standing in the room, named or by their own accounts, as the receiver answers them.
  const standingSupervisors: RoomSupervisorStanding[] = answerers.items.map((answerer) => ({
    name: answerer.agentName,
    label: labelOf(answerer.agentName),
    named: answerer.named,
    byAccount: answerer.byAccount,
    on: answerer.on,
    voice: answerer.voice === "own-account" ? "own-account" : "owner-account"
  }));
  const standing = new Set([...names(registration.standingAgents), ...standingSupervisors.map((one) => one.name)]);
  const candidates: RoomSupervisorOption[] = [];

  for (const supervisor of supervisors.items) {
    const name = supervisor.name.trim();

    if (name === "" || standing.has(name) || candidates.some((one) => one.name === name)) continue;

    candidates.push({ name, label: supervisor.label?.trim() || name });
  }

  return { supervisors: names(room.supervisors), candidates, standing: standingSupervisors };
}
