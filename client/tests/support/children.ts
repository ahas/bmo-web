// The processes a harness starts and stands on, watched (docs/checks.md, 「Running the console-driven browser
// files」): each heads a process group of its own, so stopping it stops what it started, and what it says goes to a
// log of its own. One that ends while the harness has not asked it to is told to the harness by its name, so the
// harness stops the rest instead of standing on a process that is gone.

import { spawn, type ChildProcess } from "node:child_process";
import { appendFileSync } from "node:fs";

/** How a watched process ended: its exit code, or the signal that ended it. */
export interface Ended {
  name: string;
  code: number | null;
  signal: NodeJS.Signals | null;
}

/** One process to start: its command line, where it runs, what it is told, and the log it writes. */
export interface Started {
  command: string;
  args: string[];
  cwd: string;
  env: Record<string, string>;
  log: string;
  name: string;
}

/** How long a stopped process is given to end on a terminate before it is killed. */
const STOP_GRACE_MS = 1500;

export class WatchedChildren {
  private readonly started: ChildProcess[] = [];
  private readonly running = new Set<ChildProcess>();
  private stopping = false;

  /** `ended` hears of a process that ended before the harness asked it to stop. */
  constructor(private readonly ended: (what: Ended) => void) {}

  start(one: Started): ChildProcess {
    const child = spawn(one.command, one.args, { cwd: one.cwd, env: { ...process.env, ...one.env }, detached: true, stdio: ["ignore", "pipe", "pipe"] });

    child.stdout?.on("data", (chunk) => appendFileSync(one.log, chunk));
    child.stderr?.on("data", (chunk) => appendFileSync(one.log, chunk));
    this.started.push(child);
    this.running.add(child);
    child.once("exit", (code, signal) => {
      this.running.delete(child);

      if (!this.stopping) this.ended({ name: one.name, code, signal });
    });

    return child;
  }

  /**
   * Stops every group a process was started at the head of, terminated first and killed once the grace has passed.
   * A group whose head has ended is signalled too, since what the head started may outlive it.
   */
  async stop(graceMs = STOP_GRACE_MS): Promise<void> {
    this.stopping = true;

    const left = [...this.running.keys()];
    const gone = Promise.all(left.map((child) => new Promise<void>((resolve) => child.once("exit", () => resolve()))));

    for (const child of this.started) signalGroup(child, "SIGTERM");
    await Promise.race([gone, Bun.sleep(graceMs)]);
    for (const child of this.started) signalGroup(child, "SIGKILL");
    await gone;
  }
}

// A signal to the group the process heads, which is gone once every process in it has ended.
function signalGroup(child: ChildProcess, signal: NodeJS.Signals): void {
  try {
    process.kill(-child.pid!, signal);
  } catch {
    // Already gone.
  }
}
