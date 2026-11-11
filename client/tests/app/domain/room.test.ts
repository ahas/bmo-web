import { afterAll, describe, expect, test } from "bun:test";

import { wording } from "../../../apps/web/shared/wording";

import {
  archivedRows,
  asideSlide,
  botAvatar,
  botSpeaker,
  bubbleBottomPad,
  bubbleLook,
  buildDays,
  choosingMotion,
  copyItemOf,
  feedRead,
  handOvers,
  keptRows,
  mergedMessages,
  NAME_COLOURS,
  reactionViews,
  nameColour,
  needsPage,
  pendingItems,
  quoteText,
  roundEnds,
  rowWidth,
  RUN_JOIN_SECONDS,
  runItem,
  runPlace,
  sendMark,
  senderRuns,
  settledAnswers,
  standingRuns,
  turnAnswer,
  sideLayout,
  sideOf,
  skippedLine,
  withoutMediaMark,
  withRoundFigures,
  atFoot
} from "../../../apps/web/app/domain/room";
import { outboxOf, withChecking, withFailed, withSent } from "../../../apps/web/app/domain/outbox";
import { listeningRuns } from "../../../apps/web/app/domain/room-window";

import type { ArchivedMessage, Judgement } from "../../../apps/web/shared/types";
import { holdCatalogue } from "../../../apps/web/app/domain/agents";
import { catalogueRow } from "../../support/catalogue";
import { avatarFor, FACE_TONES, hueOf } from "../../../apps/web/app/domain/avatars";
import type { AvatarIndex } from "../../../apps/web/app/domain/avatars";
import type { RunState } from "../../../apps/web/app/domain/events";
import type { PickedFile } from "../../../apps/web/app/domain/attachments";
import { OWNER_ID as owner, MESSAGE_ID, ROOM_ID } from "../../support/ids";
import KO from "../../fixtures/app/domain/room.test.ko.json";
import { registerChatAgent } from "../../../apps/web/shared/agent-names";

// The chat agent as the deployment's settings name it, which a room falls back to where no agent has spoken.
registerChatAgent({ name: "agent-a", label: "agent-a" });
afterAll(() => registerChatAgent({ name: "", label: "" }));

const avatars: AvatarIndex = new Map();
const speaker = { id: owner, name: "owner" };
const imageUrl = (chatId: number, messageId: number): string => `/api/images/${chatId}/${messageId}`;

function archived(messageId: number, text: string, senderName = "owner"): ArchivedMessage {
  return {
    chatId: ROOM_ID,
    messageId,
    senderId: senderName === "agent-a" ? 87 : owner,
    senderName,
    agent: senderName === "agent-a",
    sentAt: 1_788_000_000,
    text,
    imagePath: null,
    replyToMessageId: null
  };
}

// A message somebody other than the owner sent: another person in a group room.
function bySomeoneElse(messageId: number, text: string): ArchivedMessage {
  return { ...archived(messageId, text, "Carol"), senderId: 4_218_991 };
}

function picked(name: string, previewUrl: string | null): PickedFile {
  return { key: `k:${name}`, file: new File(["x"], name, { type: "image/jpeg" }), previewUrl };
}

// The pictures one send put out go on the screen as one album, gathered by the album the sender
// named them into and never by how close together they arrived.
describe("an album of pictures", () => {
  function picture(messageId: number, album: number | null, text = ""): ArchivedMessage {
    return { ...archived(messageId, text, "agent-a"), imagePath: `/kept/${messageId}.jpg`, album };
  }

  test("stands as one row, its caption on it and every picture in the order they went", () => {
    const rows = buildDays(wording, [archived(1, KO.line_82), picture(-2, -2, KO.line_82_2), picture(-3, -2), picture(-4, -2), archived(5, KO.line_82_3)], new Map(), imageUrl, avatars)
      .flatMap((day) => day.items);

    expect(rows.map((row) => row.messageId)).toEqual([1, -2, 5]);
    expect(rows[1]!.shownText).toBe(KO.line_86);
    expect(rows[1]!.album).toEqual([-2, -3, -4].map((messageId) => ({ messageId, src: imageUrl(ROOM_ID, messageId) })));
  });

  test("pictures sent one at a time stay rows of their own, however close together", () => {
    const rows = buildDays(wording, [picture(7, null, KO.line_91), picture(8, null, KO.line_91_2)], new Map(), imageUrl, avatars).flatMap((day) => day.items);

    expect(rows.map((row) => row.messageId)).toEqual([7, 8]);
    expect(rows.every((row) => row.album === undefined)).toBe(true);
  });

  test("two albums side by side are two rows", () => {
    const rows = buildDays(wording, [picture(10, 10), picture(11, 10), picture(12, 12), picture(13, 12)], new Map(), imageUrl, avatars).flatMap((day) => day.items);

    expect(rows.map((row) => [row.messageId, row.album?.length])).toEqual([[10, 2], [12, 2]]);
  });
});

// A turn the chat agent passed a message over in stands as a line under that message, read off the ending
// the bot wrote down on it.
describe("the line under a message the chat agent did not answer", () => {
  function skip(id: number, messageId: number): Judgement {
    return { id, chatId: ROOM_ID, messageId, stage: "skipped", verdict: "SKIP", detail: null, createdAt: 1_788_000_010 };
  }

  function chat(id: number, messageId: number): Judgement {
    return { ...skip(id, messageId), stage: "chat" };
  }

  test("stands under the message the silent turn read and no other", () => {
    const judgements = new Map([[2, [chat(1, 2), skip(2, 2)]], [3, [chat(3, 3)]]]);
    const rows = buildDays(wording, [archived(1, KO.line_117), archived(2, KO.line_117_2), archived(3, KO.line_117_3)], judgements, imageUrl, avatars)
      .flatMap((day) => day.items);

    expect(rows.map((row) => row.skipped)).toEqual([0, 1, 0]);
    // The ending still rides on the message, so a copy of it carries the record.
    expect(copyItemOf(rows[1]!).judgements.map((judgement) => judgement.stage)).toEqual(["chat", "skipped"]);
  });

  test("a silent turn over an album stands under the album's row", () => {
    const picture = (messageId: number): ArchivedMessage => ({ ...archived(messageId, ""), imagePath: `/kept/${messageId}.jpg`, album: 20 });
    const rows = buildDays(wording, [picture(20), picture(21), picture(22)], new Map([[22, [skip(1, 22)]]]), imageUrl, avatars)
      .flatMap((day) => day.items);

    expect(rows.map((row) => [row.messageId, row.skipped])).toEqual([[20, 1]]);
  });

  test("says the words once, and counts silent turns over the same message", () => {
    expect(skippedLine(wording, 1)).toBe(wording("room.status.outcome_skipped", { subject: KO.line_134 }));
    expect(skippedLine(wording, 1_200)).toBe(wording("room.status.outcome_skipped_times", { subject: KO.line_135, n: "1,200" }));
  });

});

// A voice briefing that speaks a line of the room is a part of that line: it stands on the line's
// chip line, and the voice message is no row of its own, whether or not the line was read with it.
describe("a briefing of a line", () => {
  const sound = { id: 5, kind: "audio" as const, name: "voice.ogg", bytes: 12_000, type: "audio/ogg", available: true };
  const rowsOf = (messages: ArchivedMessage[]) => buildDays(wording, messages, new Map(), imageUrl, avatars).flatMap((day) => day.items).map((row) => row.messageId);

  test("stands on the line it speaks, and the voice message is not a row", () => {
    const line = { ...archived(-41, KO.line_147, "agent-a"), briefing: { state: "ready" as const, source: "voice" as const, voiceMessageId: 9147, sound } };
    const voice = { ...archived(9147, KO.line_148, "agent-a"), briefs: -41 };
    const rows = buildDays(wording, [archived(1, KO.line_149), line, voice], new Map(), imageUrl, avatars).flatMap((day) => day.items);

    expect(rows.map((row) => row.messageId)).toEqual([1, -41]);
    expect(rows[1]!.briefing).toEqual({ state: "ready", source: "voice", voiceMessageId: 9147, sound });
    expect(rows[0]!.briefing).toBeNull();
  });

  test("a voice message whose line is not among the rows read stands nothing until it is", () => {
    const voice = { ...archived(9147, KO.line_157, "agent-a"), briefs: -41 };
    const rows = buildDays(wording, [voice, archived(2, KO.line_158)], new Map(), imageUrl, avatars).flatMap((day) => day.items);

    expect(rows.map((row) => row.messageId)).toEqual([2]);
  });

  test("a voice message that speaks no line stands as its own row", () => {
    const rows = buildDays(wording, [{ ...archived(9148, KO.line_164, "agent-a"), briefs: null }], new Map(), imageUrl, avatars).flatMap(
      (day) => day.items
    );

    expect(rows.map((row) => row.messageId)).toEqual([9148]);
  });

  // A summary of a notice turn and the report it speaks arrive in either order; whichever comes first,
  // the voice is never a row of its own (docs/web.md, the voice briefing chip of a line).
  test("a summary whose voice arrives before its report stands as no row while it awaits the line", () => {
    const awaiting = { ...archived(9149, "Job 548 finished.", "agent-a"), briefs: null, awaitsLine: true };
    const line = archived(-42, "Job 548 finished, all tests passed.", "agent-a");

    expect(rowsOf([archived(1, "question"), awaiting])).toEqual([1]);
    expect(rowsOf([archived(1, "question"), awaiting, line])).toEqual([1, -42]);
    expect(rowsOf([archived(1, "question"), { ...awaiting, awaitsLine: false, briefs: -42 }, line])).toEqual([1, -42]);
  });

  test("a summary whose report arrives first stands on it as its voice lands", () => {
    const line = archived(-42, "Job 548 finished, all tests passed.", "agent-a");

    expect(rowsOf([archived(1, "question"), line])).toEqual([1, -42]);
    expect(rowsOf([archived(1, "question"), line, { ...archived(9150, "Job 548 finished.", "agent-a"), briefs: -42 }])).toEqual([1, -42]);
  });
});

describe("the row that stands while the chat agent is working", () => {
  const bot = 10000001;
  const face: AvatarIndex = new Map([[`person:${bot}`, "/bmo/api/avatars/person/10000001?v=300"]]);

  function bmo(messageId: number): ArchivedMessage {
    return { ...archived(messageId, KO.line_195, "agent-a"), senderId: bot };
  }

  test("wears the very picture the answer it waits for will wear", () => {
    const messages = [archived(1, KO.line_199), bmo(2)];
    const waiting = botAvatar(messages, face);
    const answered = buildDays(wording, messages, new Map(), imageUrl, face)
      .flatMap((day) => day.items)
      .find((item) => item.senderName === "agent-a");

    expect(waiting).toEqual({ src: "/bmo/api/avatars/person/10000001?v=300", alt: "agent-a" });
    expect(answered?.look.avatar).toEqual(waiting);
  });

  test("takes the chat agent's number from what the chat agent has said in this room", () => {
    expect(botSpeaker([archived(1, KO.line_210), bmo(2)])).toEqual({ id: bot, name: "agent-a" });
  });

  test("falls back to the chat agent's face by its name where it has never spoken, and to its letter without one", () => {
    expect(botSpeaker([archived(1, KO.line_214)])).toEqual({ id: null, name: "agent-a" });
    expect(botAvatar([archived(1, KO.line_215)], new Map([["agent:agent-a", "/agent-a.jpg"]]))).toMatchObject({ src: "/agent-a.jpg" });
    expect(botAvatar([archived(1, KO.line_215)], face)).toMatchObject({ text: "A" });
    expect(botAvatar([archived(1, KO.line_215)], face).icon).toBeUndefined();
  });

  test("and its letter too where the chat agent has spoken but has no picture, as everyone's", () => {
    expect(botAvatar([bmo(2)], new Map())).toMatchObject({ text: "A" });
    expect(botAvatar([bmo(2)], new Map()).icon).toBeUndefined();
  });
});

// An answer sent in the owner's own account is filed under the owner's number and name; the server names the agent
// whose answer it is, and the row wears that agent's name and face with the account named beside it (docs/web.md,
// 「An answer sent in the owner's own account wears the agent's face」).
describe("an answer sent in the owner's own account", () => {
  const voiced = (messageId: number): ArchivedMessage => ({ ...archived(messageId, KO.line_195, "person-owner"), agent: true, round: "round:1", voicedBy: "agent-a" });

  afterAll(() => holdCatalogue([]));

  test("wears the agent's label from the agents table and its face, and names the account it went out in", () => {
    holdCatalogue([catalogueRow("agent-a", "chat", "Agent A")]);

    const [row] = buildDays(wording, [voiced(1)], new Map(), imageUrl, avatars).flatMap((day) => day.items);

    expect(row).toMatchObject({ senderName: "Agent A", voice: "person-owner", senderId: owner });
    expect(row?.look).toMatchObject({ role: "assistant", avatar: { text: "A", alt: "Agent A" } });
  });

  test("and the row standing for the agent's next turn wears the same", () => {
    holdCatalogue([catalogueRow("agent-a", "chat", "Agent A")]);

    expect(botSpeaker([voiced(1)])).toEqual({ id: owner, name: "Agent A" });
    expect(botAvatar([voiced(1)], new Map([[`person:${owner}`, "/owner.jpg"]]))).toMatchObject({ text: "A", alt: "Agent A" });
    expect(botAvatar([voiced(1)], new Map([["agent:agent-a", "/agent-a.jpg"]]))).toEqual({ src: "/agent-a.jpg", alt: "Agent A" });
  });

  test("an answer filed under its own name wears no account mark", () => {
    const [row] = buildDays(wording, [{ ...archived(2, KO.line_195, "agent-a"), round: "round:2" }], new Map(), imageUrl, avatars).flatMap((day) => day.items);

    expect(row?.voice).toBeUndefined();
    expect(row?.senderName).toBe("agent-a");
  });
});

describe("which side a row is laid out from", () => {
  test("a message on the right wears its picture on the right", () => {
    expect(sideLayout("right").container).toContain("flex-row-reverse justify-start");
    expect(sideLayout("right").container).toContain(bubbleBottomPad);
  });

  // A bubble on either side is at most one width: on a phone the row less the choosing column, over
  // most of the far side's photo column; from the width the app changes its mind at, the row less that column and three quarters of
  // the row as well, so a bubble on the left never reaches where one on the right could begin.
  test("and both sides share one widest, which leaves the choosing column clear on a phone and the far photo column from there up", () => {
    expect(sideLayout("right").container).toContain(rowWidth);
    expect(sideLayout("left").container).toContain(rowWidth);
    expect(rowWidth).toBe("max-w-[calc(100%-var(--chat-choose-room))] sm:max-w-[min(calc(100%-var(--chat-face-room)),75%)]");
  });

  test("the photo stands the conversation's own step from its bubble, and nothing hangs under the bubble", () => {
    expect(sideLayout("left").container).toContain("gap-(--chat-face-gap)");
    expect(sideLayout("right").container).toContain(bubbleBottomPad);
    expect(bubbleBottomPad).toBe("pb-0");
  });

  // A line on the leading side and its run's photo take this one slide, so they move as one piece,
  // on the one motion the top bar grows and folds on, so neither waits for the other.
  test("the slide aside runs on the choosing motion with no wait, both ways", () => {
    const moving = `transition-transform ${choosingMotion}`;

    expect(choosingMotion).not.toContain("delay");
    expect(asideSlide(true)).toBe(`${moving} translate-x-(--chat-choose-room)`);
    expect(asideSlide(false)).toBe(moving);
  });

  test("every kind of row takes the side it stands on", () => {
    const days = buildDays(
      wording,
      [archived(1, KO.line_257), archived(2, KO.line_257_2, "agent-a")],
      new Map(),
      imageUrl,
      avatars,
      pendingItems(outboxOf(KO.line_261, [], 1_788_000_100), speaker, avatars),
      [owner]
    );
    const rows = days.flatMap((day) => day.items);

    expect(rows.map((row) => row.look.side)).toEqual(["right", "left", "right"]);
    expect(rows.map((row) => sideLayout(row.look.side).container.includes("flex-row-reverse"))).toEqual([true, false, true]);
  });

  // The console is read by the owner, so the right is their own side and nothing else earns it.
  test("only the owner's own messages stand on the right, in a group as in their own chat", () => {
    const rows = buildDays(
      wording,
      [bySomeoneElse(1, KO.line_274), archived(2, KO.line_274_2), archived(3, KO.line_274_3, "agent-a")],
      new Map(),
      imageUrl,
      avatars,
      [],
      [owner]
    ).flatMap((day) => day.items);

    expect(rows.map((row) => row.look.side)).toEqual(["left", "right", "left"]);
  });

  test("every sender linked to the signed-in person is theirs, in a room a chat service carries or one the console made", () => {
    const linked = 4_218_991;
    const rows = buildDays(
      wording,
      [bySomeoneElse(1, "words from a linked sender"), archived(2, "words under the owner's sender"), { ...archived(3, "a record room's agent", "agent-a"), senderId: null }],
      new Map(),
      imageUrl,
      avatars,
      [],
      [owner, linked]
    ).flatMap((day) => day.items);

    expect(rows.map((row) => row.look.side)).toEqual(["right", "right", "left"]);
    expect(sideOf(null, [owner])).toBe("left");
  });

  test("an agent's words wear its own face, wherever they stand under no number of their own", () => {
    const faces: AvatarIndex = new Map([["agent:agent-a", "/api/avatars/agent-a.jpg"]]);
    const [row] = buildDays(wording, [{ ...archived(1, "an answer on the record road", "agent-a"), senderId: null, speaker: "agent-a" }], new Map(), imageUrl, faces, [], [owner])
      .flatMap((day) => day.items);

    expect(row?.look.avatar).toMatchObject({ src: "/api/avatars/agent-a.jpg" });
  });

  test("an agent's words under no number of their own stand under that agent's name, whatever name they were filed with", () => {
    const [row] = buildDays(wording, [{ ...archived(1, "another supervisor's answer", "BMO"), agent: true, senderId: null, speaker: "agent-a" }], new Map(), imageUrl, avatars, [], [owner])
      .flatMap((day) => day.items);

    expect(row?.senderName).not.toBe("BMO");
  });

  test("a side is decided by who sent it and never by the look the bubble wears", () => {
    const rows = buildDays(wording, [bySomeoneElse(1, KO.line_286)], new Map(), imageUrl, avatars, [], [owner])
      .flatMap((day) => day.items);

    // Another person is still a person: the bubble and the plain characters are what the chat agent's own
    // answer is told apart by, and the side says only whose message it is.
    expect(rows[0]?.look).toMatchObject({ side: "left", role: "user", variant: "soft", markdown: false });
  });

  test("with no owner to know, the whole room reads down the left rather than guessing", () => {
    const rows = buildDays(wording, [archived(1, KO.line_295)], new Map(), imageUrl, avatars, [], [])
      .flatMap((day) => day.items);

    expect(rows.map((row) => row.look.side)).toEqual(["left"]);
    expect(sideOf(owner, [])).toBe("left");
    expect(sideOf(null, [])).toBe("left");
  });

  test("only what the server says an agent sent stands as markdown, whatever the agent is called", () => {
    const days = buildDays(
      wording,
      [archived(1, KO.line_306), { ...archived(2, KO.line_306_2, KO.line_306_3), agent: true }],
      new Map(),
      imageUrl,
      avatars,
      pendingItems(outboxOf(KO.line_310, [], 1_788_000_100), speaker, avatars)
    );

    expect(days.flatMap((day) => day.items).map((row) => row.look.markdown)).toEqual([false, true, false]);
  });

  test("only what the server says the bot sent as the service stands as a system notice", () => {
    const days = buildDays(
      wording,
      [{ ...archived(1, KO.line_319, "agent-a"), agent: true, notice: true }, { ...archived(2, KO.line_319_2, KO.line_319_3), agent: true }],
      new Map(),
      imageUrl,
      avatars,
      pendingItems(outboxOf(KO.line_323, [], 1_788_000_100), speaker, avatars)
    );

    expect(days.flatMap((day) => day.items).map((row) => row.notice)).toEqual([true, false, false]);
  });
});

describe("a message that is still on its way", () => {
  test("stands in the owner's own name and on their own side, marked as going", () => {
    const [row] = pendingItems(outboxOf(KO.line_332, [], 1_788_000_100), speaker, avatars);

    expect(row).toMatchObject({
      senderId: owner,
      senderName: "owner",
      text: KO.line_337,
      sentAt: 1_788_000_100,
      pending: { state: "sending", reason: null }
    });
    expect(row?.look.side).toBe("right");
  });

  test("shows the picture that is going with it", () => {
    const [row] = pendingItems(outboxOf(KO.line_345, [picked("a.jpg", "blob:a")], 1), speaker, avatars);

    expect(row?.imageUrl).toBe("blob:a");
  });

  test("the pictures of one press stand as one row, the album with the words once under it", () => {
    const items = outboxOf(KO.line_351, [picked("a.jpg", "blob:a"), picked("b.jpg", "blob:b")], 1);
    const rows = pendingItems(withSent(items, items[0]?.key ?? "", 9), speaker, avatars);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ key: items[0]?.key, text: KO.line_355, pending: { state: "sending", sent: false } });
    expect(rows[0]?.album).toEqual([{ messageId: null, src: "blob:a" }, { messageId: null, src: "blob:b" }]);
  });

  test("a picture of the press that failed stands on its own, to be sent again alone", () => {
    const items = outboxOf(KO.line_360, [picked("a.jpg", "blob:a"), picked("b.jpg", "blob:b")], 1);
    const rows = pendingItems(withFailed(items, items[1]?.key ?? "", KO.line_361), speaker, avatars);

    expect(rows.map((row) => [row.album?.length, row.pending?.state])).toEqual([[1, "sending"], [undefined, "failed"]]);
  });

  test("says the name of a file the browser cannot draw", () => {
    const file = { key: "k", file: new File(["x"], KO.line_367, { type: "application/pdf" }), previewUrl: null };
    const [row] = pendingItems(outboxOf("", [file], 1), speaker, avatars);

    expect(row?.fileName).toBe(KO.line_370);
    expect(row?.imageUrl).toBeNull();
  });

  test("carries the reason when it failed", () => {
    const items = outboxOf(KO.line_375, [], 1);
    const [row] = pendingItems(withFailed(items, items[0]?.key ?? "", KO.line_376), speaker, avatars);

    expect(row?.pending).toEqual({ state: "failed", reason: KO.line_378, sent: false });
  });

  test("carries one mark beside its time from going to sent, which an archived message of theirs keeps", () => {
    const items = outboxOf(KO.line_382, [], 1);
    const key = items[0]?.key ?? "";
    const marks = [items, withChecking(items, key), withSent(items, key, 9), withFailed(items, key, KO.line_384)].map(
      (held) => sendMark(pendingItems(held, speaker, avatars)[0]!)
    );
    const days = buildDays(wording, [archived(1, KO.line_387), archived(2, KO.line_387_2, "agent-a")], new Map(), imageUrl, avatars, [], [owner]);

    expect(marks).toEqual(["sending", "checking", "sent", "failed"]);
    expect(days.flatMap((day) => day.items).map(sendMark)).toEqual(["sent", null]);
  });
});

describe("the feed the room walks", () => {
  test("puts what is on its way after what the archive holds", () => {
    const pending = pendingItems(outboxOf(KO.line_396, [], 1_788_000_100), speaker, avatars);
    const days = buildDays(wording, [archived(1, KO.line_397)], new Map(), imageUrl, avatars, pending);
    const items = days.flatMap((day) => day.items);

    expect(items.map((item) => item.text)).toEqual([KO.line_400, KO.line_400_2]);
  });

  test("marks nothing the archive holds as on its way", () => {
    const days = buildDays(wording, [archived(1, KO.line_404), archived(2, KO.line_404_2, "agent-a")], new Map(), imageUrl, avatars);

    expect(days.flatMap((day) => day.items).every((item) => item.pending === null)).toBe(true);
  });

  test("carries the wait the archive measured, and none where it measured none", () => {
    const answered = { ...archived(2, KO.line_410, "agent-a"), answerSeconds: 12 };
    const days = buildDays(wording, [archived(1, KO.line_411), answered], new Map(), imageUrl, avatars);
    const items = days.flatMap((day) => day.items);

    // What the room said is nobody's answer, and a message archived without a measurement is
    // read as having none rather than as nought seconds.
    expect(items.map((item) => item.answerSeconds)).toEqual([null, 12]);
  });
});

// A word typed into the web console is numbered below zero and one from Telegram above it, so the
// numbers say nothing about which was said first. The archive hands every page back in the room's
// own order — by the moment each was said, and by the order it stored the two said in one second —
// and the feed's job is to keep that order rather than to invent one.
// What a round spent and did is read after the page and stands on the round's last answer alone (docs/web.md, the room
// screen's chip line).
describe("a round's figures", () => {
  const inRound = (messageId: number, senderName: string, round: string | null): ArchivedMessage => ({ ...archived(messageId, "words", senderName), round });
  const rows = [inRound(1, "owner", null), inRound(2, "agent-a", "round-a"), inRound(3, "agent-a", "round-a"), inRound(4, "agent-a", "round-b")];
  const spend = { inputTokens: 10, outputTokens: 2, cacheReadTokens: 0, cacheWriteTokens: 0, measured: 1, unmeasured: 0, roads: [], context: null };
  const actions = { agent: "agent-a", runs: ["run-a"], documents: 0, held: 0, tools: 1, brain: 0, records: [] };

  test("are asked by each round's last answer", () => {
    expect([...roundEnds(rows)]).toEqual([["round-a", 3], ["round-b", 4]]);
  });

  test("stand on the round's last answer, which is marked while they are on their way", () => {
    const figures = new Map([["round-a", { messageId: 3, round: "round-a", spend, actions }]]);
    const placed = withRoundFigures(rows, figures, new Set(["round-b"]));

    expect(placed.map((one) => [one.messageId, one.spend ?? null, one.actions ?? null, one.figuring ?? false])).toEqual([
      [1, null, null, false],
      [2, null, null, false],
      [3, spend, actions, false],
      [4, null, null, true]
    ]);
    // A row already standing as it should is kept as it is.
    expect(withRoundFigures(placed, figures, new Set(["round-b"]))[3]).toBe(placed[3]);
  });

  test("move to a newer answer of the round when it arrives", () => {
    const figures = new Map([["round-b", { messageId: 4, round: "round-b", spend, actions }]]);
    const placed = withRoundFigures([...withRoundFigures(rows, figures, new Set()), inRound(5, "agent-a", "round-b")], figures, new Set());

    expect(placed.filter((one) => one.spend != null).map((one) => one.messageId)).toEqual([5]);
  });
});

describe("the order a page keeps", () => {
  const said = (messageId: number, sentAt: number, text: string): ArchivedMessage => ({
    ...archived(messageId, text),
    sentAt
  });

  test("keeps console and Telegram words in the order the archive gave them, even in one second", () => {
    const page = [
      said(900_058, 1_788_000_896, KO.line_432),
      said(-998_950_458, 1_788_000_896, KO.line_433),
      said(900_059, 1_788_000_897, KO.line_434)
    ];

    expect(mergedMessages([], page, "newer").map((message) => message.messageId)).toEqual([
      900_058,
      -998_950_458,
      900_059
    ]);
  });

  test("keeps a round's figure on the last message of the round it holds, however the parts arrived", () => {
    const spend = { inputTokens: 1, outputTokens: 2, cacheReadTokens: 3, cacheWriteTokens: 4, measured: 1, unmeasured: 0, roads: [], context: null };
    const first = { ...said(900_060, 1_788_000_900, KO.line_446), round: "round:a", spend };
    const second = { ...said(900_061, 1_788_000_900, KO.line_447), round: "round:a", spend };
    const other = { ...said(900_062, 1_788_000_901, KO.line_448), round: "round:b", spend };

    const merged = mergedMessages([first], [second, other], "newer");

    expect(merged.map((message) => [message.messageId, message.spend !== null])).toEqual([
      [900_060, false],
      [900_061, true],
      [900_062, true]
    ]);
  });

  test("stands an older page before what the room holds, and a newer page after it", () => {
    const held = [said(900_059, 1_788_000_897, KO.line_460)];
    const older = [said(-998_950_458, 1_788_000_896, KO.line_461)];
    const newer = [said(-998_950_460, 1_788_000_898, KO.line_462)];

    expect(mergedMessages(held, older, "older").map((message) => message.messageId)).toEqual([
      -998_950_458,
      900_059
    ]);
    expect(mergedMessages(held, newer, "newer").map((message) => message.messageId)).toEqual([
      900_059,
      -998_950_460
    ]);
  });

  test("replaces a row it already holds where it stands, which is what an edited message is", () => {
    const held = [
      said(900_058, 1_788_000_896, KO.line_476),
      said(-998_950_458, 1_788_000_896, KO.line_477),
      said(900_059, 1_788_000_897, KO.line_478)
    ];
    const again = [said(900_058, 1_788_000_896, KO.line_480)];
    const merged = mergedMessages(held, again, "newer");

    expect(merged.map((message) => message.messageId)).toEqual([900_058, -998_950_458, 900_059]);
    expect(merged[0]?.text).toBe(KO.line_484);
  });

  test("stands the room's end read over a stretch opened at an unread message where its rows stand", () => {
    // The stretch opened at an unread message starts later than the end page does: the end's earlier
    // rows go above it, never under the newest row with their day's date mark again.
    const stretch = [said(107_738, 1_791_450_943, KO.line_490), said(107_793, 1_791_482_960, KO.line_490_2)];
    const end = [
      said(107_736, 1_791_450_923, KO.line_492),
      said(-998_950_470, 1_791_450_928, KO.line_493),
      said(107_738, 1_791_450_943, KO.line_494),
      said(107_750, 1_791_455_000, KO.line_495),
      said(107_793, 1_791_482_960, KO.line_496),
      said(107_794, 1_791_483_335, KO.line_497)
    ];

    expect(mergedMessages(stretch, end, "newer").map((message) => message.messageId)).toEqual([
      107_736,
      -998_950_470,
      107_738,
      107_750,
      107_793,
      107_794
    ]);
  });
});

describe("a reply and the message it answers", () => {
  test("an archived reply carries its quote, and a reply on its way carries the one it was sent with", () => {
    const quote = { messageId: 1, senderName: KO.line_513, text: KO.line_513_2 };
    const reply = { ...archived(2, KO.line_514), replyToMessageId: 1, replyQuote: quote };
    const pending = pendingItems(outboxOf(KO.line_515, [], 1_788_000_100, quote), speaker, avatars);
    const rows = buildDays(wording, [archived(1, KO.line_516), reply], new Map(), imageUrl, avatars, pending).flatMap((day) => day.items);

    expect(rows.map((row) => row.quote?.messageId ?? null)).toEqual([null, 1, 1]);
    expect(quoteText(wording, quote)).toEqual({ name: KO.line_519, words: KO.line_519_2, media: null });
  });

  test("a quote of a message the archive does not hold says so and nothing else", () => {
    expect(quoteText(wording, { messageId: MESSAGE_ID, senderName: null, text: "" })).toEqual({ name: wording("room.label.unknown_message"), words: "", media: null });
  });

  test("a quote of what a message carried stands a preview of it, with its caption or what it is", () => {
    const voice = { id: 3, kind: "audio" as const, name: "voice.ogg", bytes: 10, type: "audio/ogg", available: true };
    const sheet = { id: 4, kind: "document" as const, name: KO.line_528, bytes: 10, type: null, available: true };

    expect(quoteText(wording, { messageId: 1, senderName: KO.line_530, text: KO.line_530_2, pictured: true })).toEqual({ name: KO.line_530, words: KO.line_530_3, media: { kind: "picture" } });
    expect(quoteText(wording, { messageId: 1, senderName: KO.line_531, text: KO.line_531_2, pictured: true }).words).toBe(KO.line_531_3);
    expect(quoteText(wording, { messageId: 2, senderName: KO.line_532, text: KO.line_532_2, attachment: voice })).toEqual({ name: KO.line_532, words: KO.line_532_3, media: { kind: "voice", attachment: voice } });
    expect(quoteText(wording, { messageId: 3, senderName: KO.line_533, text: KO.line_533_2, attachment: sheet }).words).toBe(KO.line_533_3);
  });
});

describe("the mark a kept file or picture leaves in the words", () => {
  const document = { id: 1, kind: "document" as const, name: KO.line_538, bytes: 3, type: null, available: true };
  const filed = { attachments: [document], pictured: false };

  test("is not said again above the file's own line, and a caption after it stays", () => {
    expect(withoutMediaMark(KO.line_542, filed, { expressions: [], formats: [] })).toEqual({ text: "", expressions: [], formats: [] });
    expect(withoutMediaMark(KO.line_543, filed, { expressions: [], formats: [] }).text).toBe(KO.line_543_2);
  });

  test("is not said again above a kept picture, and a caption after it stays", () => {
    const pictured = { attachments: [], pictured: true };

    expect(withoutMediaMark(KO.line_549, pictured, { expressions: [], formats: [] }).text).toBe("");
    expect(withoutMediaMark(KO.line_550, pictured, { expressions: [], formats: [] }).text).toBe(KO.line_550_2);
  });

  test("stays where no such file or picture stands", () => {
    expect(withoutMediaMark(KO.line_554, filed, { expressions: [], formats: [] }).text).toBe(KO.line_554);
    expect(withoutMediaMark(KO.line_555, { attachments: [], pictured: false }, { expressions: [], formats: [] }).text).toBe(KO.line_555);
  });

  test("is not said again above a kept sound, whose player shows its length and whose line its name", () => {
    const sound = { attachments: [{ ...document, kind: "audio" as const, name: "a.mp3" }], pictured: false };

    expect(withoutMediaMark(KO.line_561, sound, { expressions: [], formats: [] }).text).toBe(KO.line_561_2);
    expect(withoutMediaMark(KO.line_562, sound, { expressions: [], formats: [] }).text).toBe("");
    expect(withoutMediaMark(KO.line_563, sound, { expressions: [], formats: [] }).text).toBe("");
    expect(withoutMediaMark(KO.line_564, sound, { expressions: [], formats: [] }).text).toBe("");
    expect(withoutMediaMark(KO.line_565, sound, { expressions: [], formats: [] }).text).toBe(KO.line_565_2);
    expect(withoutMediaMark(KO.line_566, filed, { expressions: [], formats: [] }).text).toBe(KO.line_566);
  });

  test("of a sound stays where it names what the line does not", () => {
    const sound = { attachments: [{ ...document, kind: "audio" as const, name: "a.mp3" }], pictured: false };

    expect(withoutMediaMark(KO.line_572, sound, { expressions: [], formats: [] }).text).toBe(KO.line_572);
  });

  test("is not said again above a kept video, whose player shows it and its length", () => {
    const video = { attachments: [{ ...document, kind: "video" as const, name: "video.mp4" }], pictured: false };

    expect(withoutMediaMark(KO.line_578, video, { expressions: [], formats: [] }).text).toBe("");
    expect(withoutMediaMark(KO.line_579, video, { expressions: [], formats: [] }).text).toBe("");
    expect(withoutMediaMark(KO.line_580, video, { expressions: [], formats: [] }).text).toBe(KO.line_580_2);
    expect(withoutMediaMark(KO.line_581, video, { expressions: [], formats: [] }).text).toBe(KO.line_581_2);
    expect(withoutMediaMark(KO.line_582, filed, { expressions: [], formats: [] }).text).toBe(KO.line_582);
  });

  test("moves the expressions back by what it took off", () => {
    const expression = { offset: 16, length: 2, attachment: { ...document, kind: "sticker" as const } };
    const shown = withoutMediaMark(KO.line_587, filed, { expressions: [expression], formats: [] });

    expect(shown.text).toBe(KO.line_589);
    expect(shown.expressions.map((one) => one.offset)).toEqual([1]);
  });

  test("the row stands the words without it and copies the words as the archive holds them", () => {
    const message = { ...archived(3, KO.line_594), attachments: [document] };
    const [row] = buildDays(wording, [message], new Map(), imageUrl, avatars).flatMap((day) => day.items);

    expect(row?.shownText).toBe("");
    expect(row === undefined ? null : copyItemOf(row).text).toBe(KO.line_598);
  });
});

describe("a message that is only what it carried", () => {
  const document = { id: 1, kind: "document" as const, name: "palette.html", bytes: 3, type: null, available: true };
  const sticker = { id: 2, kind: "sticker" as const, name: "sticker.webp", bytes: 3, type: null, available: true };

  function rowOf(message: ArchivedMessage) {
    return buildDays(wording, [message], new Map(), imageUrl, avatars, [], [owner]).flatMap((day) => day.items)[0];
  }

  test("stands a picture and a file in a bubble, and only a sticker sent alone with none", () => {
    expect(rowOf({ ...archived(1, KO.line_611), attachments: [document] })?.look.variant).toBe("soft");
    expect(rowOf({ ...archived(2, KO.line_612), imagePath: "/kept/2.jpg" })?.look.variant).toBe("soft");
    expect(rowOf({ ...archived(3, ""), attachments: [sticker] })?.look.variant).toBe("naked");
  });

  test("stands a drawn sticker without the archive's mark for it, which a sticker not kept keeps", () => {
    const mark = "[sticker 😊 (sample_set)]";
    const drawn = rowOf({ ...archived(4, mark), attachments: [sticker] });
    const missing = rowOf({ ...archived(5, mark), attachments: [{ ...sticker, available: false }] });

    expect(drawn?.look.variant).toBe("naked");
    expect(drawn?.shownText).toBe("");
    expect(drawn === undefined ? null : copyItemOf(drawn).text).toBe(mark);
    expect(missing?.look.variant).toBe("soft");
    expect(missing?.shownText).toBe(mark);
  });

  // A chat service marks what a message carried in the words of its own policy, which are not the pack's language,
  // and the archive keeps rows marked either way.
  test("stands a picture marked in a chat service's own words as the picture alone, its caption under it", () => {
    const alone = rowOf({ ...archived(6, "[Photo]"), imagePath: "/kept/6.jpg" });
    const captioned = rowOf({ ...archived(7, "[Photo]\nlook at this"), imagePath: "/kept/7.jpg" });
    const file = rowOf({ ...archived(8, "[File palette.html]"), attachments: [document] });
    const sound = rowOf({ ...archived(9, "[Audio 0:12]"), attachments: [{ ...document, kind: "audio" as const, name: "a.mp3" }] });

    expect(alone?.shownText).toBe("");
    expect(alone?.imageUrl).not.toBeNull();
    expect(alone === undefined ? null : copyItemOf(alone).text).toBe("[Photo]");
    expect(captioned?.shownText).toBe("look at this");
    expect(file?.shownText).toBe("");
    expect(sound?.shownText).toBe("");
    // A mark with nothing kept behind it stays, as the pack's own mark does.
    expect(rowOf(archived(10, "[Photo]"))?.shownText).toBe("[Photo]");
  });

  test("keeps the bubble where it has words, and where it carried nothing at all", () => {
    expect(rowOf({ ...archived(1, KO.line_629), attachments: [document] })?.look.variant).toBe("soft");
    expect(rowOf({ ...archived(2, KO.line_630), imagePath: "/kept/2.jpg" })?.look.variant).toBe("soft");
    expect(rowOf(archived(3, ""))?.look.variant).toBe("soft");
  });

  test("keeps its side, whoever sent it", () => {
    expect(rowOf({ ...archived(1, KO.line_635), imagePath: "/kept/1.jpg" })?.look.side).toBe("right");
  });

  test("going out, a picture stands in its bubble, with or without a caption", () => {
    const [bare] = pendingItems(outboxOf("", [picked("a.jpg", "blob:a")], 1), speaker, avatars);
    const [captioned] = pendingItems(outboxOf(KO.line_640, [picked("a.jpg", "blob:a")], 1), speaker, avatars);

    expect(bare?.look.variant).toBe("soft");
    expect(captioned?.look.variant).toBe("soft");
  });
});

describe("what a row hands over when it is copied", () => {
  const judgement: Judgement = {
    id: 3,
    chatId: ROOM_ID,
    messageId: 1,
    stage: "content-judge",
    verdict: KO.line_653,
    detail: null,
    createdAt: 1_788_000_050
  };

  test("who said it, when, which message, its words and every judgement on it", () => {
    const byMessage = new Map([[1, [judgement]]]);
    const [item] = buildDays(wording, [archived(1, KO.line_660)], byMessage, imageUrl, avatars).flatMap((day) => day.items);

    expect(item === undefined ? null : copyItemOf(item)).toEqual({
      senderName: "owner",
      senderId: owner,
      messageId: 1,
      sentAt: 1_788_000_000,
      text: KO.line_667,
      judgements: [judgement]
    });
  });
});

// A room screen used to read the newest hundred messages again every time the bot said one
// message had landed. In a fast room that is a hundred rows a minute at the screen for the sake
// of one, and worse than the clock it replaced. The news names the message, so the news is
// answered by reading past what the room already holds — one row on the ordinary turn.
describe("what one piece of news is worth reading", () => {
  const page = 100;
  // What the room is holding, oldest last — which is the order a page arrives in.
  const holding = (...ids: number[]) => ids.map((messageId) => ({ messageId }));

  test("everything past the newest row the room holds, which is that one message", () => {
    expect(feedRead(holding(8999, 9000), 9001, page)).toEqual({ kind: "after", after: 9000, limit: page });
  });

  // A piece of news that never arrived is not a row that is lost: the next one reads past the
  // newest row held and brings everything in between with it.
  test("and everything else that landed while the news was on its way", () => {
    expect(feedRead(holding(8999, 9000), 9004, page)).toEqual({ kind: "after", after: 9000, limit: page });
  });

  // An edit leaves the number where it was, so the number arriving is one the room already holds.
  // That row is asked for by its own number rather than past the number before it — the number
  // before it names no row as often as not.
  test("one row by its own number where the news names a message the room already holds", () => {
    expect(feedRead(holding(8700, 9000), 9000, page)).toEqual({ kind: "one", messageId: 9000 });
    expect(feedRead(holding(8700, 9000), 8700, page)).toEqual({ kind: "one", messageId: 8700 });
  });

  // The two numberings of one room. A word said from the console is numbered below zero and still
  // stands after the Telegram messages it was said after, so a number of one ranks against a
  // number of the other by nothing at all: what tells a new message from an edited one is whether
  // the room is holding that number, and nothing else.
  test("a console number announced into a room of Telegram numbers is new, not an edit", () => {
    expect(feedRead(holding(900012, 900013), -9001, page)).toEqual({
      kind: "after",
      after: 900013,
      limit: page,
    });
  });

  test("and the console row the room does hold is read as the edit it is", () => {
    expect(feedRead(holding(900013, -9000), -9000, page)).toEqual({
      kind: "one",
      messageId: -9000,
    });
  });

  test("a Telegram number announced past a console row at the end is new too", () => {
    expect(feedRead(holding(900013, -9000), 900014, page)).toEqual({
      kind: "after",
      after: -9000,
      limit: page,
    });
  });

  test("the page where the room holds nothing to read past", () => {
    expect(feedRead(holding(), 9001, page)).toEqual({ kind: "page" });
    expect(feedRead(holding(), null, page)).toEqual({ kind: "page" });
  });

  test("and the page where the news carried no number at all", () => {
    expect(feedRead(holding(9000), null, page)).toEqual({ kind: "after", after: 9000, limit: page });
  });

  // The one shape that cannot be appended: what came back is the oldest of the gap and the room
  // wants its end.
  test("a gap wider than a page is read as a page instead", () => {
    expect(needsPage(feedRead(holding(9000), 9400, page), true)).toBe(true);
    expect(needsPage(feedRead(holding(9000), 9001, page), false)).toBe(false);
  });

  // The one-row read is never turned into a page read: there is nothing past one row to want.
  test("a row read by its own number is never turned into a page read", () => {
    expect(needsPage(feedRead(holding(9000), 9000, page), true)).toBe(false);
    expect(needsPage({ kind: "page" }, true)).toBe(false);
  });
});

// The row a room stands while its own turn runs. It is a row of the feed and nothing else: what
// makes it look like the answer it is waiting for is that it is built as a row, so there is no
// second set of coordinates to keep matched against the first.
describe("the row a running turn stands in", () => {
  const run = { messageId: 41, startedAt: 1_788_490_000, received: { messages: 2, instructions: 1 }, progress: null };
  const face = { alt: "agent-a" };

  test("wears what the chat agent's own answer in this room wears, on the side it will stand on", () => {
    const row = runItem(run, { id: 10000001, name: "agent-a" }, face);

    expect(row.look).toEqual({ role: "assistant", side: "left", variant: "soft", avatar: face, markdown: true });
    expect(row.senderName).toBe("agent-a");
    expect(row.senderId).toBe(10000001);
    expect(row.sentAt).toBe(run.startedAt);
  });

  // Another supervisor answers under a number and a name of its own, and its answer takes the running row's
  // place: the server's word that an agent sent it is what keeps the look from changing as it does.
  test("and an agent's answer, under whatever name, takes its place in the same look", () => {
    const other = { ...archived(42, KO.line_769, KO.line_769_2), senderId: 9_000_000_000_000, agent: true };
    const [answered] = buildDays(wording, [other], new Map(), imageUrl, new Map()).flatMap((day) => day.items);
    const waiting = runItem(run, { id: other.senderId, name: other.senderName }, answered!.look.avatar!);

    expect(answered?.look).toEqual(waiting.look);
  });

  test("carries the turn and nothing a message carries", () => {
    const row = runItem(run, { id: null, name: "agent-a" }, face);

    expect(row.run).toBe(run);
    expect(row.text).toBe("");
    expect(row.parts).toEqual([]);
    expect(row.judgements).toEqual([]);
    expect(row.spend).toBeNull();
    expect(row.actions).toBeNull();
    expect(row.pending).toBeNull();
  });

  // The answer is dated the day it is sent, so a row standing in an earlier day would see a new date
  // mark open over its answer as the answer settles out of it.
  test("stands at the foot in the day its answer will be dated", () => {
    const days = buildDays(wording, [archived(1, "hello")], new Map(), imageUrl, avatars, [], [owner]);
    const said = days[0]!.items[0]!.sentAt;
    const today = runItem(run, { id: 87, name: "agent-a" }, face);
    const before = runItem({ ...run, startedAt: said - 86_400, speaker: { id: 5, name: "other" } }, { id: 5, name: "other" }, face);

    const opened = atFoot(wording, days, [today]);
    expect(opened.map((day) => day.items.map((row) => row.key))).toEqual([["m1"], [today.key]]);

    expect(atFoot(wording, days, [before, today]).map((day) => day.items.map((row) => row.key))).toEqual([["m1", before.key], [today.key]]);
    expect(atFoot(wording, [], [today]).map((day) => day.items)).toEqual([[today]]);
    expect(days[0]?.items).toHaveLength(1);
  });

  test("every row the archive holds says it is not one", () => {
    const [first] = buildDays(wording, [archived(1, KO.line_805)], new Map(), imageUrl, avatars, [], [owner]);

    expect(first?.items[0]?.run).toBeNull();
    expect(pendingItems(outboxOf(KO.line_808, [], 1_788_000_100), speaker, avatars)[0]?.run).toBeNull();
  });
});

const screen = await Bun.file(new URL("../../../apps/web/app/pages/rooms/[chatId].vue", import.meta.url)).text();
// A message kept and an act kept on one are the same news to the room: one row read again.
const wiring = screen.slice(screen.indexOf('on: ["message", "message-changed"]') - 700, screen.indexOf('on: ["message", "message-changed"]'));

// The reading itself lives in a composable the browser runs; what is held here is that the screen
// still routes the bot's news to it. The three causes are not alike — news names one message, a
// stream that came back missed whatever happened while it was down, and the clock only runs while
// there is no stream at all — so only the first of them can read one row.
describe("what the room screen does with each cause", () => {

  test("there is wiring to read at all, so nothing below passes on an empty string", () => {
    expect(wiring).toContain("useLiveRefresh");
  });

  test("news reads one row and the other two read the page", () => {
    expect(wiring).toContain('if (cause !== "event") {');
    expect(wiring).toContain("void refreshFeed();");
    expect(wiring).toContain("void catchUpFeed(event?.messageId ?? null);");
  });
});

// Where a room opens is settled before it is drawn, and its end is asked for beside the room list rather than after
// it; the markdown renderer is fetched beside both, so the first frame shown is the whole conversation (docs/web.md,
// 「Where a room opens is settled before it is drawn」).
describe("how the room screen opens", () => {
  const opening = screen.slice(screen.indexOf("const endRead"), screen.indexOf("letGoOfAsked();", screen.indexOf("const endRead")));

  test("the end is asked for before the room list is waited on, and the two are waited on together", () => {
    expect(opening).toContain("roomFeed.readEnd()");
    expect(opening.indexOf("roomFeed.readEnd()")).toBeLessThan(opening.indexOf("roomsSettled()"));
    expect(opening).toContain("Promise.all([endRead.catch(() => null), roomsSettled(), renderer])");
    expect(opening).toContain("roomFeed.load(endRead ?? undefined)");
  });

  test("the renderer is in before any read is put in the feed", () => {
    expect(opening.indexOf("loadMarkdownRenderer()")).toBeLessThan(opening.indexOf("openAt("));
    expect(opening.indexOf("renderer")).toBeLessThan(opening.indexOf("roomFeed.load("));
  });

  test("the rows are put in only while the conversation is unseen", () => {
    expect(opening.indexOf("hidden(true)")).toBeLessThan(opening.indexOf("roomFeed.load("));
    expect(opening.lastIndexOf("hidden(false)")).toBeGreaterThan(opening.indexOf("opened.value = true"));
  });
});

// The input bar keeps clear of a phone's gesture bar while nothing overlays the window, and the top bar carries the
// window's time left while it is open.
describe("the room's bars", () => {
  test("the input bar adds the bottom inset only while no keyboard overlays the window", () => {
    expect(screen).toContain("overlaid ? 'pb-(--chat-bar-pad)' : 'pb-[calc(var(--chat-bar-pad)+var(--bmo-safe-bottom))]'");
  });

  test("the top bar stands the window's clock while the window is open", () => {
    expect(screen).toContain('<RoomWindowClock v-if="listeningWindow !== null" :closes-at="listeningWindow.closesAt" />');
  });
});

// One sender's messages one after another stand as one block beside one photo.
describe("a sender's run", () => {
  const rows = (messages: ArchivedMessage[]) => buildDays(wording, messages, new Map(), imageUrl, avatars, [], [owner]).flatMap((day) => day.items);

  test("gathers one sender's messages in a row and parts at the next sender, a notice or a passed-over turn", () => {
    const said = rows([archived(1, KO.line_836), archived(2, KO.line_836_2), { ...archived(3, KO.line_836_3, "agent-a"), agent: true }, archived(4, KO.line_836_4)]);
    const runs = senderRuns(said, "day:1");

    expect(runs.map((run) => run.rows.map((row) => row.messageId))).toEqual([[1, 2], [3], [4]]);
    expect(runs.map((run) => run.side)).toEqual(["right", "left", "right"]);

    const passed = senderRuns([{ ...said[0]!, skipped: 1 }, said[1]!], "day:1");
    const notice = senderRuns([said[0]!, { ...said[1]!, notice: true }], "day:1");

    expect(passed.map((run) => run.rows.length)).toEqual([1, 1]);
    expect(notice.map((run) => run.notice)).toEqual([false, true]);
  });

  // A running turn's row handing its place to the answer leaves the run where it stood.
  test("is named after the row it follows, so it keeps its name when its own first row changes hands", () => {
    const [asked] = rows([archived(1, KO.line_851)]);
    const turn = runItem({ messageId: 1, startedAt: 1_788_000_010, received: null, progress: null }, { id: 87, name: "agent-a" }, { alt: "agent-a" });
    const [answer] = rows([{ ...archived(2, KO.line_853, "agent-a"), agent: true }]);

    expect(senderRuns([asked!, turn], "day:1").map((run) => run.key)).toEqual(["day:1", `after:${asked!.key}`]);
    expect(senderRuns([asked!, answer!], "day:1").map((run) => run.key)).toEqual(["day:1", `after:${asked!.key}`]);
  });

  test("rounds its bubbles as one block on the shared tiers, its last square at the foot where the tail hangs", () => {
    const left = { side: "left" as const, variant: "soft" as const };

    expect(bubbleLook(left, { first: true, last: true })).toContain("rounded-(--chat-radius)");
    expect(bubbleLook(left, { first: true, last: true })).toContain("rounded-bl-none");
    expect(bubbleLook(left, { first: true, last: false })).toContain("rounded-bl-(--chat-radius-joined)");
    expect(bubbleLook(left, { first: false, last: true })).toContain("rounded-tl-(--chat-radius-joined)");
    expect(bubbleLook({ side: "right", variant: "soft" }, { first: false, last: true })).toContain("rounded-br-none");
    expect(bubbleLook({ side: "left", variant: "naked" }, { first: true, last: true })).toBe("");
    expect(bubbleLook(left, { first: true, last: true })).not.toMatch(/rounded-[a-z0-9]*-?\[/);
  });

  // The owner's ground is the one teal token the stylesheet declares, which the tail wears with it,
  // and the raised ground stays everyone else's; every bubble draws its inks from its own ground, and
  // the contrast on both is measured in client/browser/bubble-contrast.test.ts.
  test("stands the owner's own on the teal token and everyone else's on the raised ground, both with inks of their own ground", () => {
    const place = { first: true, last: true };

    expect(bubbleLook({ side: "right", variant: "soft" }, place).split(" ")).toContain("chat-bubble");
    expect(bubbleLook({ side: "left", variant: "soft" }, place).split(" ")).toContain("chat-bubble");
    expect(bubbleLook({ side: "right", variant: "soft" }, place).split(" ")).toContain("chat-mine");
    expect(bubbleLook({ side: "left", variant: "soft" }, place)).not.toContain("chat-mine");
    expect(bubbleLook({ side: "left", variant: "soft" }, place).split(" ")).toContain("chat-theirs");
  });

  test("takes whatever each message carries, and ends where ten minutes pass between two", () => {
    const [words, picture, later] = rows([
      archived(1, KO.line_886),
      { ...archived(2, KO.line_887), imagePath: "a.jpg", sentAt: 1_788_000_000 + 60 },
      { ...archived(3, KO.line_888), sentAt: 1_788_000_000 + 60 + RUN_JOIN_SECONDS + 1 }
    ]);

    expect(senderRuns([words!, picture!, later!], "day:1").map((run) => run.rows.length)).toEqual([2, 1]);
  });

  test("names each sender in one colour of the palette, the same one wherever they speak", () => {
    expect(NAME_COLOURS).toHaveLength(8);
    expect(nameColour(30_000_003, "Carol")).toBe(nameColour(30_000_003, KO.line_896));
    expect(new Set([1, 2, 3, 4, 5, 6, 7, 8].map((id) => nameColour(id, "")))).toHaveProperty("size", 8);
    expect(nameColour(null, KO.line_898)).toBe(nameColour(null, KO.line_898));
    expect(NAME_COLOURS.every((colour) => /^text-\(--chat-name-\d\)$/.test(colour))).toBe(true);
  });

  test("a sender with no picture stands as their letter on the very hue their name is drawn in", async () => {
    const css = await Bun.file(new URL("../../../apps/web/app/assets/css/main.css", import.meta.url)).text();
    const nameHue = (at: number): string => new RegExp(`--chat-name-${at + 1}: var\\(--color-([a-z]+)-`).exec(css)?.[1] ?? "";

    expect(FACE_TONES).toHaveLength(NAME_COLOURS.length);
    FACE_TONES.forEach((tone, at) => expect(String(tone)).toBe(`bg-${nameHue(at)}-700`));

    for (const id of [30_000_003, 7, 8_709_910_429]) {
      expect(String(avatarFor(new Map(), "person", id, "Carol").class)).toStartWith(FACE_TONES[hueOf(id, "Carol")]!);
      expect(nameColour(id, "Carol")).toBe(String(NAME_COLOURS[hueOf(id, "Carol")]));
    }
  });
});

// The row a turn stands in gives its place to the answer by whichever read brings it first.
describe("a running row handing its place over", () => {
  const writing: NonNullable<RunState["progress"]> = {
    phase: "writing",
    tool: null,
    thinkingTokens: null,
    contextTokens: null,
    cacheReadTokens: null,
    requestId: null,
    spent: null,
    writtenTokens: null,
    actions: [],
    droppedActions: 0,
    droppedContext: 0
  };
  const run: RunState = { messageId: 1, startedAt: 1_788_000_010, received: null, progress: writing };
  const turn = runItem(run, { id: 87, name: "agent-a" }, { alt: "agent-a" });
  const answer = { ...archived(2, KO.line_921, "agent-a"), sentAt: 1_788_000_020, agent: true };

  test("stands until its answer is in the feed, and gives it its place in that same read", () => {
    const before = handOvers([turn], [archived(1, KO.line_924)], new Map());
    const after = handOvers([turn], [archived(1, KO.line_925), answer], before);

    expect(standingRuns([turn], before)).toEqual([turn]);
    expect(standingRuns([turn], after)).toEqual([]);
  });

  test("ignores an earlier answer, and stands again once the turn says something new of itself", () => {
    const earlier = { ...answer, messageId: 0, sentAt: 1_788_000_000 };
    const held = handOvers([turn], [earlier, answer], new Map());
    const thinking = runItem({ ...run, progress: { ...writing, phase: "thinking" } }, { id: 87, name: "agent-a" }, { alt: "agent-a" });

    expect(standingRuns([turn], handOvers([turn], [earlier], new Map()))).toEqual([turn]);
    expect(standingRuns([thinking], handOvers([thinking], [earlier, answer], held))).toEqual([thinking]);
  });

  // The record road files an agent's words under no number: only the agent the receiver names on the line says whose.
  test("a line under no number is the answer of the agent the receiver names on it, and no other agent's", () => {
    const named = { ...run, speaker: { id: -1, name: "agent-a" } };
    const unnumbered = runItem(named, { id: null, name: "agent-a" }, { alt: "agent-a" });
    const line = { ...answer, senderId: null, speaker: "agent-a" };
    const another = { ...line, messageId: 3, speaker: "agent-b" };

    expect(standingRuns([unnumbered], handOvers([unnumbered], [archived(1, KO.line_924), line], new Map()))).toEqual([]);
    expect(standingRuns([unnumbered], handOvers([unnumbered], [archived(1, KO.line_924), another], new Map()))).toEqual([unnumbered]);
    expect(turnAnswer(named, null, [line, another])).toBe(line);
  });

  test("a system notice and a voice briefing are never the answer", () => {
    const notice = { ...answer, messageId: 3, notice: true };
    const briefing = { ...answer, messageId: 4, briefs: 2 };
    const awaiting = { ...answer, messageId: 5, awaitsLine: true };

    expect(turnAnswer(run, 87, [notice, briefing, awaiting])).toBeUndefined();
    expect(turnAnswer(run, 87, [answer, notice, briefing, awaiting])).toBe(answer);
  });

  test("the message the turn's ending named is its answer, whoever it stands under", () => {
    const sent = { ...answer, messageId: 6, senderId: 4_218_991, speaker: "agent-b" };

    expect(turnAnswer({ ...run, answer: 6 }, 87, [sent, answer])).toBe(sent);
    // Until it is in the feed, the turn's own line stands for it.
    expect(turnAnswer({ ...run, answer: 6 }, 87, [answer])).toBe(answer);
  });

  test("a row standing while the chat agent only listens is no turn, so no answer takes its place", () => {
    const listening = runItem(listeningRuns([], { since: 1_788_000_000, closesAt: 1_788_000_180 })[0]!, { id: 87, name: "agent-a" }, { alt: "agent-a" });

    expect(listening.key).toBe(turn.key);
    expect(standingRuns([listening], handOvers([listening], [answer], new Map()))).toEqual([listening]);
  });

  test("its answer settles into the place it gave up, and a turn gone with no answer takes none", () => {
    const rows = buildDays(wording, [archived(1, KO.line_948), answer, bySomeoneElse(3, KO.line_948_2)], new Map(), imageUrl, new Map()).flatMap((day) => day.items);
    const fresh = rows.slice(1);
    const gone = { key: turn.key, senderId: turn.senderId, senderName: turn.senderName };
    const other = { key: "run:other", senderId: 4_218_992, senderName: KO.line_951 };

    expect([...settledAnswers([gone, other], fresh)]).toEqual([[fresh[0]!.key, turn.key]]);
    expect(settledAnswers([], fresh).size).toBe(0);
  });
});

// A row the feed already stands is handed back as that very row while it says the same, so only a
// row that changed is drawn again: by a read of the archive, which brings every message it covers as
// a new object, and by the owner's own sending, which changes no archived row at all (docs/web.md,
// 「What arrives comes in at the end」).
describe("the rows kept between changes", () => {
  const read = (messages: ArchivedMessage[], judgements = new Map<number, Judgement[]>()) => archivedRows(messages, judgements, imageUrl, avatars, [owner]);
  const skipped: Judgement = { id: 9, chatId: ROOM_ID, messageId: 2, stage: "skipped", verdict: "SKIP", detail: null, createdAt: 1_788_000_010 };

  test("a read of the archive hands back each row that says the same, and a new row for one that changed", () => {
    const standing = keptRows(undefined, read([archived(1, KO.line_967), archived(2, KO.line_967_2)]));
    const again = keptRows(standing, read([archived(1, KO.line_968), archived(2, KO.line_968_2), archived(3, KO.line_968_3)]));

    expect(again[0]).toBe(standing[0]!);
    expect(again[1]).not.toBe(standing[1]!);
    expect(again.map((row) => row.text)).toEqual([KO.line_972, KO.line_972_2, KO.line_972_3]);
  });

  test("a judgement arriving makes its own row new and leaves the others", () => {
    const standing = keptRows(undefined, read([archived(1, KO.line_976), archived(2, KO.line_976_2)]));
    const judged = keptRows(standing, read([archived(1, KO.line_977), archived(2, KO.line_977_2)], new Map([[2, [skipped]]])));

    expect(judged[0]).toBe(standing[0]!);
    expect(judged[1]).not.toBe(standing[1]!);
  });

  test("a group room's rows count no turn passed over, so no line stands under them", () => {
    const judgements = new Map([[2, [skipped]]]);
    const counted = (skipLines: boolean) => archivedRows([archived(1, "one"), archived(2, "two")], judgements, imageUrl, avatars, [owner], skipLines).map((row) => row.skipped);

    expect(counted(true)).toEqual([0, 1]);
    expect(counted(false)).toEqual([0, 0]);
  });

  test("a row's place in its run is one object for each place", () => {
    expect(runPlace(true, false)).toBe(runPlace(true, false));
    expect(runPlace(false, true)).toEqual({ first: false, last: true });
  });
});

// What the room's record keeps done to a message stands on its row (docs/web.md, 「What was done to a message」).
describe("what was done to a message", () => {
  test("reactions gather by emoji in the order they came, each reactor named and the reader's own marked", () => {
    const views = reactionViews(
      [
        { emoji: "\u{1F44D}", by: "1" },
        { emoji: "\u{2764}", by: "7" },
        { emoji: "\u{1F44D}", by: "agent-a" },
        { emoji: "", by: "9" }
      ],
      new Map([["7", "person-b"]]),
      [1]
    );

    expect(views.map((view) => [view.emoji, view.count, view.mine])).toEqual([
      ["\u{1F44D}", 2, true],
      ["\u{2764}", 1, false]
    ]);
    expect(views[1]?.who).toEqual(["person-b"]);
    expect(views[0]?.who[0]).toBe("1");
  });
});
