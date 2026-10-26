// A tool call as the log draws it (docs/web.md, 「A tool call」 under 「Agent screen」): its top line, the command it
// stands as under a prompt of oh-my-zsh's pure theme, and how its result is coloured. Nothing here is the call's raw
// JSON: every value is read out of it and written as the call's own words.

import { mcpCallOf } from "#shared/mcp-names";

// How many lines of a result always stand; the rest folds.
export const RESULT_SHOWN_LINES = 5;

// The arguments of a call, each value as it was sent: a string as it stands, anything else as indented JSON.
export function callArguments(text: string): Map<string, string> {
  const fields = new Map<string, string>();

  try {
    const parsed: unknown = JSON.parse(text);

    if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
      for (const [key, value] of Object.entries(parsed)) {
        fields.set(key, typeof value === "string" ? value : JSON.stringify(value, null, 2));
      }
    }
  } catch {
    // A call the writer cut leaves an unclosed JSON; it is read as no arguments and stands by its name alone.
  }

  return fields;
}

// The argument that names what a call is about, by the field it is sent in: the file, the pattern, the address, the
// instruction. A tool that sends none of them is told by its other arguments.
const KEY_FIELDS = ["file_path", "notebook_path", "pattern", "url", "query", "prompt", "command", "skill", "path", "name"] as const;

// The call's own account of itself.
const DESCRIPTION_FIELDS = ["description", "reason"] as const;

/** The tool a call is, an MCP tool by its name without its server. */
export function toolName(name: string | null): string {
  return mcpCallOf(name)?.tool ?? name ?? "";
}

/** A shell tool, which every road names by the word for a shell. */
export function isShell(name: string | null): boolean {
  return /^(bash|shell|sh|exec_command|local_shell)$/i.test(toolName(name));
}

// One line of a value, its runs of space levelled, for a top line.
function oneLine(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

/** The top line of a call: its description, or its tool and its key argument where it came with none. */
export function callTopLine(name: string | null, text: string): string {
  const fields = callArguments(text);
  const told = DESCRIPTION_FIELDS.map((key) => fields.get(key) ?? "").find((value) => value.trim() !== "");

  if (told !== undefined) return oneLine(told);

  const key = KEY_FIELDS.map((field) => fields.get(field) ?? "").find((value) => value.trim() !== "") ?? "";

  return [toolName(name), oneLine(key)].filter((part) => part !== "").join(" ");
}

/** The command a call stands as: a shell call's command line, any other tool's call written as a command — its name
 * and its arguments, each value as it was sent. The description is the top line's and is not repeated. */
export function callCommand(name: string | null, text: string): string {
  const fields = callArguments(text);

  if (isShell(name) && fields.has("command")) return fields.get("command") ?? "";

  const rest = [...fields].filter(([key]) => !(DESCRIPTION_FIELDS as readonly string[]).includes(key));
  const lead = toolName(name);
  const keyed = KEY_FIELDS.find((field) => fields.has(field));
  const parts = rest.map(([key, value]) => (key === keyed ? quoted(value) : `${key}=${quoted(value)}`));

  return [lead, ...parts].join(" ");
}

// A value as a command line writes it: bare where it is one word, quoted where it carries a space and stands on one
// line, and as it stands where it runs over several lines.
function quoted(value: string): string {
  if (value.includes("\n") || !/\s/.test(value)) return value;

  return `"${value.replace(/"/g, '\\"')}"`;
}

/** The extension a path ends in, lower-cased, or null. */
export function extensionOf(path: string): string | null {
  const name = path.slice(path.lastIndexOf("/") + 1);
  const dot = name.lastIndexOf(".");

  return dot <= 0 || dot === name.length - 1 ? null : name.slice(dot + 1).toLowerCase();
}

// A shell command that reads one file and nothing else: the reader, its options, the one path.
const SINGLE_FILE_READ = /^\s*(?:cat|head|tail|less|more|bat|nl|sed\s+-n\s+(?:'[^']*'|"[^"]*"|\S+))(?:\s+-[\w-]+(?:\s+\d+)?)*\s+(['"]?)([^\s|;&<>'"]+)\1\s*$/;

/** The file a shell command reads, where it reads one file alone. */
export function singleFileRead(command: string): string | null {
  return SINGLE_FILE_READ.exec(command)?.[2] ?? null;
}

// A search, by its tool or by the shell program it runs.
const SEARCH_TOOLS = /^(grep|glob|rg|ripgrep|search)$/i;
const SHELL_SEARCH = /^\s*(?:rg|grep|git\s+grep)\b/;

/** How a result is coloured: in one language, line by line by each line's path, or not at all. */
export type ResultLook = { kind: "language"; word: string } | { kind: "lines" } | { kind: "plain" };

/** The look of a call's result, by the target the call names first and by what the text is only where it names
 * none. */
export function resultLook(name: string | null, text: string, result: string): ResultLook {
  const fields = callArguments(text);
  const tool = toolName(name);
  const command = isShell(name) ? (fields.get("command") ?? "") : "";

  if (SEARCH_TOOLS.test(tool) || SHELL_SEARCH.test(command)) return { kind: "lines" };

  const file = isShell(name) ? singleFileRead(command) : (fields.get("file_path") ?? fields.get("notebook_path") ?? null);
  const extension = file === null ? null : extensionOf(file);

  if (extension !== null) return { kind: "language", word: extension };

  const content = contentLanguage(result);

  return content === null ? { kind: "plain" } : { kind: "language", word: content };
}

/** What a text is by its content alone: JSON, a diff or a shell session, or nothing known. */
export function contentLanguage(text: string): string | null {
  const trimmed = text.trim();

  if ((trimmed.startsWith("{") || trimmed.startsWith("[")) && parses(trimmed)) return "json";
  if (/^(diff --git |--- |@@ )/m.test(trimmed) && /^[+-]/m.test(trimmed)) return "diff";
  if (/^(#!.*\b(ba|z)?sh\b|\$ )/.test(trimmed)) return "shell";

  return null;
}

function parses(text: string): boolean {
  try {
    JSON.parse(text);

    return true;
  } catch {
    return false;
  }
}

/** One line of a search's result: the path, the line number where it carries one, and the text, each coloured apart;
 * a line that names no path is text alone. */
export interface SearchLine {
  path: string | null;
  number: string | null;
  text: string;
  word: string | null;
}

const SEARCH_LINE = /^([^\s:][^:]*?):(\d+)?:?(.*)$/;

export function searchLines(result: string): SearchLine[] {
  return result.split("\n").map((line) => {
    const found = SEARCH_LINE.exec(line);
    const path = found?.[1] ?? null;

    if (found === null || path === null || extensionOf(path) === null) return { path: null, number: null, text: line, word: null };

    return { path, number: found[2] ?? null, text: found[3] ?? "", word: extensionOf(path) };
  });
}

/** A result's lines split into what always stands and what folds. */
export function resultParts(result: string): { shown: string; hidden: string; hiddenCount: number } {
  const lines = result.replace(/\n$/, "").split("\n");

  if (lines.length <= RESULT_SHOWN_LINES) return { shown: lines.join("\n"), hidden: "", hiddenCount: 0 };

  return {
    shown: lines.slice(0, RESULT_SHOWN_LINES).join("\n"),
    hidden: lines.slice(RESULT_SHOWN_LINES).join("\n"),
    hiddenCount: lines.length - RESULT_SHOWN_LINES
  };
}

/** One step of a plan a session laid out with its plan tool: its words and its state. */
export interface PlanStep {
  title: string;
  state: "pending" | "running" | "done";
}

// A plan's step status, as the plan tools write it.
function planState(status: unknown): PlanStep["state"] {
  if (status === "completed" || status === "done") return "done";
  if (status === "in_progress" || status === "running") return "running";

  return "pending";
}

/** The plan a call lays out, where its arguments carry a list of steps each with its words and its status: Claude
 * Code's `todos` of `content`, Codex's `plan` of `step`. Read by that shape, never by the tool's name. */
export function planOf(text: string): PlanStep[] | null {
  let parsed: unknown;

  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }

  if (parsed === null || typeof parsed !== "object") return null;

  const held = parsed as Record<string, unknown>;
  const list = Array.isArray(held.todos) ? held.todos : Array.isArray(held.plan) ? held.plan : null;

  if (list === null || list.length === 0) return null;

  const steps = list.flatMap((one): PlanStep[] => {
    if (one === null || typeof one !== "object") return [];

    const step = one as Record<string, unknown>;
    const title = [step.content, step.step, step.title].find((value) => typeof value === "string" && value.trim() !== "");

    return typeof title === "string" && "status" in step ? [{ title: title.trim(), state: planState(step.status) }] : [];
  });

  return steps.length === list.length ? steps : null;
}
