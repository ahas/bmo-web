import { describe, expect, test } from "bun:test";

import {
  logCategoryOfSlice,
  logJournalEntries,
  logJournalMatches,
  logLevelOf,
  logUnitPrefix,
  readLogSources,
  readNewerLogLines,
  readOlderLogLines,
  SliceBook
} from "../../../apps/web/server/utils/monitor-logs";

import type { LogCommandRun, LogReading } from "../../../apps/web/server/utils/monitor-logs";
import type { LogFilter } from "../../../apps/web/shared/monitor-logs";

// The monitor's logs tab (docs/web.md, 「Monitor's logs tab」): the user journal read with journalctl, each line's
// category the slice its unit runs in, the manager's lines about a unit under that unit, the words masked, pages read
// back from the newest and new lines read up to the newest held.

const MASK = "[masked]";
const ALL: LogFilter = { category: null, unit: null, level: null, query: "" };

interface Entry {
  cursor: string;
  unit: string;
  slice?: string;
  about?: string;
  priority?: number;
  message: string | number[];
}

function printed(entries: Entry[]): string {
  return entries
    .map((one) => JSON.stringify({
      __CURSOR: one.cursor,
      __REALTIME_TIMESTAMP: String(1_790_000_000_000_000 + Number(one.cursor.replace(/\D/g, "")) * 1_000_000),
      _SYSTEMD_USER_UNIT: one.unit,
      _SYSTEMD_USER_SLICE: one.slice ?? "app.slice",
      ...(one.about === undefined ? {} : { USER_UNIT: one.about }),
      PRIORITY: String(one.priority ?? 6),
      MESSAGE: one.message
    }))
    .join("\n");
}

// A journal newest first, cursors c9 down to c1, answering journalctl's `-r`, `-n` and `--after-cursor` as it does,
// and systemctl's answers from a table; every call is kept so a test reads what was asked.
function standInMachine(journal: Entry[], systemctl: Record<string, string> = {}): { run: LogCommandRun; calls: string[][] } {
  const calls: string[][] = [];
  const run: LogCommandRun = async (command, args) => {
    calls.push([command, ...args]);

    if (command === "systemctl") return systemctl[args.join(" ")] ?? "";

    const count = Number(args[args.indexOf("-n") + 1]);
    const after = args.find((one) => one.startsWith("--after-cursor="))?.slice("--after-cursor=".length);
    const unitMatch = args.find((one) => one.startsWith("_SYSTEMD_USER_UNIT="))?.slice("_SYSTEMD_USER_UNIT=".length);
    let rows = journal;

    if (after !== undefined) rows = rows.slice(rows.findIndex((one) => one.cursor === after) + 1);
    if (args.includes("--output-fields=_SYSTEMD_USER_SLICE")) rows = rows.filter((one) => one.unit === unitMatch);

    return printed(rows.slice(0, count));
  };

  return { run, calls };
}

function reading(run: LogCommandRun): LogReading {
  return { run, prefix: "bmo-", masked: MASK, slices: new SliceBook(run) };
}

const journal: Entry[] = [
  { cursor: "c9", unit: "init.scope", slice: "-.slice", about: "bmo-attendance.service", priority: 3, message: "Failed to start bmo-attendance.service." },
  { cursor: "c8", unit: "bmo-attendance.service", slice: "bmo-backup.slice", message: "snapshot failed" },
  { cursor: "c7", unit: "other-unit.service", message: "not ours" },
  { cursor: "c6", unit: "bmo-approval.service", priority: 4, message: "API_TOKEN=abcdef123456 slow" },
  { cursor: "c5", unit: "bmo-approval.service", message: [27, 91, 51, 49, 109, 114, 101, 100, 27, 91, 48, 109] },
  { cursor: "c4", unit: "bmo-approval.service", message: "line four" },
  { cursor: "c3", unit: "bmo-approval.service", message: "line three" },
  { cursor: "c2", unit: "bmo-approval.service", message: "line two" },
  { cursor: "c1", unit: "bmo-approval.service", message: "line one" }
];

describe("a line", () => {
  test("is read from journalctl's JSON, a message kept as bytes decoded and one that does not read passed over", () => {
    const entries = logJournalEntries(`${printed([journal[0]!, journal[4]!])}\nnot json\n`);

    expect(entries.map((one) => [one.cursor, one.ownUnit, one.managerUnit])).toEqual([
      ["c9", "init.scope", "bmo-attendance.service"],
      ["c5", "bmo-approval.service", null]
    ]);
    expect(entries[1]!.message).toBe("\u001b[31mred\u001b[0m");
  });

  test("takes its level from the journal's priority", () => {
    expect([0, 3, 4, 5, 6, 7, undefined, "x"].map(logLevelOf)).toEqual(["error", "error", "warning", "other", "other", "other", "other", "other"]);
  });

  test("takes its category from the slice: the key of a slice under the prefix, the servers' for any other", () => {
    expect(logCategoryOfSlice("bmo-backup.slice", "bmo-")).toBe("backup");
    expect(logCategoryOfSlice("app.slice", "bmo-")).toBe("service");
    expect(logCategoryOfSlice("bmo-.slice", "bmo-")).toBe("service");
    expect(logCategoryOfSlice(null, "bmo-")).toBe("service");
  });

  test("is read under the prefix the setting names, `bmo-` where it names none", () => {
    expect(logUnitPrefix({})).toBe("bmo-");
    expect(logUnitPrefix({ LOG_UNIT_PREFIX: " unit-" })).toBe("unit-");
  });
});

describe("what journalctl is asked to narrow to", () => {
  test("is a unit's lines and the manager's about it, or a category's slice and the manager's lines, with the level", () => {
    expect(logJournalMatches({ ...ALL, unit: "bmo-approval.service" }, "bmo-")).toEqual(["_SYSTEMD_USER_UNIT=bmo-approval.service", "+", "USER_UNIT=bmo-approval.service"]);
    expect(logJournalMatches({ ...ALL, category: "backup", level: "error" }, "bmo-")).toEqual(["-p", "0..3", "_SYSTEMD_USER_SLICE=bmo-backup.slice", "+", "_SYSTEMD_USER_UNIT=init.scope"]);
    expect(logJournalMatches({ ...ALL, category: "service", level: "other" }, "bmo-")).toEqual(["-p", "5..7"]);
    expect(logJournalMatches(ALL, "bmo-")).toEqual([]);
  });
});

describe("a page of older lines", () => {
  test("is the newest first, only the prefix's units, the manager's line under its unit's category, masked and stripped", async () => {
    const { run } = standInMachine(journal);
    const page = await readOlderLogLines(ALL, null, reading(run));

    expect(page.lines.map((one) => [one.id, one.unit, one.category, one.level])).toEqual([
      ["c9", "bmo-attendance.service", "backup", "error"],
      ["c8", "bmo-attendance.service", "backup", "other"],
      ["c6", "bmo-approval.service", "service", "warning"],
      ["c5", "bmo-approval.service", "service", "other"],
      ["c4", "bmo-approval.service", "service", "other"],
      ["c3", "bmo-approval.service", "service", "other"],
      ["c2", "bmo-approval.service", "service", "other"],
      ["c1", "bmo-approval.service", "service", "other"]
    ]);
    expect(page.lines[2]!.text).toBe(`API_TOKEN=${MASK} slow`);
    expect(page.lines[3]!.text).toBe("red");
    expect(page).toMatchObject({ next: null, head: "c9", gap: false });
  });

  test("puts the manager's lines about a category's slice under that category", async () => {
    const { run } = standInMachine([{ cursor: "c1", unit: "init.scope", slice: "-.slice", about: "bmo-backup.slice", message: "Created slice bmo-backup.slice." }]);

    expect((await readOlderLogLines(ALL, null, reading(run))).lines.map((one) => [one.unit, one.category])).toEqual([["bmo-backup.slice", "backup"]]);
  });

  test("stops at the page's size and goes on from its last line, and the next page names no head", async () => {
    const { run, calls } = standInMachine(journal);
    const first = await readOlderLogLines(ALL, null, reading(run), 3);

    expect(first.lines.map((one) => one.id)).toEqual(["c9", "c8", "c6"]);
    expect(first.next).toBe("c6");

    const second = await readOlderLogLines(ALL, first.next, reading(run), 3);

    expect(second.lines.map((one) => one.id)).toEqual(["c5", "c4", "c3"]);
    expect(second.head).toBeNull();
    expect(calls.at(-1)).toContain("--after-cursor=c6");
  });

  test("keeps only what the filter keeps, the search matching the words after they are masked", async () => {
    const { run } = standInMachine(journal);

    expect((await readOlderLogLines({ ...ALL, category: "backup" }, null, reading(run))).lines.map((one) => one.id)).toEqual(["c9", "c8"]);
    expect((await readOlderLogLines({ ...ALL, query: "LINE T" }, null, reading(run))).lines.map((one) => one.id)).toEqual(["c3", "c2"]);
    expect((await readOlderLogLines({ ...ALL, query: "attendance" }, null, reading(run))).lines.map((one) => one.id)).toEqual(["c9", "c8"]);
    expect((await readOlderLogLines({ ...ALL, query: "abcdef" }, null, reading(run))).lines).toEqual([]);
  });
});

describe("new lines", () => {
  test("are those written after the head, newest first, with the newest as the next head", async () => {
    const { run } = standInMachine(journal);
    const page = await readNewerLogLines(ALL, "c5", reading(run));

    expect(page.lines.map((one) => one.id)).toEqual(["c9", "c8", "c6"]);
    expect(page).toMatchObject({ head: "c9", gap: false });
  });

  test("are none where nothing was written after the head", async () => {
    const { run } = standInMachine(journal);

    expect(await readNewerLogLines(ALL, "c9", reading(run))).toEqual({ lines: [], next: null, head: "c9", gap: false });
  });

  test("say there is a gap where the head is not met within what one ask reads", async () => {
    const { run } = standInMachine(journal);
    const page = await readNewerLogLines(ALL, "gone", reading(run));

    expect(page.gap).toBe(true);
    expect(page.head).toBe("c9");
  });
});

describe("a unit's slice", () => {
  test("is the slice its own newest line carries, else systemd's, a timer standing in its unit's, and is kept", async () => {
    const { run, calls } = standInMachine(journal, {
      "--user show -p Unit --value bmo-attendance.timer": "bmo-attendance.service\n",
      "--user show -p Slice --value bmo-schedule.service": "bmo-upkeep.slice\n"
    });
    const book = new SliceBook(run);

    expect(await book.sliceOf("bmo-attendance.timer")).toBe("bmo-backup.slice");
    expect(await book.sliceOf("bmo-schedule.service")).toBe("bmo-upkeep.slice");

    const asked = calls.length;

    expect(await book.sliceOf("bmo-schedule.service")).toBe("bmo-upkeep.slice");
    expect(calls.length).toBe(asked);
  });

  test("is read again once it has been kept a while", async () => {
    const { run, calls } = standInMachine(journal);
    let now = 0;
    const book = new SliceBook(run, () => now);

    await book.sliceOf("bmo-approval.service");

    const asked = calls.length;

    now = 11 * 60_000;
    await book.sliceOf("bmo-approval.service");

    expect(calls.length).toBeGreaterThan(asked);
  });
});

describe("what the filters offer", () => {
  test("is the servers' category with its units, then every category a slice file or a running slice names", async () => {
    const { run } = standInMachine(journal, {
      "--user list-unit-files --type=slice -o json --no-pager bmo-*": JSON.stringify([{ unit_file: "bmo-backup.slice" }, { unit_file: "bmo-deploy.slice" }]),
      "--user list-units --all --type=slice -o json --no-pager bmo-*": JSON.stringify([{ unit: "bmo-suite.slice" }]),
      "--user list-units --all --type=service -o json --no-pager bmo-*": JSON.stringify([{ unit: "bmo-attendance.service" }, { unit: "bmo-approval.service" }])
    });

    expect(await readLogSources(reading(run))).toEqual({
      categories: [
        { key: "service", units: ["bmo-approval.service"] },
        { key: "backup", units: [] },
        { key: "deploy", units: [] },
        { key: "suite", units: [] }
      ]
    });
  });
});
