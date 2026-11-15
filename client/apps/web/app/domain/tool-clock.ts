// A tool call's clock as the log draws it (docs/web.md, 「A call's clock lines are no line of the log either」): every
// note the agency's call clock wrote of one call folded into one view of that call — when it began, whether it still
// runs, what the supervisor was asked and decided, and how it ended — read off the fields the notes carry, never off
// their words.

import { shellTokens } from "./shell-colour";
import { callArguments, isShell, toolName } from "./tool-view";

import type { AgentLogClock, AgentLogLine } from "#shared/types";

// A call running at least this long wears the quiet mark of a long one.
export const LONG_CALL_SECONDS = 600;

// How a call stands: running, ended as its result said, ended with the turn that held it, or cut.
export type ToolClockState = "running" | "completed" | "failed" | "ended-with-turn" | "cut";

// One thing the supervisor's side said of the call while it ran, at its moment.
export interface ToolClockMoment {
  at: number;
  event: "asked" | "kept" | "ask-failed";
  // How long an asked call had written nothing and stood idle.
  silentMs: number | null;
  // Until when a kept call is kept, in unix seconds.
  until: number | null;
  why: string | null;
}

export interface ToolClockView {
  key: string;
  tool: string;
  command: string;
  call: string | null;
  pid: number | null;
  // When the call began, in unix seconds, as the newest note that said how long it had run puts it.
  startedAt: number | null;
  state: ToolClockState;
  // How long it ran, once it is over.
  tookMs: number | null;
  cut: AgentLogClock["cut"];
  // The supervisor's reason for a cut.
  why: string | null;
  moments: ToolClockMoment[];
}

/** Which call a clock note is of: the call's id, or where the note carries none, its run, tool and command. */
export function clockKey(line: Pick<AgentLogLine, "run">, clock: AgentLogClock): string {
  return clock.call ?? `${line.run}\u0000${clock.tool}\u0000${clock.command}`;
}

export function newClock(key: string, clock: AgentLogClock): ToolClockView {
  return {
    key,
    tool: clock.tool,
    command: clock.command,
    call: clock.call,
    pid: clock.pid,
    startedAt: null,
    state: "running",
    tookMs: null,
    cut: null,
    why: null,
    moments: []
  };
}

/** One note folded into its call's clock: a later note says more of the same call, never less. */
export function foldClock(view: ToolClockView, line: Pick<AgentLogLine, "at">, clock: AgentLogClock): void {
  if (clock.pid !== null) view.pid = clock.pid;
  if (view.command === "") view.command = clock.command;
  if (clock.elapsedMs !== null && view.state === "running") view.startedAt = line.at - clock.elapsedMs / 1000;

  switch (clock.event) {
    case "asked":
      view.moments.push({ at: line.at, event: "asked", silentMs: clock.silentMs, until: null, why: null });
      break;
    case "kept":
      view.moments.push({ at: line.at, event: "kept", silentMs: null, until: clock.keptMs === null ? null : line.at + clock.keptMs / 1000, why: null });
      break;
    case "ask-failed":
      view.moments.push({ at: line.at, event: "ask-failed", silentMs: null, until: null, why: clock.why });
      break;
    case "cut":
      view.state = "cut";
      view.cut = clock.cut;
      view.why = clock.why;
      view.tookMs = clock.elapsedMs;
      break;
    case "ended":
      // A cut call ends too, and stays told by what cut it; its end only says how long it stood.
      if (view.state !== "cut") view.state = clock.outcome ?? "completed";
      view.tookMs = clock.elapsedMs ?? view.tookMs;
      break;
    default:
      break;
  }
}

/** A call whose result came back, or whose run ended, before the clock said it ended: settled there. */
export function settleClock(view: ToolClockView, state: Exclude<ToolClockState, "running" | "cut">, at: number): void {
  if (view.state !== "running") return;

  view.state = state;
  view.tookMs = view.startedAt === null ? null : Math.max(0, (at - view.startedAt) * 1000);
}

// A note that carries no call id is the call of the same run and tool whose arguments open with the note's summary:
// the clock writes a call's command, or the field that says what the call was given, levelled to one line and cut.
export function clockFitsCall(line: Pick<AgentLogLine, "run" | "name" | "text">, run: string, clock: Pick<AgentLogClock, "tool" | "command">): boolean {
  if (line.run !== run || line.name !== clock.tool) return false;
  if (clock.command === "") return true;

  return [...callArguments(line.text).values()].some((value) => level(value).startsWith(clock.command));
}

function level(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** What a command amounts to on one line, and whether it is a loop's. */
export interface CommandGist {
  text: string;
  loop: boolean;
}

// The words that join or end one simple command of a line.
const BREAKS = new Set([";", "&&", "||", "&", "|&"]);
// The keywords a loop opens with; `while` and `until` carry the command the loop waits on.
const LOOP_OPENERS = new Set(["for", "while", "until"]);
const CONDITION_OPENERS = new Set(["while", "until", "if", "elif"]);
// The keywords that lead into a command or close a block.
const LEADS = new Set(["do", "then", "else", "{", "("]);
const CLOSERS = new Set(["done", "fi", "}", ")", "esac"]);
// The commands that only set the stage for the next one: where it runs and how the shell behaves.
const STAGING = new Set(["cd", "pushd", "set"]);
// A redirection, which says where output goes and not what the command does.
const REDIRECT = /^(?:\d?>>?|&>>?|\d?>&\d?|<|<<<)$/;
const ASSIGNMENT = /^([A-Za-z_]\w*)=(.*)$/s;
const VARIABLE = /^"?\$(?:\{([A-Za-z_]\w*)\}|([A-Za-z_]\w*))"?$/;

type Word = { text: string; operator: boolean };

// The line's words in order, as the console's shell colouring reads them: an operator or keyword as itself, and every
// other run of characters up to a space as one word, a quoted stretch inside it kept whole.
function wordsOf(command: string): Word[] {
  const words: Word[] = [];
  let word = "";
  const flush = (): void => {
    if (word !== "") words.push({ text: word, operator: false });
    word = "";
  };

  for (const token of shellTokens(command)) {
    if (token.part === "comment") continue;

    if (token.part === "operator") {
      flush();
      words.push({ text: token.text, operator: true });
      continue;
    }

    if (token.part === "string" || token.part === "variable") {
      word += token.text;
      continue;
    }

    for (const piece of token.text.split(/(\s+)/)) {
      if (piece === "") continue;

      if (/^\s+$/.test(piece)) {
        flush();
        if (piece.includes("\n")) words.push({ text: ";", operator: true });
      } else {
        word += piece;
      }
    }
  }

  flush();

  return words;
}

// The simple commands of a line, each its words, split where one command ends and the next begins; a command
// substitution stays inside the command it stands in.
function commandsOf(words: Word[]): Word[][] {
  const commands: Word[][] = [[]];
  let nested = 0;

  for (const word of words) {
    if (word.operator && word.text === "$(") nested += 1;
    else if (word.operator && word.text === ")" && nested > 0) nested -= 1;
    else if (word.operator && word.text === "`") nested += nested > 0 ? -1 : 1;

    if (nested === 0 && word.operator && BREAKS.has(word.text)) {
      commands.push([]);
      continue;
    }

    commands.at(-1)!.push(word);
  }

  return commands.filter((one) => one.length > 0);
}

// A command's words written back as one line, a command substitution closed up as it is typed.
function written(words: Word[]): string {
  return words
    .map((word) => word.text)
    .join(" ")
    .replace(/\$\( /g, "$(")
    .replace(/ \)/g, ")");
}

// A path held in a variable reads as its file's name, the part of it a reader recognises.
function shown(value: string): string {
  const bare = value.replace(/^(['"])(.*)\1$/s, "$2");

  return bare.includes("/") ? (bare.split("/").filter((part) => part !== "").at(-1) ?? bare) : bare;
}

/**
 * A shell command reduced to the one command that says what it does (docs/web.md, 「A call's clock lines are no line
 * of the log either」): the variables it opens by assigning set aside, the keywords of a loop or a condition taken
 * off, a loop's pause skipped, its redirections dropped, and a variable holding a path written as that file's name.
 * It is read over the console's own reading of a shell line, the one its colouring uses, since what is asked here is
 * how a person reads the line and not how a shell would run it; a line it can make nothing of stands levelled whole.
 */
export function commandGist(command: string): CommandGist {
  const held = new Map<string, string>();
  let loop = false;

  for (const words of commandsOf(wordsOf(command))) {
    let rest = [...words];

    // The keywords that open, lead into or close a block are no part of the command.
    for (;;) {
      const first = rest[0];

      if (first === undefined) break;

      if (first.operator && (LEADS.has(first.text) || CLOSERS.has(first.text))) {
        rest = rest.slice(1);
      } else if (first.operator && first.text === "for") {
        loop = true;
        rest = [];
      } else if (first.operator && CONDITION_OPENERS.has(first.text)) {
        loop ||= LOOP_OPENERS.has(first.text);
        rest = rest.slice(1);
      } else if (!first.operator && first.text === "!") {
        rest = rest.slice(1);
      } else {
        break;
      }
    }

    // The variables a command opens by assigning are kept to read it by, and a line of nothing else says nothing.
    while (rest[0] !== undefined && !rest[0].operator && ASSIGNMENT.test(rest[0].text)) {
      const [, name, value] = ASSIGNMENT.exec(rest[0].text)!;

      held.set(name!, value!);
      rest = rest.slice(1);
    }

    while (rest.length > 0 && rest.at(-1)!.operator && CLOSERS.has(rest.at(-1)!.text)) rest = rest.slice(0, -1);

    if (rest.length === 0 || STAGING.has(rest[0]!.text)) continue;
    // A loop's pause is how it waits, not what it waits on.
    if (loop && rest[0]!.text === "sleep") continue;

    const kept: Word[] = [];

    for (let index = 0; index < rest.length; index += 1) {
      const word = rest[index]!;

      if (word.operator && REDIRECT.test(word.text)) {
        // A redirection onto another stream carries its target; any other takes the word after it.
        if (!/&\d$/.test(word.text) && rest[index + 1]?.operator === false) index += 1;

        continue;
      }

      const variable = word.operator ? null : VARIABLE.exec(word.text);
      const name = variable?.[1] ?? variable?.[2];

      kept.push(name !== undefined && held.has(name) ? { text: shown(held.get(name)!), operator: false } : word);
    }

    if (kept.length > 0) return { text: written(kept), loop };
  }

  return { text: level(command), loop: false };
}

/** The one line a call stands as on a row of its own: its tool, and a shell command's gist or any other call's
 * summary. */
export function clockTopLine(view: Pick<ToolClockView, "tool" | "command">): CommandGist {
  const gist = isShell(view.tool) ? commandGist(view.command) : { text: view.command, loop: false };

  return { text: [toolName(view.tool), gist.text].filter((part) => part !== "").join(" "), loop: gist.loop };
}
