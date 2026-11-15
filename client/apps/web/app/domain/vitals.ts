import { toolFace } from "./spans";

import type { AgentMode, AgentTokenUsage, ChatCompaction, LiveRun, LiveRunKind, RunProgress } from "#shared/types";
import type { Translate } from "#shared/wording";

// What one agent of the home screen has to show of itself. Every figure is nullable and every
// null is meant: it says the machine writes that figure down nowhere for this agent, and the
// screen leaves the place empty rather than printing a nought it never measured.
export interface AgentVitals {
  mode: AgentMode | null;
  // The model this agent last ran on, as the bot records it. Every kind of agent has one.
  model: string | null;
  // What it was carrying, in tokens. A room's session says what it held when it last answered;
  // a runner and an editor keep no session at all, so what they say is the size their last run
  // ended at — not something they are holding now, but what there is to read about how much one
  // of their runs carries. Anything the machine writes no figure down for says nothing: a gate,
  // which reports none, and an agent that has not run since it began being written down.
  contextTokens: number | null;
  // What it has burnt over the week, as the whole row the archive answers with rather than one
  // number off it. The row carries the four kinds apart as well as their sum, and it takes all of
  // them because each kind stands under its own name on the screen, and because a row the kinds
  // cannot account for has to be able to say so. An agent with no row inside the window has no
  // figure at all.
  usage: AgentTokenUsage | null;
  // What it is doing at this second, in the owner's words, and since when. There is no record
  // anywhere of when a session began, so what is counted is the run that is going right now;
  // an agent that is not running has no uptime to show and shows none.
  work: AgentWork | null;
}

export interface AgentWork {
  label: string;
  since: number;
}

// A chat session's own turn, as the bot's stream tells it: when it began, and where it stands.
// The progress is null until the first word of it arrives, which is where every turn begins.
export interface ChatTurn {
  startedAt: number;
  progress: RunProgress | null;
}

export interface VitalsInput {
  // The bot's own name for the agent, and the room it serves where it serves one. Those two are
  // the whole of what is needed to find it in each picture; the rest of the catalogue — what it
  // is called, what it wears — belongs to whoever is drawing the row.
  name: string;
  chatId: number | null;
  // The repository a job worker's line stands for, whose runs are filed under the agent each job's item named and
  // are found by the repository they run in instead; null for every other agent.
  repository?: string | null;
  // What the bot says of this agent — its model and its context. Absent while the bot is down,
  // and then neither figure is known.
  model: string | null;
  mode?: AgentMode | null;
  contextTokens: number | null;
  usage: AgentTokenUsage | null;
  live: LiveRun[];
  compacting: ChatCompaction[];
  turn: ChatTurn | null;
}

// What each kind of run reads as. A gate is judging, a runner is out searching — the browser
// searcher no less than the plain one — an editor is putting the documents in order, and the
// worker is at the job.
const RUN_WORDS: Record<LiveRunKind, string> = {
  gate: "agents.status.run_gate",
  runner: "agents.status.run_runner",
  worker: "agents.status.run_worker"
};

// Where a chat's own turn stands, in the words the room uses shortened to fit a row. A turn
// that has not said anything of itself yet is thinking: that is where the CLI starts. A tool is
// named by the word a person calls it by, as it is in the room, and never by the name the
// program calls it: this row and that line say one state and say it the same way.
export function turnWord(t: Translate, progress: RunProgress | null): string {
  if (progress === null || progress.phase === "thinking") {
    return t("agents.status.turn_thinking");
  }

  if (progress.phase === "writing") {
    return t("agents.status.turn_writing");
  }

  if (progress.phase === "waiting") {
    return t("agents.status.turn_waiting_engine");
  }

  return progress.tool === null ? t("agents.status.turn_tool") : t("agents.status.turn_tool_named", { tool: toolFace(t, progress.tool) });
}

// What this agent is doing at this second, or nothing. Only what the machine actually writes
// down reaches here. A gate, a runner, an editor and the worker are in the bot's live picture,
// which is settled against their own units; a chat session's turn and the folding of its context
// happen inside the bot and reach a screen as the bot's own word for them. An agent that is not
// in any of those shows nothing at all — a guessed state would be worse than none.
export function agentWork(t: Translate, input: VitalsInput): AgentWork | null {
  if (input.chatId !== null) {
    const fold = input.compacting.find((chat) => chat.chatId === input.chatId);

    if (fold !== undefined) {
      return { label: t("agents.status.compacting"), since: fold.since };
    }

    return input.turn === null ? null : { label: turnWord(t, input.turn.progress), since: input.turn.startedAt };
  }

  // A repository's line is at work while any job runs in it, since the one that started first.
  const repository = input.repository ?? null;

  if (repository !== null) {
    const first = input.live
      .filter((one) => one.kind === "worker" && one.repository === repository)
      .reduce<LiveRun | null>((earliest, one) => (earliest === null || one.startedAt < earliest.startedAt ? one : earliest), null);

    return first === null ? null : { label: t(RUN_WORDS.worker), since: first.startedAt };
  }

  // Every other agent stands under its own name, and one of them runs at a time.
  const run = input.live.find((one) => one.agent === input.name);

  return run === undefined ? null : { label: t(RUN_WORDS[run.kind]), since: run.startedAt };
}

export function agentVitals(t: Translate, input: VitalsInput): AgentVitals {
  // Nothing is worked out here from what an agent is: which figures it has is the archive's
  // answer, agent by agent, and an agent nothing was ever written down about comes back empty of
  // its own accord. Deciding it here instead would be a second opinion, and it would go stale.
  return {
    mode: input.mode ?? null,
    model: input.model,
    contextTokens: input.contextTokens,
    usage: input.usage,
    work: agentWork(t, input)
  };
}
