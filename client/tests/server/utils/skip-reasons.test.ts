import { describe, expect, test } from "bun:test";

import "../../support/nitro";
import { answer, standIn } from "../../support/units";

// Why a silent turn sent nothing, read from its `skipped` verdict in the gate and translated by the gate's translator
// into the reader's language (docs/web.md, 「A turn the chat agent chose not to answer」): each reason translated once
// while the server runs, a skip that named none said by the pack rather than translated, and the English line standing
// where the translator fails or reads it only in part, asked for again on the next read.

const ROOM = -11;
// When the verdicts were written, in epoch milliseconds.
const AT = 1_790_000_000_000;

const skipped = (id: number, detail: string | null, createdAt = AT) => ({
  id,
  roomId: ROOM,
  messageId: null,
  gateName: "skipped",
  verdict: "SKIP",
  detail,
  createdAt,
  ms: null,
  round: `round:${id}`,
  roads: [],
  offers: []
});

// Newest first, as the gate pages them.
let held = [
  skipped(905, "nothing new for the owner", AT + 4_000),
  skipped(904, "none given", AT + 3_000),
  skipped(903, null, AT + 2_000),
  skipped(902, "the person is still talking to someone else", AT + 1_000),
  skipped(901, "nothing new for the owner", AT)
];

// How the translator answers: in the reader's language, whole, unless a test says otherwise.
let translate: (originals: string[]) => Response = (originals) =>
  answer({ readings: originals.map((original) => ({ text: `ko:${original}`, whole: true })) });

const gate = standIn("GATE", (one) => {
  const url = new URL(one.path, "http://gate");

  if (url.pathname === "/translations") return translate(one.body!.originals as string[]);

  const before = url.searchParams.get("before");
  const limit = Number(url.searchParams.get("limit") ?? 50);
  const items = held.filter((row) => before === null || row.id < Number(before)).slice(0, limit);

  return answer({ items, more: false });
}, { headers: true });

const translated = () => gate.asked.filter((one) => one.path === "/translations").map((one) => one.body);

const { latestSkipReason, skipReasonsOf } = await import("../../../apps/web/server/utils/skip-reasons");

const SPAN = { from: AT / 1000 - 1, to: AT / 1000 + 10 };

describe("a silent turn's reason", () => {
  test("is read from its verdict in the reader's language, a skip naming none said as such, one with no words left out", async () => {
    gate.asked.length = 0;

    const reasons = await skipReasonsOf(ROOM, [901, 902, 903, 904], SPAN, "ko");

    expect(reasons).toEqual({
      "901": { kind: "named", text: "ko:nothing new for the owner" },
      "902": { kind: "named", text: "ko:the person is still talking to someone else" },
      "904": { kind: "unnamed" }
    });
    expect(new URL(gate.asked[0]!.path, "http://gate").searchParams.get("gateName")).toBe("skipped");
    // One call for the two reasons, newest first as the gate pages them, in the reader's language, for the
    // administrator's role; `none given` is not asked.
    expect(translated()).toEqual([{ language: "ko", originals: ["the person is still talking to someone else", "nothing new for the owner"] }]);
    expect(gate.asked.find((one) => one.path === "/translations")?.headers?.["owner-role"]).toBe("administrator");
  });

  test("is translated once by its words and language, and the newest turn's is the room's latest", async () => {
    gate.asked.length = 0;

    expect(await latestSkipReason(ROOM, "ko")).toEqual({ latest: { id: 905, reason: { kind: "named", text: "ko:nothing new for the owner" } } });
    expect(translated()).toEqual([]);
  });

  test("stands as the English line where the translator fails or reads it in part, and is asked for again", async () => {
    gate.asked.length = 0;
    held = [skipped(910, "a reason the translator is busy for", AT + 5_000), skipped(909, "a reason read in part", AT + 5_000)];
    translate = () => answer({ code: "busy", error: "busy" }, 503);

    expect(await skipReasonsOf(ROOM, [909, 910], SPAN, "ko")).toEqual({
      "909": { kind: "named", text: "a reason read in part" },
      "910": { kind: "named", text: "a reason the translator is busy for" }
    });

    translate = (originals) => answer({ readings: originals.map((original) => ({ text: `ko:${original}`, whole: !original.includes("in part") })) });

    expect(await skipReasonsOf(ROOM, [909, 910], SPAN, "ko")).toEqual({
      "909": { kind: "named", text: "a reason read in part" },
      "910": { kind: "named", text: "ko:a reason the translator is busy for" }
    });
    expect(translated().map((one) => one!.originals)).toEqual([
      ["a reason the translator is busy for", "a reason read in part"],
      ["a reason the translator is busy for", "a reason read in part"]
    ]);
  });

  test("of many turns is asked of the translator sixteen at a time", async () => {
    gate.asked.length = 0;
    held = Array.from({ length: 20 }, (_, at) => skipped(1_000 + at, `reason number ${at}`, AT + 6_000));

    const reasons = await skipReasonsOf(ROOM, held.map((one) => one.id), SPAN, "ko");

    expect(Object.keys(reasons)).toHaveLength(20);
    expect(translated().map((one) => (one!.originals as string[]).length)).toEqual([16, 4]);
  });

  test("of a room whose newest turn named nothing at all is none", async () => {
    held = [skipped(1_100, null, AT + 7_000), skipped(1_099, "an older reason", AT + 6_000)];

    expect(await latestSkipReason(ROOM, "ko")).toEqual({ latest: null });
  });
});
