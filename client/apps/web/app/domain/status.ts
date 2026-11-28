import { modelFace } from "~/domain/model-face";

import type { AgentMode, LiveRun, StopTarget } from "#shared/types";
import type { Translate } from "#shared/wording";

const DEPTH_LABELS: Record<string, string> = {
  basic: "common.label.depth_basic",
  thorough: "common.label.depth_thorough",
  exhaustive: "common.label.depth_exhaustive"
};

// A model as a person reads it. What is launched and what is recorded is the whole identifier; a
// screen with a model to show wears the short name instead.
//
// Only the models whose names no rule could work out stand here — a product name rather than a
// family and a generation. A Claude identifier is read by the rule the bot reads it by, so a model
// the CLI began offering an hour ago wears its own name on these screens with nothing added here.
const MODEL_LABELS: Record<string, string> = {
  "gpt-5.6-sol": "GPT-5.6 Sol",
  "gpt-5.6-terra": "GPT-5.6 Terra",
  "gpt-5.6-luna": "GPT-5.6 Luna",
  "gpt-6-astra": "GPT-6 Astra",
  "qwen3.8-27b": "Qwen3.8 27B"
};

// The labels screens that do not read the bot's provider report show: a product by its own name, and a
// provider the console names in its own words by a key into the pack. A provider missing from both is shown
// by its own name.
const MODE_NAMES: Partial<Record<AgentMode, string>> = {
  "claude-code": "Claude Code",
  codex: "Codex",
  openrouter: "OpenRouter",
  deepseek: "DeepSeek",
  anthropic: "Anthropic API"
};

const MODE_KEYS: Partial<Record<AgentMode, string>> = {
  registered: "agents.title.registry"
};

// How a run ended, in the words the archive stores. A row that was never closed and whose
// unit is gone is the last of them: it died without reporting.
const OUTCOME_LABELS: Record<string, string> = {
  done: "live.label.outcome_done",
  "work-step": "live.label.outcome_work_step",
  // A search's own word on its own answer: it came back with a result and said itself that
  // something the question needed is still missing.
  unanswered: "live.label.outcome_unanswered",
  "cut-short": "live.label.outcome_cut_short",
  stopped: "live.label.outcome_stopped",
  failed: "live.label.outcome_failed",
  "live-tasks": "live.label.outcome_live_tasks",
  unclosed: "live.label.outcome_unclosed",
  limit: "live.label.outcome_limit",
  error: "live.label.outcome_error",
  died: "live.label.outcome_died",
  blocked: "live.label.outcome_blocked"
};

const MINUTE_SECONDS = 60;

export function depthLabel(t: Translate, depth: string): string {
  const key = DEPTH_LABELS[depth];

  return key === undefined ? depth : t(key);
}

export function modelLabel(model: string): string {
  return MODEL_LABELS[model] ?? modelFace(model);
}

export function modeLabel(t: Translate, mode: AgentMode): string {
  const key = MODE_KEYS[mode];

  return key === undefined ? MODE_NAMES[mode] ?? mode : t(key);
}

export function outcomeLabel(t: Translate, outcome: string): string {
  const key = OUTCOME_LABELS[outcome];

  return key === undefined ? outcome : t(key);
}

// Seconds as a person watching them tick reads them: under a minute the seconds alone, under an
// hour minutes and seconds, past it hours as well, so a long run never reads as hundreds of minutes.
export function formatElapsed(t: Translate, seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));

  if (whole < MINUTE_SECONDS) {
    return t("common.label.seconds", { n: whole });
  }

  const minutes = Math.floor(whole / MINUTE_SECONDS);

  return minutes < 60
    ? t("common.label.minutes_seconds", { m: minutes, s: whole % MINUTE_SECONDS })
    : t("common.label.hours_minutes_seconds", { h: Math.floor(minutes / 60), m: minutes % 60, s: whole % MINUTE_SECONDS });
}

// How long something has been up, as a clock reads it: hours, minutes, seconds, each two
// digits. The hours run past 24 rather than rolling over, because what is asked is the length
// of the run and not the time of day.
export function uptimeClock(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));

  return [Math.floor(whole / 3600), Math.floor(whole / 60) % 60, whole % 60]
    .map((part) => String(part).padStart(2, "0"))
    .join(":");
}

// Where a row of this board leads. Every one of them leads to the log of the agent that ran,
// because that is the only place what a run did is written down.
export function agentLink(agent: string): string {
  return `/agents/${encodeURIComponent(agent)}`;
}

// A runner and a job each ran in a unit of their own, and the log keeps their lines under that
// name, so their rows ask for the run by name and land on it whatever the clock says.
export function unitLink(agent: string, unit: string): string {
  return `${agentLink(agent)}?run=${encodeURIComponent(unit)}`;
}

// A job's own lines, read by the job: where the screen knows the job, this is the road that reaches every turn of
// it, whichever agent did that turn's work and whether or not the run ledger holds a row for it.
export function jobLink(agent: string, jobId: number): string {
  return `${agentLink(agent)}?job=${jobId}`;
}

// A moment in an agent's log. The screen opens on the run that moment falls in, so this is how
// anything that knows when something happened — a gate's verdict, a request the cache watch
// saw — sends a reader to the lines it happened in.
export function momentLink(agent: string, at: number): string {
  return `${agentLink(agent)}?at=${at}`;
}

// What a stop on this row is aimed at, as the bot named it when it drew the picture
// (`the agency's docs/agent-control.md` 「Stopping」). Nothing here works a target out of the row's shape: the
// one place that decides a gate is reached by its execution and a runner by its unit is the bot's
// own verb. A picture drawn by a bot that did not yet name one falls back to the unit, which is
// what a run standing apart has always been stopped by, and a row with neither names nothing.
export function stopTargetOf(row: Pick<LiveRun, "stop" | "unit">): StopTarget | null {
  // Absent is an older picture, which is not the same as a row saying it has nothing to aim at:
  // one is answered with the unit, the other is taken at its word.
  return row.stop === undefined ? (row.unit === null ? null : { kind: "unit", id: row.unit }) : row.stop;
}

// Where a job ran: its repository, with the checkout beside it where that is not the repository's own name.
export function placeOf(run: { repository?: string | null; checkout?: string | null }): string | null {
  const repository = run.repository ?? null;
  const checkout = run.checkout ?? null;

  if (repository === null) return checkout;

  return checkout === null || checkout === repository ? repository : `${repository} · ${checkout}`;
}

