import { describe, expect, test } from "bun:test";

import {
  echoedKeys,
  graceEndsAt,
  heldMessages,
  keyChecks,
  landedKeys,
  landedPictures,
  nextSend,
  OUTBOX_CHECKING_SECONDS,
  OUTBOX_GRACE_SECONDS,
  OUTBOX_WAITING_SECONDS,
  outboxOf,
  overdueChecks,
  overdueWaits,
  previewsOf,
  restored,
  SEND_RETRY_MAX_MS,
  sendOutcome,
  sendRetryMs,
  settledKeys,
  standingKeys,
  withChecking,
  withFailed,
  withKeyOutcome,
  withResending,
  withSent,
  withWaiting,
  without
} from "../../../apps/web/app/domain/outbox";

import type { ArchivedMessage } from "../../../apps/web/shared/types";
import type { PickedFile } from "../../../apps/web/app/domain/attachments";
import type { OutboxItem } from "../../../apps/web/app/domain/outbox";
import { OWNER_ID as owner, ROOM_ID } from "../../support/ids";
import KO from "../../fixtures/app/domain/outbox.test.ko.json";

function picked(name: string, previewUrl: string | null = null): PickedFile {
  return { key: `k:${name}`, file: new File(["x"], name, { type: "image/jpeg" }), previewUrl };
}

function document(name: string): PickedFile {
  return { key: `k:${name}`, file: new File(["x"], name, { type: "application/pdf" }), previewUrl: null };
}

// The rows as the send answered them in the owner's private chat, with numbers the archive does not
// carry, so only what they say can find them there.
function answered(items: OutboxItem[]): OutboxItem[] {
  return items.reduce((rows, held, at) => withSent(rows, held.key, 5000 + at), items);
}

function archived(messageId: number, text: string, sentAt: number, senderId: number | null = owner): ArchivedMessage {
  return { chatId: ROOM_ID, messageId, senderId, senderName: "owner", sentAt, text, imagePath: null, replyToMessageId: null };
}

describe("what one press of send puts up", () => {
  test("the words, as one message on its way", () => {
    const items = outboxOf(KO.line_55, [], 100);

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ text: KO.line_58, file: null, startedAt: 100, state: "sending", messageId: null });
  });

  test("nothing at all when there is neither a word nor a file", () => {
    expect(outboxOf("", [], 100)).toEqual([]);
  });

  test("one message a file, the first carrying the words as its caption", () => {
    const items = outboxOf(KO.line_66, [picked("a.jpg"), picked("b.jpg")], 100);

    expect(items.map((held) => held.text)).toEqual([KO.line_68, ""]);
    expect(items.map((held) => held.file?.file.name)).toEqual(["a.jpg", "b.jpg"]);
  });

  test("a reply goes on the first message, the one the words go with", () => {
    const quote = { messageId: 7, senderName: KO.line_73, text: KO.line_73_2 };

    expect(outboxOf(KO.line_75, [], 100, quote).map((held) => held.reply)).toEqual([quote]);
    expect(outboxOf(KO.line_76, [picked("a.jpg"), picked("b.jpg")], 100, quote).map((held) => held.reply)).toEqual([quote, null]);
    expect(outboxOf(KO.line_77, [], 100)[0]?.reply).toBeNull();
  });

  test("rows of its own, never one key twice", () => {
    const keys = [...outboxOf(KO.line_81, [], 100), ...outboxOf(KO.line_81, [], 100)].map((held) => held.key);

    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("what is written on a row", () => {
  const items = outboxOf(KO.line_88, [], 100);
  const key = items[0]?.key ?? "";

  test("the number the bot gave it, while it is still on its way", () => {
    expect(withSent(items, key, 42)[0]).toMatchObject({ messageId: 42, state: "sending", reason: null });
  });

  test("the reason it did not go", () => {
    expect(withFailed(items, key, KO.line_96)[0]).toMatchObject({
      state: "failed",
      reason: KO.line_98
    });
  });

  test("sending it again forgets the failure and the number it never got", () => {
    const failed = withSent(withFailed(items, key, KO.line_103), key, 7);

    expect(withResending(failed, key)[0]).toMatchObject({ state: "sending", reason: null, messageId: null });
  });
});

describe("which rows the archive has caught up with", () => {
  test("the one whose picture is standing there, caption and all", () => {
    const items = outboxOf(KO.line_111, [picked("a.jpg")], 100);
    const withImage = { ...archived(42, KO.line_112, 101), imagePath: "data/images/-100/42.jpg" };

    expect(landedKeys(withSent(items, items[0]?.key ?? "", 9), [withImage], owner)).toHaveLength(1);
    expect(landedKeys(items, [archived(42, KO.line_115, 101)], owner)).toEqual([]);
  });

  test("the one whose number the room numbers the same for both accounts", () => {
    const items = outboxOf(KO.line_119, [], 100);
    const sent = withSent(items, items[0]?.key ?? "", 42);

    expect(landedKeys(sent, [{ ...archived(42, KO.line_122, 101), senderId: 999 }], owner)).toEqual([
      sent[0]?.key ?? ""
    ]);
  });

  test("never a row whose send has not answered: the same words said a moment before are not it", () => {
    const items = outboxOf(KO.line_128, [], 100);
    const key = items[0]?.key ?? "";

    expect(landedKeys(items, [archived(42, KO.line_131, 100)], owner)).toEqual([]);
    expect(landedKeys(withWaiting(items, [key], 100), [archived(42, KO.line_132, 100)], owner)).toEqual([]);
  });

  test("the one whose words are there even after the send has answered with a number of its own", () => {
    const items = outboxOf(KO.line_136, [], 100);
    const sent = withSent(items, items[0]?.key ?? "", 5000);

    expect(landedKeys(sent, [archived(42, KO.line_139, 101)], owner)).toHaveLength(1);
  });

  test("not somebody else's message, and not one from well before the row went up", () => {
    const items = answered(outboxOf(KO.line_143, [], 100));

    expect(landedKeys(items, [archived(42, KO.line_145, 100, 999)], owner)).toEqual([]);
    expect(landedKeys(items, [archived(42, KO.line_146, 60)], owner)).toEqual([]);
    expect(landedKeys(items, [archived(42, KO.line_147, 100)], owner)).toEqual([]);
  });

  test("one archived message answers for one row, not for two of the same words", () => {
    const items = answered([...outboxOf(KO.line_151, [], 100), ...outboxOf(KO.line_151, [], 100)]);

    expect(landedKeys(items, [archived(42, KO.line_153, 100)], owner)).toHaveLength(1);
  });

  test("words longer than one message are known by the first message they went as", () => {
    const long = `${KO.line_157.repeat(4_000)}\n\n${KO.line_157_2.repeat(4_000)}`;
    const items = answered(outboxOf(long, [], 100));

    expect(landedKeys(items, [archived(42, `${KO.line_160.repeat(4_000)}`, 101)], owner)).toEqual([items[0]?.key ?? ""]);
    expect(landedKeys(answered(outboxOf(KO.line_161, [], 100)), [archived(42, KO.line_161_2, 101)], owner)).toEqual([]);
  });

  test("a file whose words were too long for a caption is known by its picture alone", () => {
    const items = answered(outboxOf(KO.line_165.repeat(1_500), [picked("a.jpg")], 100));
    const bare = { ...archived(42, "", 101), imagePath: "data/images/-100/42.jpg" };

    expect(landedKeys(items, [bare], owner)).toHaveLength(1);
  });

  test("a press of several pictures lands as a whole once the archive carries any of it", () => {
    const items = answered(outboxOf(KO.line_172, [picked("a.jpg"), picked("b.jpg")], 100));
    const caption = { ...archived(42, KO.line_173, 101), imagePath: "data/images/-100/42.jpg", album: 42 };
    const bare = { ...archived(43, KO.line_174, 101), imagePath: "data/images/-100/43.jpg", album: 42 };

    // The words came back otherwise than they went, so only the captionless row is matched.
    expect(landedKeys(items, [{ ...caption, text: KO.line_177 }, bare], owner)).toEqual(items.map((held) => held.key));
    expect(landedKeys(items, [caption], owner)).toEqual(items.map((held) => held.key));
  });

  test("never a row that failed: nothing of it is in the archive", () => {
    const items = outboxOf(KO.line_182, [], 100);
    const failed = withFailed(items, items[0]?.key ?? "", KO.line_183);

    expect(landedKeys(failed, [archived(42, KO.line_185, 100)], owner)).toEqual([]);
  });
});

// The bot files the owner's words before it carries them on and answers the send only after, so the room's stream can
// bring the archived message while the send is still out; the line standing for it gives way to it then rather than
// standing beside it, and stays on its way until its send answers (docs/web.md, the room screen's section on a message
// being sent).
describe("which rows the feed stands no longer for the archive carrying their message", () => {
  test("words whose send is still out, filed under the owner's name since they were pressed, give way without settling", () => {
    const items = outboxOf("hello", [], 100);
    const echo = [archived(-7, "hello", 101)];

    expect([...echoedKeys(items, echo, owner)]).toEqual([items[0]?.key ?? ""]);
    expect(landedKeys(items, echo, owner)).toEqual([]);
    expect(settledKeys(items, echo, owner, 101)).toEqual([]);
  });

  test("a send waiting on the bot gives way the same, its earlier try having reached it", () => {
    const items = outboxOf("hello", [], 100);
    const waiting = withWaiting(items, [items[0]?.key ?? ""], 100);

    expect([...echoedKeys(waiting, [archived(-7, "hello", 130)], owner)]).toEqual([items[0]?.key ?? ""]);
  });

  test("not the same words said a moment before the press, not another's, and not with no owner known", () => {
    const items = outboxOf("hello", [], 100);

    expect([...echoedKeys(items, [archived(-7, "hello", 96)], owner)]).toEqual([]);
    expect([...echoedKeys(items, [archived(-7, "hello", 101, 999)], owner)]).toEqual([]);
    expect([...echoedKeys(items, [archived(-7, "hello", 101)], null)]).toEqual([]);
  });

  test("one archived message stands for one row, the row its send numbered taking it first", () => {
    const first = outboxOf("hello", [], 100);
    const numbered = withSent(first, first[0]?.key ?? "", -7);
    const again = outboxOf("hello", [], 101);
    const items = [...numbered, ...again];

    expect([...echoedKeys(items, [archived(-7, "hello", 101)], owner)]).toEqual([first[0]?.key ?? ""]);
    expect([...echoedKeys(items, [archived(-7, "hello", 101), archived(-8, "hello", 102)], owner)]).toEqual(items.map((held) => held.key));
  });

  test("never a row that failed", () => {
    const words = outboxOf("hello", [], 100);
    const failed = withFailed(words, words[0]?.key ?? "", "refused");

    expect([...echoedKeys(failed, [archived(-7, "hello", 101)], owner)]).toEqual([]);
  });

  test("a picture whose send is still out gives way once the archive has kept its picture, its message held till then", () => {
    const file = outboxOf("hello", [picked("a.jpg")], 100);
    const filed = archived(-7, "hello", 101);
    const pictured = { ...filed, imagePath: "data/images/-100/7.jpg" };

    expect([...echoedKeys(file, [filed], owner)]).toEqual([]);
    expect([...heldMessages(file, [filed], owner)]).toEqual([-7]);
    expect([...echoedKeys(file, [pictured], owner)]).toEqual([file[0]?.key ?? ""]);
    expect([...heldMessages(file, [pictured], owner)]).toEqual([]);
    expect(settledKeys(file, [pictured], owner, 101)).toEqual([]);
  });

  test("the pictures of one send still out give way together, once the archive carries every one with its picture", () => {
    const files = outboxOf("hello", [picked("a.jpg"), picked("b.jpg")], 100);
    const first = { ...archived(-7, "hello", 101), imagePath: "data/images/-100/7.jpg" };
    const second = archived(-8, "hello", 101);

    expect([...echoedKeys(files, [first], owner)]).toEqual([]);
    expect([...heldMessages(files, [first], owner)]).toEqual([-7]);
    expect([...echoedKeys(files, [first, second], owner)]).toEqual([]);
    expect([...heldMessages(files, [first, second], owner)]).toEqual([-7, -8]);
    expect([...echoedKeys(files, [first, { ...second, imagePath: "data/images/-100/8.jpg" }], owner)]).toEqual(files.map((held) => held.key));
  });

  test("a picture with no caption is not taken for the words of a send ahead of it", () => {
    const picture = outboxOf("", [picked("a.jpg")], 100);
    const words = archived(-7, "first of three", 101);

    expect([...heldMessages(picture, [words], owner)]).toEqual([]);
    expect([...echoedKeys(picture, [words], owner)]).toEqual([]);
  });

  test("a message taking a line's place stands under the line's key from then on", () => {
    const words = outboxOf("hello", [], 100);
    const sent = withSent(words, words[0]?.key ?? "", 42);

    expect([...standingKeys(words, [archived(-7, "hello", 101)], owner)]).toEqual([[-7, words[0]?.key ?? ""]]);
    expect([...standingKeys(sent, [archived(42, "hello", 101)], owner)]).toEqual([[42, words[0]?.key ?? ""]]);
    expect([...standingKeys(words, [], owner)]).toEqual([]);
  });

  test("a picture is not taken for a message that carries a file of its own", () => {
    const file = outboxOf("", [picked("a.jpg")], 100);
    const carrying = { ...archived(-7, "", 101), attachments: [{ id: 1, kind: "document" as const, name: "a.pdf", bytes: 1, type: null, available: true }] };

    expect([...heldMessages(file, [carrying], owner)]).toEqual([]);
  });

  test("a row the archive has caught up with gives way as it always did", () => {
    const items = outboxOf("hello", [], 100);
    const sent = withSent(items, items[0]?.key ?? "", 42);

    expect([...echoedKeys(sent, [{ ...archived(42, "other words", 101), senderId: 999 }], owner)]).toEqual([sent[0]?.key ?? ""]);
  });
});

describe("which pictures the archived messages taking their rows' place are handed", () => {
  test("each landed picture's preview, with the archived message it landed as", () => {
    const items = answered(outboxOf(KO.line_191, [picked("a.jpg", "blob:a"), picked("b.jpg", "blob:b")], 100));
    const caption = { ...archived(42, KO.line_192, 101), imagePath: "data/images/-100/42.jpg", album: 42 };
    const bare = { ...archived(43, "", 101), imagePath: "data/images/-100/43.jpg", album: 42 };

    expect(landedPictures(items, [caption, bare], owner)).toEqual([
      { messageId: 42, previewUrl: "blob:a" },
      { messageId: 43, previewUrl: "blob:b" }
    ]);
  });

  test("by the number the send answered with where the room numbers it the same", () => {
    const items = outboxOf("", [picked("a.jpg", "blob:a")], 100);
    const sent = withSent(items, items[0]?.key ?? "", 42);

    expect(landedPictures(sent, [{ ...archived(42, "", 101), imagePath: "data/images/-100/42.jpg" }], owner)).toEqual([
      { messageId: 42, previewUrl: "blob:a" }
    ]);
  });

  test("none for words, nor for a picture the archive does not carry yet", () => {
    const words = answered(outboxOf(KO.line_211, [], 100));
    const picture = answered(outboxOf("", [picked("a.jpg", "blob:a")], 100));

    expect(landedPictures(words, [archived(42, KO.line_214, 101)], owner)).toEqual([]);
    expect(landedPictures(picture, [archived(42, KO.line_215, 101)], owner)).toEqual([]);
  });
});

describe("which rows the feed is done with", () => {
  function sentText(): { items: ReturnType<typeof outboxOf>; key: string } {
    const items = outboxOf(KO.line_221, [], 100);
    const key = items[0]?.key ?? "";

    return { items: withSent(items, key, 42), key };
  }

  test("words stand until the archived message is there, however long the bot takes", () => {
    const { items, key } = sentText();

    expect(settledKeys(items, [], owner, 101)).toEqual([]);
    expect(settledKeys(items, [archived(42, KO.line_231, 101)], owner, 101)).toEqual([key]);
  });

  test("a picture stands until its own message is there with its picture", () => {
    const items = outboxOf(KO.line_235, [picked("a.jpg")], 100);
    const key = items[0]?.key ?? "";
    const sent = withSent(items, key, 42);

    expect(settledKeys(sent, [], owner, 101)).toEqual([]);
    expect(settledKeys(sent, [archived(42, KO.line_240, 101)], owner, 101)).toEqual([]);
    expect([...heldMessages(sent, [archived(42, KO.line_240, 101)], owner)]).toEqual([42]);
    expect(settledKeys(sent, [{ ...archived(42, KO.line_240, 101), imagePath: "data/images/-100/42.jpg" }], owner, 101)).toEqual([key]);
  });

  test("a file that is no message of its own goes as soon as it has gone", () => {
    const items = outboxOf("", [document(KO.line_244)], 100);
    const key = items[0]?.key ?? "";

    expect(settledKeys(items, [], owner, 101)).toEqual([]);
    expect(settledKeys(withSent(items, key, 42), [], owner, 101)).toEqual([key]);
  });

  test("nothing stands for ever: a message that went and never came back goes in the end", () => {
    const { items, key } = sentText();

    expect(settledKeys(items, [], owner, 100 + OUTBOX_GRACE_SECONDS - 1)).toEqual([]);
    expect(settledKeys(items, [], owner, 100 + OUTBOX_GRACE_SECONDS)).toEqual([key]);
    expect(graceEndsAt(items)).toBe(100 + OUTBOX_GRACE_SECONDS);
    expect(graceEndsAt(outboxOf(KO.line_257, [], 100))).toBeNull();
  });

  test("a row that failed stays until it is sent again or given up on", () => {
    const items = outboxOf(KO.line_261, [], 100);
    const failed = withFailed(items, items[0]?.key ?? "", KO.line_262);

    expect(settledKeys(failed, [], owner, 100 + OUTBOX_GRACE_SECONDS * 10)).toEqual([]);
  });
});

describe("a send the bot answered late", () => {
  const items = outboxOf(KO.line_269, [], 100);
  const key = items[0]?.key ?? "";
  const checking = withChecking(items, key, 145);

  test("stands checking, with no reason to send it again", () => {
    expect(checking[0]).toMatchObject({ state: "checking", reason: null, checkingSince: 145 });
  });

  test("becomes the message its words came back as, however late the archive carries it", () => {
    expect(settledKeys(checking, [archived(9, KO.line_278, 150)], owner, 200)).toEqual([key]);
  });

  test("is overdue only once the whole watch has passed with nothing in the archive", () => {
    expect(overdueChecks(checking, 145 + OUTBOX_CHECKING_SECONDS - 1)).toEqual([]);
    expect(overdueChecks(checking, 145 + OUTBOX_CHECKING_SECONDS)).toEqual([key]);
    expect(overdueChecks(items, 145 + OUTBOX_CHECKING_SECONDS)).toEqual([]);
  });

  test("sent again, it starts over as a message on its way", () => {
    expect(withResending(withFailed(checking, key, KO.line_288), key)[0]).toMatchObject({ state: "sending", checkingSince: null });
  });
});

describe("the key a send carries", () => {
  test("one for every message of one press, since they go as one send, and a new one for each press", () => {
    const press = outboxOf(KO.line_294, [picked("a.jpg"), picked("b.jpg")], 100);
    const next = outboxOf(KO.line_295, [], 100);

    expect(new Set(press.map((held) => held.sendKey)).size).toBe(1);
    expect(next[0]?.sendKey).not.toBe(press[0]?.sendKey);
  });

  test("is of the shape the app takes", () => {
    expect(outboxOf(KO.line_302, [], 100)[0]?.sendKey).toMatch(/^[A-Za-z0-9-]{16,64}$/);
  });

  test("is new when a row is sent again: the old key answers with what became of it then", () => {
    const items = outboxOf(KO.line_306, [], 100);
    const key = items[0]?.key ?? "";

    expect(withResending(withFailed(items, key, KO.line_309), key)[0]?.sendKey).not.toBe(items[0]?.sendKey);
  });
});

describe("which send goes next", () => {
  const first = outboxOf(KO.line_314, [], 100);
  const second = outboxOf(KO.line_315, [picked("a.jpg"), picked("b.jpg")], 101);
  const third = outboxOf(KO.line_316, [], 102);
  const rows = [...first, ...second, ...third];
  const keys = (batch: OutboxItem[]): string[] => batch.map((held) => held.key);

  test("the first unanswered one, with every message of its press", () => {
    expect(keys(nextSend(rows))).toEqual(keys(first));
    expect(keys(nextSend(withSent(rows, first[0]?.key ?? "", 1)))).toEqual(keys(second));
  });

  test("a waiting send keeps its place ahead of the ones behind it", () => {
    expect(keys(nextSend(withWaiting(rows, keys(first), 100)))).toEqual(keys(first));
  });

  test("past one that failed or is checked for, which no longer goes by itself", () => {
    const failed = withFailed(rows, first[0]?.key ?? "", KO.line_330);
    const checking = withChecking(failed, second[0]?.key ?? "", 103);

    expect(keys(nextSend(withChecking(checking, second[1]?.key ?? "", 103)))).toEqual(keys(third));
  });

  test("of a press whose files answered one by one, only those still unanswered", () => {
    expect(keys(nextSend(withSent(rows.slice(1), second[0]?.key ?? "", 2)))).toEqual([second[1]?.key ?? ""]);
  });

  test("nothing once every send has answered", () => {
    expect(nextSend(rows.reduce((all, held, at) => withSent(all, held.key, at + 1), rows))).toEqual([]);
  });
});

describe("what a send that did not answer with a message comes to", () => {
  // A refusal of this app's own carries its error body; a proxy's carries a page.
  const ours = (statusCode: number) => ({ statusCode, data: { statusCode, message: KO.line_347 } });
  const proxy = (statusCode: number) => ({ statusCode, data: "<html>502 Bad Gateway</html>" });

  test("waiting where nothing went: no answer at all, a bot that did not take it, a proxy over a stopped app, a login", () => {
    expect(sendOutcome(new TypeError("Failed to fetch"))).toBe("waiting");
    expect(sendOutcome(ours(503))).toBe("waiting");
    expect(sendOutcome(proxy(502))).toBe("waiting");
    expect(sendOutcome(proxy(503))).toBe("waiting");
    expect(sendOutcome(proxy(504))).toBe("waiting");
    expect(sendOutcome(ours(401))).toBe("waiting");
  });

  test("checking where this app says the bot ran late", () => {
    expect(sendOutcome(ours(504))).toBe("checking");
  });

  test("failed where this app or the bot refused it", () => {
    for (const status of [400, 404, 409, 413, 500, 502]) {
      expect(sendOutcome(ours(status))).toBe("failed");
    }
  });

  test("the waiting row is no failure: it keeps no reason", () => {
    const items = withFailed(outboxOf(KO.line_370, [], 100), "", "");
    const key = items[0]?.key ?? "";

    expect(withWaiting(items, [key], 100)[0]).toMatchObject({ state: "waiting", reason: null, messageId: null });
  });

  test("a waiting send rests a second, then twice as long each time, up to its ceiling", () => {
    expect([1, 2, 3, 4, 5, 6, 30].map(sendRetryMs)).toEqual([1000, 2000, 4000, 8000, SEND_RETRY_MAX_MS, SEND_RETRY_MAX_MS, SEND_RETRY_MAX_MS]);
  });
});

describe("the previews a row was holding", () => {
  test("come back when the row goes, and only for the rows going", () => {
    const items = outboxOf("", [picked("a.jpg", "blob:a"), picked("b.jpg", "blob:b")], 100);
    const going = [items[0]?.key ?? ""];

    expect(previewsOf(items, going)).toEqual(["blob:a"]);
    expect(without(items, going).map((held) => held.file?.file.name)).toEqual(["b.jpg"]);
  });
});

describe("a send no bot takes", () => {
  const items = outboxOf("words", [], 100);
  const key = items[0]?.key ?? "";

  test("is bounded from the first try that found none, which later tries keep", () => {
    const waiting = withWaiting(withWaiting(items, [key], 200), [key], 500);

    expect(waiting[0]?.waitingSince).toBe(200);
    expect(overdueWaits(waiting, 200 + OUTBOX_WAITING_SECONDS - 1)).toEqual([]);
    expect(overdueWaits(waiting, 200 + OUTBOX_WAITING_SECONDS)).toEqual([key]);
  });

  test("starts its wait afresh when the room puts it back from the browser", () => {
    const back = restored(withWaiting(items, [key], 200));

    expect(back[0]).toMatchObject({ state: "waiting", waitingSince: null });
    expect(overdueWaits(withWaiting(back, [key], 900), 900)).toEqual([]);
  });

  test("kept by a screen that wrote no wait is never overdue until it waits on this one", () => {
    const { waitingSince: _dropped, ...older } = withWaiting(items, [key], 200)[0] as OutboxItem;

    expect(overdueWaits([older], 200 + OUTBOX_WAITING_SECONDS)).toEqual([]);
  });
});

describe("a checked row's key", () => {
  const put = outboxOf("[tag]: words", [], 100);
  const held = put[0]?.key ?? "";
  const checked = withChecking(put, held, 150);

  test("is asked after for words, never for a file answered late", () => {
    const file = outboxOf("", [picked("a.jpg")], 100);
    const fileChecked = withChecking(file, file[0]?.key ?? "", 150);

    expect(keyChecks(checked).map((one) => one.key)).toEqual([held]);
    expect(keyChecks(fileChecked)).toEqual([]);
    expect(keyChecks(outboxOf("words", [], 100))).toEqual([]);
  });

  test("that answered makes the row the message it went out as, found by number though the archive keeps it as another speaker's words", () => {
    const sent = withKeyOutcome(checked, held, { state: "answered", answer: { messageId: 1272 } });
    const asAnother = archived(1272, "words", 160, 90000001);

    expect(sent[0]).toMatchObject({ state: "sending", messageId: 1272 });
    expect(landedKeys(checked, [asAnother], owner)).toEqual([]);
    expect(landedKeys(sent, [asAnother], owner)).toEqual([held]);
  });

  test("that was refused makes the row failed with the refusal", () => {
    expect(withKeyOutcome(checked, held, { state: "failed", reason: "refused" })[0]).toMatchObject({ state: "failed", reason: "refused" });
  });

  test("still going, or unknown to the app, leaves the row checking until its watch is over", () => {
    for (const outcome of [{ state: "going" }, { state: "unknown" }] as const) {
      const still = withKeyOutcome(checked, held, outcome);

      expect(still[0]).toMatchObject({ state: "checking", checkingSince: 150 });
      expect(overdueChecks(still, 150 + OUTBOX_CHECKING_SECONDS)).toEqual([held]);
    }
  });

  test("answers nothing for a row no longer checked", () => {
    const failed = withFailed(checked, held, "refused");

    expect(withKeyOutcome(failed, held, { state: "answered", answer: { messageId: 1 } })).toEqual(failed);
  });
});
