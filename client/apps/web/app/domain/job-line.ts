import { POLL_INTERVAL_MS } from "#shared/config";
import { spanClock } from "bmo-ui/app/domain/time";

import { TURN_ENDED, useLiveRefresh } from "./events";
import { countText } from "./numbers";
import { usePolling } from "./polling";
import { uptimeClock } from "./status";
import { tokenText, totalText } from "./usage";

import type { JobLine, JobPrompt, TokenSplit } from "#shared/types";
import type { Translate } from "#shared/wording";
import type { Ref } from "vue";

// A worker's job as the foot of its screen shows it, the way the CLI's own status line does: which
// item, how long, how many tool calls, and the tokens it wrote — the one figure a run's chip reads —
// folded into one line, with every model's four kinds in its spread (docs/web.md, 「Agent screen」).

// What a figure reads where nothing was measured.
const NOTHING = "—";

// How long a job took: seconds under a minute, minutes and seconds under an hour, a clock beyond.
function durationText(t: Translate, ms: number): string {
  if (!Number.isFinite(ms)) return NOTHING;
  const seconds = Math.round(ms / 1000);

  if (seconds < 60) return t("common.label.seconds", { n: seconds });
  if (seconds >= 3600) return spanClock(t, seconds);
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;

  return rest === 0 ? t("common.label.minutes", { m: minutes }) : t("common.label.minutes_seconds", { m: minutes, s: rest });
}

export interface JobModelLine {
  model: string;
  total: string;
  tally: TokenSplit & { tokens: number };
}

export interface JobLineView {
  running: boolean;
  todoId: number | null;
  // The item's title, the purpose of a job with none, or the run's own name.
  title: string;
  time: string;
  tools: string;
  written: string;
  models: JobModelLine[];
}

function tallyOf(split: TokenSplit): TokenSplit & { tokens: number } {
  return {
    ...split,
    tokens: (split.inputTokens ?? 0) + (split.outputTokens ?? 0) + (split.cacheReadTokens ?? 0) + (split.cacheWriteTokens ?? 0)
  };
}

// The tokens the job wrote, every model's together, or a dash where no model said what it wrote.
function writtenText(models: JobLine["models"]): string {
  const written = models.filter((model) => model.outputTokens !== null);

  return written.length === 0 ? NOTHING : tokenText(written.reduce((sum, model) => sum + (model.outputTokens ?? 0), 0));
}

export function jobLineView(t: Translate, job: JobLine, now: number): JobLineView {
  const running = job.finishedAt === null;

  return {
    running,
    todoId: job.todoId,
    title: job.title ?? job.purpose ?? job.run,
    time: running
      ? t("agents.label.job_running", { time: uptimeClock(now - job.startedAt) })
      : t("agents.label.job_took", { time: durationText(t, (job.finishedAt! - job.startedAt) * 1000) }),
    tools: t("agents.label.job_tools", { n: countText(job.tools) }),
    written: writtenText(job.models),
    models: job.models.map((model) => {
      const tally = tallyOf(model);

      return { model: model.model, total: totalText(t, tally), tally };
    })
  };
}

// The prompt of the job the line shows, asked each time the line is spread and again when it comes
// to speak of another job, never on the poll: the Korean of a prompt handed over in English lands
// beside the job's first turn, and spreading the line again is what shows it.
export function useJobPrompt(
  agent: string,
  run: Readonly<Ref<string | null>>,
  open: Readonly<Ref<boolean>>
): { prompt: Ref<JobPrompt | null>; loaded: Ref<boolean>; failed: Ref<boolean> } {
  const prompt = ref<JobPrompt | null>(null);
  const loaded = ref(false);
  const failed = ref(false);

  async function read(asked: string): Promise<void> {
    try {
      const answer = await $fetch<{ prompt: JobPrompt | null }>(`/api/agents/${encodeURIComponent(agent)}/job-prompt`, { query: { run: asked } });

      if (run.value === asked) {
        prompt.value = answer.prompt;
        failed.value = false;
        loaded.value = true;
      }
    } catch {
      if (run.value === asked) {
        failed.value = true;
        loaded.value = true;
      }
    }
  }

  if (import.meta.client) {
    watch([run, open], ([now, spread], [before]) => {
      if (now !== before) {
        prompt.value = null;
        loaded.value = false;
        failed.value = false;
      }

      if (spread && now !== null) void read(now);
    });
  }

  return { prompt, loaded, failed };
}

// The job a worker's screen keeps its line for, read again on the poll and whenever a turn ends. A
// question that failed leaves the line as it stood: it is beside the log, not part of it.
export function useJobLine(agent: string, run: Readonly<Ref<string | null>>): { job: Ref<JobLine | null>; loaded: Ref<boolean> } {
  const job = ref<JobLine | null>(null);
  const loaded = ref(false);

  async function read(): Promise<void> {
    try {
      const answer = await $fetch<{ job: JobLine | null }>(`/api/agents/${encodeURIComponent(agent)}/job`, {
        query: run.value === null ? {} : { run: run.value }
      });

      job.value = answer.job;
    } catch {
      return;
    } finally {
      loaded.value = true;
    }
  }

  if (import.meta.client) {
    watch(run, () => void read(), { immediate: true });
  }

  usePolling(() => void read(), POLL_INTERVAL_MS);
  // A worker's turns are the agency's, so its job starting and ending is heard as an agency turn.
  useLiveRefresh(() => void read(), { on: [...TURN_ENDED, "agency-turn"], everyMs: POLL_INTERVAL_MS });

  return { job, loaded };
}
