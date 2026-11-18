import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { WatchedChildren, type Ended } from "./support/children";

// The browser harness's watched processes (docs/checks.md, 「Running the console-driven browser files」): one that
// ends while the harness stands is told by its name, the rest are stopped with what each started, and one the harness
// itself stops is told to nobody.

const scratch = mkdtempSync(join(tmpdir(), "bmo-web-children-"));
let watched: WatchedChildren | null = null;

afterEach(async () => {
  await watched?.stop(200);
  watched = null;
});

process.on("exit", () => rmSync(scratch, { recursive: true, force: true }));

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);

    return true;
  } catch {
    return false;
  }
}

// A process that stands until it is stopped.
function standing(name: string) {
  return { command: "sleep", args: ["30"], cwd: scratch, env: {}, log: join(scratch, `${name}.log`), name };
}

describe("the harness's watched processes", () => {
  test("one that ends is told by its name, and stopping ends the rest", async () => {
    let told: (what: Ended) => void = () => {};
    const ended = new Promise<Ended>((resolve) => (told = resolve));

    watched = new WatchedChildren((what) => told(what));

    const server = watched.start(standing("server"));
    const devServer = watched.start(standing("console"));

    process.kill(-devServer.pid!, "SIGKILL");
    expect(await ended).toEqual({ name: "console", code: null, signal: "SIGKILL" });
    expect(alive(server.pid!)).toBe(true);

    await watched.stop(200);
    expect(server.exitCode !== null || server.signalCode !== null).toBe(true);
  });

  test("what an ended process started is stopped with the rest", async () => {
    const pidFile = join(scratch, "left.pid");
    let told: (what: Ended) => void = () => {};
    const ended = new Promise<Ended>((resolve) => (told = resolve));

    watched = new WatchedChildren((what) => told(what));
    watched.start({ command: "sh", args: ["-c", `sleep 30 & echo $! > ${pidFile}; exit 3`], cwd: scratch, env: {}, log: join(scratch, "head.log"), name: "head" });

    expect(await ended).toEqual({ name: "head", code: 3, signal: null });
    expect(existsSync(pidFile)).toBe(true);

    const left = Number(readFileSync(pidFile, "utf8").trim());

    expect(alive(left)).toBe(true);
    await watched.stop(200);

    // The killed process is reaped by whoever inherited it; a bounded wait on its going.
    for (let tries = 0; tries < 50 && alive(left); tries += 1) await Bun.sleep(20);
    expect(alive(left)).toBe(false);
  });

  test("a process the harness stops is told to nobody", async () => {
    const told: Ended[] = [];

    watched = new WatchedChildren((what) => told.push(what));

    const one = watched.start(standing("server"));

    await watched.stop(200);
    expect(one.signalCode).toBe("SIGTERM");
    expect(told).toEqual([]);
  });
});
