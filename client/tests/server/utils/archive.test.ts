import { describe, expect, test } from "bun:test";

import "../../support/nitro";
import marks from "../../../apps/web/i18n/data/ko.yaml";
import { wording } from "../../../apps/web/shared/wording";
import { answer, standIn } from "../../support/units";

// A room as the receiver keeps it, read from a stand-in receiver into the shapes the room screen draws: the rooms
// with the owner's own named by the chat agent, a page whose senders are matched against the room's answering
// agents, the files a message carried with whether each can be received and the expressions its words drew, asked
// only of a message that carries files, a reply carrying what it answers, and no judgements beside a page.

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
  return { id, title: null, messageCount: 1, lastMessageAt: 1, pinned: false, senders: [], companions: [], ownerRoom: false, registered: true, workRoom: 0, ...over };
}

const receiver = standIn("RECEIVER", (one) => {
  const path = one.path.split("?")[0]!;

  if (path === "/rooms/-7/messages/4/files") {
    return answer({ items: [keptFile(0, "audio", "bmo:voice", "audio/ogg", 1200), keptFile(1, "document", "notes.pdf", "application/pdf", null, false), keptFile(2, "photo", "p.jpg", "image/jpeg", 50)], more: false });
  }
  if (path === "/rooms/-7/messages/4/metadata") return answer({ metadata: null });
  if (path === "/rooms/-7/answerers") return answer({ default: "agent-a", voice: "agent-a", items: [{ agentName: "agent-a", companion: false }], more: false });
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
  if (path === "/rooms/-9/answerers") return answer({ default: "agent-a", voice: "agent-a", items: [{ agentName: "agent-a", companion: false }], more: false });
  if (path === "/rooms/-9/own-number") return answer({ number: 33 });
  if (path === "/rooms/-9/messages") return answer({ items: voiced, more: false });
  if (path === "/rooms/-9/messages/22/sender-is-owner") return answer({ owner: true });

  if (path === "/rooms") {
    return answer({
      items: [
        room(5, { messageCount: 3, lastMessageAt: 100_000, pinned: true }),
        room(-7, { title: "Room A", messageCount: 4, lastMessageAt: 200_000, companions: ["companion-a"] }),
        // The owner's private chat, a room the console made on the record road.
        room(-11, { messageCount: 1, lastMessageAt: 300_000 })
      ],
      more: false
    });
  }

  // The owner's room is the console-made one; their chat service's one-to-one is a room like any other.
  if (path === "/owner") return answer({ room: -11, senderId: 5 });
  if (path === "/people") return answer({ items: new URL(one.path, "http://receiver").searchParams.get("ids") === "5" ? [{ id: 5, name: "Person A" }] : [], more: false });
  if (path === "/rooms/5/title" || path === "/rooms/-11/title") return answer({ title: null });
  if (path === "/rooms/-7/title") return answer({ title: "Room A" });
  if (path === "/rooms/-7/messages") {
    const after = new URL(one.path, "http://receiver").searchParams.get("after");

    return answer(after === null ? { items: page, more: true } : { items: [message(5)], more: false });
  }
  if (path === "/rooms/-7/messages/1") return answer(page[0]);
  if (path === "/rooms/-7/day-start") return answer({ messageId: 2 });

  return answer({ code: "no-route", error: "no route" }, 404);
});

const { listRooms, readDayStart, readMessagePage, readMessagesAfter, readJudgementPage, roomTitleOf } = await import("../../../apps/web/server/utils/archive");
const { registerChatAgent } = await import("../../../apps/web/shared/agent-names");

registerChatAgent({ name: "agent-a", label: "Agent A" });

describe("the rooms", () => {
  test("stand in the receiver's order, the owner's own named by the chat agent, each pinned or not, and a room made for companions so marked", async () => {
    expect(await listRooms()).toEqual([
      { chatId: 5, title: "Person A", messageCount: 3, lastMessageAt: 100, pinned: true },
      { chatId: -7, title: "Room A", messageCount: 4, lastMessageAt: 200, pinned: false, madeForCompanions: true, companions: ["companion-a"] },
      { chatId: -11, title: "Agent A", messageCount: 1, lastMessageAt: 300, pinned: false }
    ]);
    expect(await roomTitleOf(-7)).toBe("Room A");
  });

  test("the owner's private chat is the room the receiver names, and their one-to-one is called by the person it is with", async () => {
    expect(await roomTitleOf(-11)).toBe("Agent A");
    expect(await roomTitleOf(5)).toBe("Person A");
  });
});

describe("a page of a room", () => {
  test("is asked by its cursor, and its senders are matched against the room's answering agents", async () => {
    receiver.asked.length = 0;

    const read = await readMessagePage(-7, 9, 50);

    expect(receiver.asked.filter((one) => one.path.startsWith("/rooms/-7/messages?")).map((one) => one.path)).toEqual(["/rooms/-7/messages?limit=50&before=9"]);
    expect(receiver.asked.filter((one) => one.path.startsWith("/rooms/-7/answerers") || one.path.startsWith("/rooms/-7/own-number")).map((one) => one.path).sort()).toEqual([
      "/rooms/-7/answerers",
      "/rooms/-7/own-number?agentName=agent-a"
    ]);
    expect(read.hasMore).toBe(true);
    expect(read.judgements).toEqual([]);
    expect(read.messages.map((one) => [one.messageId, one.agent, one.notice])).toEqual([
      [1, false, false],
      [2, true, false],
      [3, true, true],
      [4, false, false]
    ]);
    expect(read.messages[1]).toMatchObject({ answerSeconds: 4, round: "round:-7:1:1", spend: null, actions: null });
    // The agent's number is not the owner's here, so no answer is said to have gone out in the owner's account.
    expect(read.messages.some((one) => one.voicedBy !== undefined)).toBe(false);
    // Where a forwarded message came from, on the row the record marks and no other.
    expect(read.messages.map((one) => one.forwardedFrom ?? null)).toEqual([{ room: -5, messageId: 3, senderName: "person-b" }, null, null, null]);
  });

  test("names the agent of an answer sent in the owner's own account from the send itself, and asks the number's owner only where the send names no agent", async () => {
    receiver.asked.length = 0;

    const read = await readMessagePage(-9, null, 50);

    // Every send the receiver names its agent on is that agent's words, whichever voice it went out in: a companion's
    // own bot account names it as a person's account does (docs/web.md, the naming rule).
    expect(read.messages.map((one) => [one.messageId, one.agent, one.voicedBy, one.senderName])).toEqual([
      [20, true, "agent-a", "person-owner"],
      [21, true, "agent-a", "person-owner"],
      [22, true, "agent-a", "person-owner"]
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
    expect(reply.replyQuote).toEqual({ messageId: 1, senderName: "person-a", text: "words 1", pictured: false, attachment: null });
    // Only the message that carries files is asked about them.
    expect(receiver.asked.filter((one) => /\/(files|metadata)$/.test(one.path)).map((one) => one.path).sort()).toEqual([
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

  test("past a message, and where a day begins", async () => {
    expect((await readMessagesAfter(-7, 4, 20)).messages.map((one) => one.messageId)).toEqual([5]);
    expect(await readDayStart(-7, 1_790_000_000)).toEqual({ messageId: 2 });
    expect(await readJudgementPage(-7, null, 20)).toEqual({ judgements: [], hasMore: false });
  });
});
