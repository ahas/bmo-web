import { describe, expect, test } from "bun:test";

import "../../support/nitro";
import marks from "../../../apps/web/i18n/data/ko.yaml";
import { wording } from "../../../apps/web/shared/wording";
import { rawNumber } from "../../support/raw-number";
import { answer, standIn } from "../../support/units";

// A room as the receiver keeps it, read from a stand-in receiver into the shapes the room screen draws: the rooms
// with the owner's own named by the chat agent, a page whose senders are matched against the room's answering
// agents, the files a message carried with whether each can be received, and the expressions and formats its words
// were sent with, read of the metadata for a message that carries files or is not an agent's answer, a reply
// carrying what it answers, and no judgements beside a page.

const message = (id: number, over: Record<string, unknown> = {}) => ({
  id,
  room: -7,
  senderId: 11,
  senderName: "person-a",
  sentAt: 1_790_000_000_000 + id,
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

// A working turn's thinking as the record keeps it: the agent's line under the thinking kind, and a person's words
// that claim the kind, which no agent sent.
const thought = message(6, { senderId: 22, senderName: "agent-a", kind: "thinking", text: "weighing the room's words" });

const page = [
  message(1, { forwardedFrom: { room: -5, messageId: 3, senderName: "person-b" } }),
  message(2, { senderId: 22, senderName: "agent-a", answerSeconds: 4, round: "round:-7:1:1" }),
  message(3, { senderId: 22, senderName: "agent-a", text: `${(marks as { marks: { notice: string } }).marks.notice} restarting` }),
  message(4, {
    replyToMessageId: 1,
    files: [
      { kind: "audio", source: "bmo:voice", storedPath: "/kept/a.ogg", summary: null, collectedAt: 1 },
      { kind: "document", source: "notes.pdf", storedPath: null, summary: null, collectedAt: 2 },
      { kind: "photo", source: "p.jpg", storedPath: null, summary: null, collectedAt: 3 }
    ]
  })
];

// A room whose chat service numbers its messages past 2^53: two neighbours a JavaScript number reads as one.
const numberedHigh = ["3973025898369060353", "3973025898369060354"];

// A room whose messages carry a custom emoji, a sticker and a video, and one whose files cannot be listed.
const EMOJI = "\u{1F600}";
const drawn = [
  message(6, {
    room: -8,
    text: `hi ${EMOJI} there`,
    files: [
      { kind: "sticker", source: "emoji-123.webp", storedPath: "/kept/e.webp", summary: null, collectedAt: 1 },
      { kind: "sticker", source: "sticker.webp", storedPath: "/kept/s.webp", summary: null, collectedAt: 2 },
      { kind: "video", source: "clip.mp4", storedPath: "/kept/c.mp4", summary: null, collectedAt: 3 }
    ]
  }),
  message(7, { room: -8, files: [{ kind: "document", source: "lost.pdf", storedPath: null, summary: null, collectedAt: 4 }] })
];
// In the owner's own account: an answer the receiver named the agent and the voice on, one it named in the agent's own
// bot account, and one written before it named either and so read by the number it went out under.
const voiced = [
  message(20, { room: -9, senderId: 33, senderName: "person-owner", round: "round:-9:1:1", agentName: "agent-a", voice: "human-avatar" }),
  message(21, { room: -9, senderId: 33, senderName: "person-owner", agentName: "agent-a", voice: "bot-account" }),
  message(22, { room: -9, senderId: 33, senderName: "person-owner", round: "round:-9:1:2" })
];
const keptFile = (place: number, kind: string, name: string, type: string | null, size: number | null, kept = true) => ({ place, kind, name, type, size, kept });

function room(id: number, over: Record<string, unknown> = {}): Record<string, unknown> {
  return { id, title: null, messageCount: 1, lastMessageAt: 1, pinned: false, senders: [], supervisors: [], ownerRoom: false, registered: true, workRoom: 0, mode: null, listened: false, ...over };
}

// The receiver's room list, one room for each mark of a room added, one a chat service merely numbered and one the
// owner's words stand in with no mode, which a test adds and removes as the receiver's own routes would.
const numbered = room(-20, { title: "Numbered", lastMessageAt: 150_000 });
// The owner's sender is 5, as the stand-in's `/owner` names it.
const spoken = room(-21, { title: "Spoken", lastMessageAt: 50_000, senders: [9, 5] });
const rooms: Record<string, unknown>[] = [
  room(5, { messageCount: 3, lastMessageAt: 100_000, pinned: true }),
  numbered,
  room(-7, { title: "Room A", messageCount: 4, lastMessageAt: 200_000, supervisors: ["agent-b"] }),
  // The owner's private chat, a room the console made on the record road.
  room(-11, { messageCount: 1, lastMessageAt: 300_000, ownerRoom: true }),
  spoken,
  room(-22, { title: "Listened", lastMessageAt: 40_000, listened: true }),
  room(-23, { title: "Added", lastMessageAt: 30_000, mode: "record-only" })
];

const receiver = standIn("RECEIVER", (one) => {
  const path = one.path.split("?")[0]!;

  if (path === "/rooms/-7/messages/4/files") {
    return answer({ items: [keptFile(0, "audio", "bmo:voice", "audio/ogg", 1200), keptFile(1, "document", "notes.pdf", "application/pdf", null, false), keptFile(2, "photo", "p.jpg", "image/jpeg", 50)], more: false });
  }
  if (path === "/rooms/-7/messages/4/metadata") return answer({ metadata: null });
  if (path === "/rooms/-7/answerers") return answer({ default: "agent-a", voice: "agent-a", items: [{ agentName: "agent-a", defaultAnswerer: true }], more: false });
  if (path === "/rooms/-7/own-number") return answer({ number: 22 });
  if (path === "/rooms/-8/messages") return answer({ items: drawn, more: false });
  if (path === "/rooms/-8/messages/6/files") {
    return answer({ items: [keptFile(0, "sticker", "emoji-123.webp", "image/webp", 40), keptFile(1, "sticker", "sticker.webp", "image/webp", 90), keptFile(2, "video", "clip.mp4", "video/mp4", 5000)], more: false });
  }
  if (path === "/rooms/-8/messages/6/metadata") {
    return answer({
      metadata: {
        text: `hi ${EMOJI} there`,
        entities: [{ type: "custom_emoji", offset: 3, length: 2, custom_emoji_id: "123" }, { type: "bold", offset: 0, length: 2 }],
        sticker: { set: "set-a" },
        attachment: { width: 640, height: 360 }
      }
    });
  }
  if (path === "/rooms/-8/messages/7/files") return answer({ code: "upstream-failed", error: "the store did not answer" }, 503);
  if (path === "/rooms/-8/answerers") return answer({ default: "", voice: "", items: [], more: false });
  // A room answered in the owner's own account: the voice agent's number there is the owner's.
  if (path === "/rooms/-9/answerers") return answer({ default: "agent-a", voice: "agent-a", items: [{ agentName: "agent-a", defaultAnswerer: true }], more: false });
  if (path === "/rooms/-9/own-number") return answer({ number: 33 });
  if (path === "/rooms/-9/messages") return answer({ items: voiced, more: false });
  if (path === "/rooms/-12/messages") return answer({ items: numberedHigh.map((id) => message(0, { id: rawNumber(id), room: -12, text: "" })), more: false });
  if (path === "/rooms/-9/messages/22/sender-is-owner") return answer({ owner: true });

  if (path === "/rooms") return answer({ items: rooms, more: false });

  // The owner's room is the console-made one; their chat service's one-to-one is a room like any other.
  if (path === "/owner") return answer({ room: -11, senderId: 5 });
  if (path === "/people") return answer({ items: new URL(one.path, "http://receiver").searchParams.get("ids") === "5" ? [{ id: 5, name: "Person A" }] : [], more: false });
  if (path === "/rooms/5/title" || path === "/rooms/-11/title") return answer({ title: null });
  if (path === "/rooms/-7/title") return answer({ title: "Room A" });
  if (path === "/rooms/-7/messages") {
    const after = new URL(one.path, "http://receiver").searchParams.get("after");

    return answer(after === null ? { items: page, more: true } : { items: [message(5), thought], more: false });
  }
  if (path === "/rooms/-7/messages/1") return answer(page[0]);
  if (path === "/rooms/-7/messages/2") return answer(page[1]);
  if (path === "/rooms/-7/day-start") return answer({ messageId: 2 });

  return answer({ code: "no-route", error: "no route" }, 404);
});

// The agency holding the two runs of the room's one round: its own turn, which called a tool, and a question its draft
// process asked, each with what it spent.
const usage = (inputTokens: number) => ({ inputTokens, outputTokens: 2, cacheReadTokens: 0, cacheWriteTokens: 0 });
const agency = standIn("AGENCY", (one) => {
  const url = new URL(one.path, "http://agency");

  if (url.pathname === "/runs" && url.searchParams.get("names") === "round:-7:1:1") {
    return answer({
      items: [
        { id: 41, agentName: "agent-a", unitName: "chat:-7:1", usage: usage(10) },
        { id: 42, agentName: "agent-a", unitName: "chat:-7:2", usage: usage(5) }
      ],
      more: false
    });
  }
  if (url.pathname === "/runs") return answer({ items: [], more: false });
  if (url.pathname === "/log-lines" && url.searchParams.get("runId") === "41") {
    return answer({ items: [{ id: 1, runId: 41, kind: "tool", text: "read a file", fields: { name: "read" }, at: 1 }], more: false });
  }
  if (url.pathname === "/log-lines") return answer({ items: [], more: false });

  return answer({ code: "no-route", error: "no route" }, 404);
});

const { listRooms, readDayStart, readMessagePage, readMessagesAfter, readWholeJudgements, roundFigures, roomTitleOf } = await import("../../../apps/web/server/utils/archive");
const { registerChatAgent } = await import("../../../apps/web/shared/agent-names");

registerChatAgent({ name: "agent-a", label: "Agent A" });

describe("the rooms", () => {
  test("stand in the receiver's order, the owner's own named by the chat agent, each pinned or not", async () => {
    expect(await listRooms()).toEqual([
      { chatId: 5, title: "Person A", messageCount: 3, lastMessageAt: 100, pinned: true },
      { chatId: -7, title: "Room A", messageCount: 4, lastMessageAt: 200, pinned: false },
      { chatId: -11, title: "Agent A", messageCount: 1, lastMessageAt: 300, pinned: false },
      { chatId: -22, title: "Listened", messageCount: 1, lastMessageAt: 40, pinned: false },
      { chatId: -23, title: "Added", messageCount: 1, lastMessageAt: 30, pinned: false }
    ]);
    expect(await roomTitleOf(-7)).toBe("Room A");
  });

  test("stand only once added: the owner's private chat always, a room his words stand in not until it carries a mode", async () => {
    const listed = async () => (await listRooms()).map((one) => one.chatId);

    expect(await listed()).toContain(-11);
    expect(await listed()).not.toContain(-21);

    spoken.mode = "avatar";
    expect(await listed()).toEqual([5, -7, -11, -21, -22, -23]);

    spoken.mode = null;
  });

  test("a room a chat service merely numbered comes in once the add flow gives it a mode, and leaves once removed", async () => {
    const listed = async () => (await listRooms()).map((one) => one.chatId);

    expect(await listed()).not.toContain(-20);

    numbered.mode = "record-only";
    expect(await listed()).toEqual([5, -20, -7, -11, -22, -23]);

    rooms.splice(rooms.indexOf(numbered), 1);
    expect(await listed()).toEqual([5, -7, -11, -22, -23]);

    rooms.splice(1, 0, numbered);
    numbered.mode = null;
  });

  test("the owner's private chat is the room the receiver names, and their one-to-one is called by the person it is with", async () => {
    expect(await roomTitleOf(-11)).toBe("Agent A");
    expect(await roomTitleOf(5)).toBe("Person A");
  });
});

describe("a page of a room", () => {
  test("is asked by its cursor, and its senders are matched against the room's answering agents", async () => {
    receiver.asked.length = 0;

    const read = await readMessagePage(-7, "9", 50);

    expect(receiver.asked.filter((one) => one.path.startsWith("/rooms/-7/messages?")).map((one) => one.path)).toEqual(["/rooms/-7/messages?limit=50&before=9"]);
    expect(receiver.asked.filter((one) => one.path.startsWith("/rooms/-7/answerers") || one.path.startsWith("/rooms/-7/own-number")).map((one) => one.path).sort()).toEqual([
      "/rooms/-7/answerers",
      "/rooms/-7/own-number?agentName=agent-a"
    ]);
    expect(read.hasMore).toBe(true);
    expect(read.judgements).toEqual([]);
    expect(read.messages.map((one) => [one.messageId, one.agent, one.notice])).toEqual([
      ["1", false, false],
      ["2", true, false],
      ["3", true, true],
      ["4", false, false]
    ]);
    expect(read.messages[1]).toMatchObject({ answerSeconds: 4, round: "round:-7:1:1", spend: null, actions: null });
    // What the round spent and did is read apart from the page, so the page asks the agency nothing.
    expect(agency.asked).toEqual([]);
    // The agent's number is not the owner's here, so no answer is said to have gone out in the owner's account.
    expect(read.messages.some((one) => one.voicedBy !== undefined)).toBe(false);
    // Where a forwarded message came from, on the row the record marks and no other.
    expect(read.messages.map((one) => one.forwardedFrom ?? null)).toEqual([{ room: -5, messageId: "3", senderName: "person-b" }, null, null, null]);
  });

  test("names the agent of an answer sent in the owner's own account from the send itself, and asks the number's owner only where the send names no agent", async () => {
    receiver.asked.length = 0;

    const read = await readMessagePage(-9, null, 50);

    // Every send the receiver names its agent on is that agent's words, whichever voice it went out in: another supervisor's
    // own bot account names it as a person's account does (docs/web.md, the naming rule).
    expect(read.messages.map((one) => [one.messageId, one.agent, one.voicedBy, one.senderName])).toEqual([
      ["20", true, "agent-a", "person-owner"],
      ["21", true, "agent-a", "person-owner"],
      ["22", true, "agent-a", "person-owner"]
    ]);
    // The two sends that name their agent need no question; the one written before the receiver named it is asked once.
    expect(receiver.asked.filter((one) => one.path.includes("sender-is-owner")).map((one) => one.path)).toEqual(["/rooms/-9/messages/22/sender-is-owner"]);
  });

  test("carries each file a message kept, by its place, with its size and type and whether it can be received, and what a reply answers", async () => {
    receiver.asked.length = 0;

    const reply = (await readMessagePage(-7, null, 100)).messages[3]!;

    expect(reply.attachments).toEqual([
      { id: 0, kind: "audio", name: wording("room.label.voice_message"), bytes: 1200, type: "audio/ogg", available: true },
      { id: 1, kind: "document", name: "notes.pdf", bytes: null, type: null, available: false }
    ]);
    expect(reply.expressions).toEqual([]);
    expect(reply.formats).toEqual([]);
    expect(reply.replyQuote).toEqual({ messageId: "1", senderName: "person-a", text: "words 1", pictured: false, attachment: null });
    // The metadata of the person's words is asked even of a message that carries no file; an agent's answer that
    // carries none stands as its markdown and is asked nothing; the files are listed only where the page names one.
    expect(receiver.asked.filter((one) => /\/(files|metadata)$/.test(one.path)).map((one) => one.path).sort()).toEqual([
      "/rooms/-7/messages/1/metadata",
      "/rooms/-7/messages/4/files",
      "/rooms/-7/messages/4/metadata"
    ]);
  });

  test("draws a custom emoji over the words it stands for, the latest sticker alone, and a video in the shape it arrived in", async () => {
    const [shown, unlisted] = (await readMessagePage(-8, null, 100)).messages;
    const emoji = { id: 0, kind: "sticker" as const, name: "emoji-123.webp", bytes: 40, type: "image/webp", available: true };

    expect(shown!.expressions).toEqual([{ offset: 3, length: 2, attachment: emoji }]);
    expect(shown!.attachments).toEqual([
      { id: 1, kind: "sticker", name: "sticker.webp", bytes: 90, type: "image/webp", available: true },
      { id: 2, kind: "video", name: "clip.mp4", bytes: 5000, type: "video/mp4", available: true, shape: { width: 640, height: 360 } }
    ]);
    // A list the receiver could not give leaves the files named and unavailable, and the page stands.
    expect(unlisted!.attachments).toEqual([{ id: 0, kind: "document", name: "lost.pdf", bytes: null, type: null, available: false }]);
  });

  test("a thinking message is told by the kind the record names, and carries no voice briefing chip", async () => {
    const read = (await readMessagesAfter(-7, "4", 20)).messages;

    expect(read.map((one) => [one.messageId, one.agent, one.thinking === true])).toEqual([
      ["5", false, false],
      ["6", true, true]
    ]);
    expect(read[1]!.briefing ?? null).toBeNull();
  });

  test("a message numbered past 2^53 carries its exact id", async () => {
    const read = (await readMessagePage(-12, null, 50)).messages;

    expect(read.map((one) => one.messageId)).toEqual(numberedHigh);
  });

  test("past a message, and where a day begins", async () => {
    expect((await readMessagesAfter(-7, "4", 20)).messages.map((one) => one.messageId)).toEqual(["5", "6"]);
    expect(await readDayStart(-7, 1_790_000_000)).toEqual({ messageId: "2" });
    expect(await readWholeJudgements(-7, [1], { from: 0, to: 1 })).toEqual([]);
  });
});

describe("a round's figures", () => {
  test("are read for the rounds of the room's own answers, each round once with its runs side by side", async () => {
    agency.asked.length = 0;

    const read = await roundFigures(-7, ["2", "1", "99"]);

    expect(read).toHaveLength(1);
    expect(read[0]).toMatchObject({ messageId: "2", round: "round:-7:1:1", spend: { inputTokens: 15, outputTokens: 4, measured: 2 } });
    expect(read[0]!.actions).toMatchObject({ agent: "agent-a", runs: ["chat:-7:1", "chat:-7:2"], tools: 1 });
    expect(agency.asked.filter((one) => one.path.startsWith("/runs?")).map((one) => one.path)).toEqual(["/runs?names=round%3A-7%3A1%3A1&limit=50"]);
    expect(agency.asked.filter((one) => one.path.startsWith("/log-lines?")).map((one) => new URL(one.path, "http://agency").searchParams.get("runId")).sort()).toEqual(["41", "42"]);
  });
});
