import { describe, expect, test } from "bun:test";

import { buildLog } from "../../../apps/web/app/domain/log";
import { clockTopLine, commandGist } from "../../../apps/web/app/domain/tool-clock";

import type { AgentLogClock, AgentLogKind, AgentLogLine } from "../../../apps/web/shared/types";

// The command a waiting job's call ran: a long path held in a variable, and a loop that polls a file for a line.
const POLL =
  "F=/tmp/claude-1/-work/scratchpad/r3041/ask.out; for i in $(seq 1 240); do grep -q '^exit' \"$F\" 2>/dev/null && break; sleep 15; done; cat \"$F\"";
// The same command as the clock keeps it: levelled to one line and cut at its length.
const POLL_SUMMARY = POLL.slice(0, 80);

function line(id: number, kind: AgentLogKind, at: number, fields: Partial<AgentLogLine> = {}): AgentLogLine {
  return {
    id,
    agent: "worker",
    run: "job-1",
    chatId: null,
    at,
    kind,
    name: null,
    tool: null,
    parent: null,
    ref: null,
    state: null,
    truncated: false,
    text: "",
    patches: [],
    patchesMore: 0,
    ...fields
  };
}

function clock(event: AgentLogClock["event"], fields: Partial<AgentLogClock> = {}): AgentLogClock {
  return {
    event,
    call: "t1",
    tool: "Bash",
    command: POLL_SUMMARY,
    pid: 4242,
    elapsedMs: null,
    silentMs: null,
    keptMs: null,
    why: null,
    cut: null,
    outcome: null,
    ...fields
  };
}

function note(id: number, at: number, fields: AgentLogClock): AgentLogLine {
  return line(id, "note", at, { text: "the clock's sentence", clock: fields });
}

const CALL = line(1, "tool", 1_000, { name: "Bash", ref: "t1", text: JSON.stringify({ command: POLL }) });

describe("commandGist", () => {
  test("a long path held in a variable and a polling loop read as the wait they are", () => {
    expect(commandGist(POLL)).toEqual({ text: "grep -q '^exit' ask.out", loop: true });
  });

  test("the clock's cut summary of the same command reads the same, as far as it goes", () => {
    expect(commandGist("F=/tmp/a/b/ask.out; for i in $(seq 1 240); do grep -q '^exit")).toEqual({ text: "grep -q '^exit", loop: true });
  });

  test("a while loop is told by the command it waits on", () => {
    expect(commandGist("until curl -sf http://localhost:8080/health; do sleep 2; done")).toEqual({
      text: "curl -sf http://localhost:8080/health",
      loop: true
    });
  });

  test("a change of directory is set aside and a plain command stands as it is", () => {
    expect(commandGist("cd /work/repo && bun test tests/app > /tmp/out.log 2>&1")).toEqual({ text: "bun test tests/app", loop: false });
    expect(commandGist("git status --short")).toEqual({ text: "git status --short", loop: false });
  });

  test("a line of nothing but assignments stands levelled whole", () => {
    expect(commandGist("A=1\nB=2")).toEqual({ text: "A=1 B=2", loop: false });
  });

  test("a row of its own names the tool before the gist", () => {
    expect(clockTopLine({ tool: "Bash", command: POLL })).toEqual({ text: "Bash grep -q '^exit' ask.out", loop: true });
    expect(clockTopLine({ tool: "WebFetch", command: "https://example.com" })).toEqual({ text: "WebFetch https://example.com", loop: false });
  });
});

describe("a call's clock", () => {
  test("every note of one call folds into the call's own row, however many the clock wrote", () => {
    const notes = [
      note(2, 1_002, clock("started", { pid: null, elapsedMs: 2_000 })),
      ...Array.from({ length: 30 }, (_, index) => note(3 + index, 1_062 + index * 60, clock("running", { elapsedMs: 62_000 + index * 60_000 }))),
      note(40, 1_311, clock("asked", { elapsedMs: 311_000, silentMs: 311_000 })),
      note(41, 1_331, clock("kept", { elapsedMs: 331_000, keptMs: 3_592_000 }))
    ];
    const rows = buildLog([CALL, ...notes]);

    expect(rows).toHaveLength(1);
    expect(rows[0]?.line.kind).toBe("tool");
    expect(rows[0]?.clock?.state).toBe("running");
    expect(rows[0]?.clock?.pid).toBe(4242);
    // The newest note that said how long the call had run puts its start: 1,331 less 331 seconds.
    expect(rows[0]?.clock?.startedAt).toBe(1_000);
    expect(rows[0]?.clock?.moments.map((moment) => moment.event)).toEqual(["asked", "kept"]);
    expect(rows[0]?.clock?.moments[1]?.until).toBe(1_331 + 3_592);
  });

  test("an end settles the clock to its outcome and how long it took", () => {
    const rows = buildLog([CALL, note(2, 1_002, clock("started", { elapsedMs: 2_000 })), note(3, 1_900, clock("ended", { outcome: "failed", elapsedMs: 900_000 }))]);

    expect(rows[0]?.clock).toMatchObject({ state: "failed", tookMs: 900_000 });
  });

  test("a cut stays told by what cut it once the call's end follows", () => {
    const rows = buildLog([
      CALL,
      note(2, 1_600, clock("cut", { cut: "supervisor", why: "it waits on another job", elapsedMs: 600_000 })),
      note(3, 1_601, clock("ended", { outcome: "failed", elapsedMs: 601_000 }))
    ]);

    expect(rows[0]?.clock).toMatchObject({ state: "cut", cut: "supervisor", why: "it waits on another job", tookMs: 601_000 });
  });

  test("a call whose own line is not on the page stands as one row of its own", () => {
    const rows = buildLog([note(2, 1_062, clock("running", { elapsedMs: 62_000 })), note(3, 1_122, clock("running", { elapsedMs: 122_000 }))]);

    expect(rows.map((row) => row.key)).toEqual(["2"]);
    expect(rows[0]?.clock?.state).toBe("running");
  });

  test("the row standing in moves into the call's own once its line is read", () => {
    const rows = buildLog([note(2, 1_002, clock("started", { elapsedMs: 2_000 })), { ...CALL, id: 3 }, note(4, 1_062, clock("running", { elapsedMs: 62_000 }))]);

    expect(rows.map((row) => row.key)).toEqual(["3"]);
    expect(rows[0]?.clock?.startedAt).toBe(1_000);
  });

  test("a note filed before the call's id was kept is the newest call of its run and tool whose command it opens", () => {
    const old = (id: number, at: number, fields: AgentLogClock): AgentLogLine => note(id, at, { ...fields, call: null });
    const rows = buildLog([
      CALL,
      old(2, 1_002, clock("started", { pid: null, elapsedMs: 2_000 })),
      old(3, 1_062, clock("running", { elapsedMs: 62_000 })),
      line(4, "tool", 1_070, { name: "Bash", ref: "t2", text: JSON.stringify({ command: "git status" }) }),
      old(5, 1_122, clock("running", { elapsedMs: 122_000 }))
    ]);

    expect(rows.map((row) => row.key)).toEqual(["1", "4"]);
    expect(rows[0]?.clock?.startedAt).toBe(1_000);
    expect(rows[1]?.clock).toBeUndefined();
  });

  test("a start after the call's end is a new run of the same command", () => {
    const old = (id: number, at: number, fields: AgentLogClock): AgentLogLine => note(id, at, { ...fields, call: null });
    const rows = buildLog([
      old(2, 1_002, clock("started", { elapsedMs: 2_000 })),
      old(3, 1_100, clock("ended", { outcome: "completed", elapsedMs: 100_000 })),
      old(4, 1_202, clock("started", { elapsedMs: 2_000 }))
    ]);

    expect(rows.map((row) => row.clock?.state)).toEqual(["completed", "running"]);
  });

  test("a call still running when its result or its run's end arrives settles there", () => {
    const answered = buildLog([
      CALL,
      note(2, 1_062, clock("running", { elapsedMs: 62_000 })),
      line(3, "tool-result", 1_090, { ref: "t1", state: "succeeded", text: "exit 0" })
    ]);

    expect(answered[0]?.clock).toMatchObject({ state: "completed", tookMs: 90_000 });

    const ended = buildLog([CALL, note(2, 1_062, clock("running", { elapsedMs: 62_000 })), line(3, "end", 1_200, { text: "done" })]);

    expect(ended[0]?.clock).toMatchObject({ state: "ended-with-turn", tookMs: 200_000 });
  });

  test("a note the clock did not write stays a line of the log", () => {
    const rows = buildLog([line(2, "note", 1_000, { text: "the run line went out" })]);

    expect(rows).toHaveLength(1);
    expect(rows[0]?.clock).toBeUndefined();
  });
});
