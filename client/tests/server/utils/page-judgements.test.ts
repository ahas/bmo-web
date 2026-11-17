import { describe, expect, test } from "bun:test";

import "../../support/nitro";
import { answer, standIn } from "../../support/units";

// A page of a room with the verdicts the gate holds about it, as the gate answers them (the gate's `docs/api.md`,
// 「Judgements」): newest first, its times in epoch milliseconds, some filed under the message they judged, some
// under none and named by their round alone. The page reads them for the time it covers and stands each under the
// message it belongs to as its mark alone; an opened record reads its verdicts whole by their numbers (docs/web.md,
// the room screen's verdicts and its chip line).

const ROOM = -9;
// When the page's messages were sent, in epoch milliseconds.
const AT = 1_790_000_000_000;

const message = (id: number, sentAt: number, over: Record<string, unknown> = {}) => ({
  id,
  room: ROOM,
  senderId: 11,
  senderName: "person-a",
  sentAt,
  text: `words ${id}`,
  imagePath: null,
  replyToMessageId: null,
  answerSeconds: null,
  round: null,
  album: null,
  via: null,
  files: [],
  ...over
});

// A person's message, a console message the archive numbered itself, and the answer the round sent in two parts.
const page = [
  message(31, AT),
  message(-998, AT + 1_000),
  message(32, AT + 60_000, { senderId: 22, senderName: "agent-a", round: "round:a" }),
  message(33, AT + 61_000, { senderId: 22, senderName: "agent-a", round: "round:a" })
];

const judgement = (id: number, messageId: number | null, gateName: string, verdict: string, createdAt: number, round: string | null = "round:a") => ({
  id,
  roomId: ROOM,
  messageId,
  gateName,
  verdict,
  detail: null,
  createdAt,
  ms: 120,
  round,
  roads: [],
  offers: []
});

// Newest first, as the gate pages them.
const held = [
  judgement(907, null, "send", "SENT", AT + 60_500),
  { ...judgement(906, null, "chat", "REPLY", AT + 58_000), detail: "the stage's own words", offers: [{ gateName: "room-rules", held: 15, asked: 12, kept: { item: 0, keyword: 1, word: 11, person: 0, recent: 2 }, capped: 0, rules: null }] },
  judgement(905, null, "sanitizer", "CLEAN", AT + 30_000, null),
  judgement(904, -998, "system-documents", "SKIP: no candidates", AT + 5_000),
  judgement(903, null, "people-search", "SKIP", AT + 4_000, "round:other"),
  judgement(902, 31, "room-rules", "SKIP", AT + 2_000, null),
  judgement(901, 31, "room-rules", "PASS", AT - 3_600_000, null)
];

// The quiet instruction that opened the round its answer's verdicts belong to.
const OPENED = { id: 5, sort: "run_state", summary: "#12 · queue-waiting", createdAt: 1 };

const receiver = standIn("RECEIVER", (one) => {
  const path = one.path.split("?")[0]!;

  if (path === `/rooms/${ROOM}/messages`) return answer({ items: page, more: false });
  if (path === `/rooms/${ROOM}/answerers`) return answer({ default: "agent-a", voice: "agent-a", items: [{ agentName: "agent-a", defaultAnswerer: true }], more: false });
  if (path === `/rooms/${ROOM}/own-number`) return answer({ number: 22 });
  if (path === "/rounds/openings") return answer({ items: [{ round: "round:a", instructions: [OPENED] }], more: false });

  return answer({ code: "no-route", error: "no route" }, 404);
});

const gate = standIn("GATE", (one) => {
  const query = new URL(one.path, "http://gate").searchParams;
  const before = query.get("before");
  const from = Number(query.get("from") ?? 0);
  const to = Number(query.get("to") ?? Infinity);
  const within = held.filter((row) => row.createdAt >= from && row.createdAt <= to && (before === null || row.id < Number(before)));
  // Two to a page, so a stretch is read page after page.
  const items = within.slice(0, 2);

  return answer({ items, more: within.length > items.length });
});

const { readMessagePage, readWholeJudgements } = await import("../../../apps/web/server/utils/archive");

describe("a page's verdicts", () => {
  test("are read for the time the page covers, page after page, and stand under the messages they belong to", async () => {
    gate.asked.length = 0;

    const read = await readMessagePage(ROOM, null, 30);
    const placed = read.judgements.map((one) => [one.id, one.messageId, one.stage, one.createdAt]);

    // From ten minutes before the first message, to now for the room's end.
    const asked = gate.asked.map((one) => new URL(one.path, "http://gate").searchParams);

    expect(asked[0]?.get("roomId")).toBe(String(ROOM));
    expect(asked[0]?.get("from")).toBe(String(AT - 600_000));
    expect(asked[0]?.has("to")).toBe(false);
    expect(asked.map((one) => one.get("before"))).toEqual([null, "906", "904"]);

    // Filed under a message: under it. Filed under none: under the last message its round answered with. A
    // round no message of the page answered, no round at all, or a verdict from before the message could have
    // been about it: nowhere.
    expect(placed).toEqual([
      [907, "33", "send", Math.floor((AT + 60_500) / 1000)],
      [906, "33", "chat", Math.floor((AT + 58_000) / 1000)],
      [904, "-998", "system-documents", Math.floor((AT + 5_000) / 1000)],
      [902, "31", "room-rules", Math.floor((AT + 2_000) / 1000)]
    ]);
    expect(receiver.asked.length).toBeGreaterThan(0);
  });

  test("of a page short of the room's end are read to an hour past its last message", async () => {
    gate.asked.length = 0;

    await readMessagePage(ROOM, "40", 30);

    const first = new URL(gate.asked[0]!.path, "http://gate").searchParams;

    expect(first.get("to")).toBe(String(AT + 61_000 + 3_600_000));
  });

  test("stand on the page as their marks alone, nothing only a card stands among them", async () => {
    const read = await readMessagePage(ROOM, null, 30);

    expect(read.judgements.find((one) => one.id === 906)).toEqual({
      id: 906,
      chatId: ROOM,
      messageId: "33",
      stage: "chat",
      verdict: "REPLY",
      createdAt: Math.floor((AT + 58_000) / 1000),
      round: "round:a"
    });
  });

  test("read whole by their numbers within the seconds named, each worn by its round's offers and opening", async () => {
    gate.asked.length = 0;

    const from = Math.floor((AT + 58_000) / 1000);
    const to = Math.floor((AT + 60_500) / 1000) + 1;
    const read = await readWholeJudgements(ROOM, [906, 907], { from, to });
    const asked = new URL(gate.asked[0]!.path, "http://gate").searchParams;
    const chat = read.find((one) => one.id === 906);

    expect([asked.get("from"), asked.get("to")]).toEqual([String(from * 1000), String(to * 1000)]);
    expect(read.map((one) => one.id)).toEqual([907, 906]);
    expect(chat?.detail).toBe("the stage's own words");
    expect(chat?.opening).toEqual({
      instructions: [OPENED],
      offers: [{ stage: "room-rules", held: 15, asked: 12, kept: { item: 0, keyword: 1, word: 11, person: 0, recent: 2 }, capped: 0, rules: null }]
    });
  });
});

// A silent ending's mark keeps why (docs/web.md, the line under a message the chat agent did not answer): the
// room says the reason under the line, so it rides on the page, while every other stage's detail stays its card's.
describe("a mark of a silent ending", () => {
  test("keeps the reason its skip named, and a mark of any other stage keeps none", async () => {
    const { markOf } = await import("../../../apps/web/server/utils/gate");
    const judged = (stage: string, detail: string | null) => ({ id: 1, chatId: ROOM, messageId: "31", stage, verdict: "SKIP", detail, createdAt: 1_790_000_000 });

    expect(markOf(judged("skipped", "they are talking to each other")).detail).toBe("they are talking to each other");
    expect("detail" in markOf(judged("skipped", null))).toBe(false);
    expect("detail" in markOf(judged("skipped", "  "))).toBe(false);
    expect("detail" in markOf(judged("chat", "the stage's own words"))).toBe(false);
  });
});
