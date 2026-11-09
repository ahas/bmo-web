import type { StopTarget } from "./types";

// The agents' space as the live status screen draws it (docs/web.md, 「Live status screen」, the space): the machines
// and the repositories, each a room, and every agent with what it is doing now, read from the node service, the
// agency and the receiver's live picture.

/** One machine: its name, the name a person reads, and whether work goes on it now. */
export interface SpaceNode {
  name: string;
  label: string;
  busy: boolean;
}

/** One repository: its name, the name a person reads, and the machine it stands on, where it names one. */
export interface SpaceRepository {
  name: string;
  label: string;
  node: string | null;
}

/** What an agent is doing now. */
export interface SpaceWork {
  // The repository it works in, by name; null for work in no repository the agency lists.
  repository: string | null;
  // The room a supervisor answers now; null for a run of a role.
  chatId: number | null;
  // What its place is called: the repository's label, a folder's last part, or the words for no place.
  place: string;
  // The line naming the work, where its asker named one.
  title: string | null;
  // Since when, in epoch milliseconds; none where it is not said.
  since: number | null;
  provider: string | null;
  model: string | null;
  // The run its log opens at, the role session it holds between turns, and what a stop of it names.
  log: string | null;
  session: string | null;
  stop: StopTarget | null;
}

/** One agent: a supervisor, which answers rooms, or an agent of a role, a seat of it. */
export interface SpaceAgent {
  name: string;
  label: string;
  // Its role; null for a supervisor.
  role: string | null;
  // Whether it is switched on; a supervisor always is.
  enabled: boolean;
  // The road its runs go out on, in words; null where it follows the supervisor that asks it.
  road: string | null;
  work: SpaceWork | null;
}

/** The whole picture: when it was read, the machines, the repositories, every agent, and how many runs of each role
 * wait for a free agent. */
export interface SpaceView {
  readAt: number;
  nodes: SpaceNode[];
  repositories: SpaceRepository[];
  agents: SpaceAgent[];
  waiting: { role: string; count: number }[];
}
