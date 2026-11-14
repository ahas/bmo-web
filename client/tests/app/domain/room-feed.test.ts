import { describe, expect, test } from "bun:test";

import { globalsRestoredAfter } from "../../support/globals";

import { wording } from "../../../apps/web/shared/wording";
import { computed, ref } from "vue";

import type { ArchivedMessage, MessagePage } from "../../../apps/web/shared/types";
import KO from "../../fixtures/app/domain/room-feed.test.ko.json";

// A read of the room's end — the news of a message, the stream coming back, the clock — that is
// still on its way when a go to a message replaces the feed must not land on the stretch shown
// instead (docs/web.md, 「Room screen」). Every read here waits on the test's own hand, so which
// answer lands first is the test's to say.

// The framework's own, which a test of the module alone does not bring with it.
const globals: Record<string, unknown> = globalThis;

globalsRestoredAfter(["computed", "ref"]);
globals.ref = ref;
globals.computed = computed;

interface Asked {
  query: Record<string, unknown>;
  answer: (page: MessagePage) => void;
}

const asked: Asked[] = [];

globals.$fetch = (_url: string, options?: { query?: Record<string, unknown> }) =>
  new Promise<MessagePage>((resolve) => asked.push({ query: options?.query ?? {}, answer: resolve }));

const { useRoomFeed } = await import("../../../apps/web/app/domain/room");

const CHAT = 7;

function said(messageId: number): ArchivedMessage {
  return { chatId: CHAT, messageId, exactId: String(messageId), senderId: 1, senderName: "tester", sentAt: 1_788_000_000 + messageId, text: `${KO.line_34}${messageId}`, imagePath: null, replyToMessageId: null };
}

function page(ids: number[], hasMore = false): MessagePage {
  return { messages: ids.map(said), judgements: [], hasMore };
}

// Lets every answer handed so far be taken in.
async function settled(): Promise<void> {
  for (let turn = 0; turn < 5; turn++) {
    await Promise.resolve();
  }
}

// The one read asked for that matches, taken off the list.
function takeAsked(match: (query: Record<string, unknown>) => boolean): Asked {
  const at = asked.findIndex((one) => match(one.query));

  expect(at).not.toBe(-1);

  return asked.splice(at, 1)[0]!;
}

const endPage = (query: Record<string, unknown>) => query.before === undefined && query.after === undefined && query.at === undefined;

// A feed holding the room's end, rows 1 to 100, with the room going on to 150 since.
async function feedAtEnd(): Promise<ReturnType<typeof useRoomFeed>> {
  asked.length = 0;

  const feed = useRoomFeed(wording, CHAT);
  const loading = feed.load();

  takeAsked(endPage).answer(page(Array.from({ length: 100 }, (_, at) => at + 1), true));
  await loading;

  return feed;
}

// Going to message 20: the stretch around it, which stops short of the room's end.
async function goTo20(feed: ReturnType<typeof useRoomFeed>): Promise<void> {
  const going = feed.loadAround(20);

  takeAsked((query) => query.at === 20).answer(page([20]));
  takeAsked((query) => query.before === 20).answer(page([18, 19], true));
  takeAsked((query) => query.after === 20).answer(page([21, 22], true));
  await going;
}

describe("a read of the room's end and a go to a message crossing", () => {
  test("the stream coming back reads the end, and the end lands under what is held", async () => {
    const feed = await feedAtEnd();
    const reading = feed.refresh();

    takeAsked(endPage).answer(page([99, 100, 101]));
    await reading;

    expect(feed.messages.value.at(-1)?.messageId).toBe(101);
  });

  test("an end read asked before the go lands on nothing", async () => {
    const feed = await feedAtEnd();
    const reading = feed.refresh();
    const end = takeAsked(endPage);

    await goTo20(feed);
    end.answer(page([148, 149, 150]));
    await reading;
    await settled();

    expect(feed.messages.value.map((message) => message.messageId)).toEqual([18, 19, 20, 21, 22]);
    expect(feed.newer.value).toBe(true);
  });

  test("news read past the old end before the go lands on nothing", async () => {
    const feed = await feedAtEnd();
    const catching = feed.catchUp(150);
    const past = takeAsked((query) => query.after === "100");

    await goTo20(feed);
    past.answer(page([150]));
    await catching;
    await settled();

    expect(feed.messages.value.map((message) => message.messageId)).toEqual([18, 19, 20, 21, 22]);
  });
});

// The room's end read after messages were missed — a stream down across a restart, a tab asleep —
// shares no row with what is held, and joins on only once the missed stretch is read
// (docs/web.md, 「A page joins the room's line where its rows stand」).
describe("a read of the room's end past a gap", () => {
  const ids = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, at) => from + at);

  test("reads what was missed past the newest row held, and the end joins on after it", async () => {
    const feed = await feedAtEnd();
    const reading = feed.refresh();

    takeAsked(endPage).answer(page(ids(141, 150), true));
    await settled();
    takeAsked((query) => query.after === "100").answer(page(ids(101, 150)));
    await reading;

    expect(feed.messages.value.map((message) => message.messageId)).toEqual(ids(1, 150));
  });

  test("a gap wider than one read leaves the feed the room's end alone", async () => {
    const feed = await feedAtEnd();
    const reading = feed.refresh();

    takeAsked(endPage).answer(page(ids(941, 950), true));
    await settled();
    takeAsked((query) => query.after === "100").answer(page(ids(101, 600), true));
    await reading;

    expect(feed.messages.value.map((message) => message.messageId)).toEqual(ids(941, 950));
    expect(feed.older.value).toBe(true);
  });
});

// A room whose chat service numbers its messages past 2^53, where a JavaScript number rounds the id (docs/web.md, the room
// screen's 「A cursor is a place, not a number」): each read past, before or at a row names it by the digits it is held
// under, since the rounded number names no row on the receiver.
describe("a room numbered past what a number holds", () => {
  const HIGH = ["3973025898369060353", "3973737757693106177"];
  const high = (exactId: string): ArchivedMessage => ({ ...said(0), messageId: Number(exactId), exactId });

  test("reads back, past and at its rows by their exact ids", async () => {
    asked.length = 0;

    const feed = useRoomFeed(wording, CHAT);
    const loading = feed.load();

    takeAsked(endPage).answer({ messages: HIGH.map(high), judgements: [], hasMore: true });
    await loading;

    const older = feed.loadOlder();

    takeAsked((query) => query.before === HIGH[0]).answer({ messages: [], judgements: [], hasMore: false });
    await older;

    const edited = feed.catchUp(Number(HIGH[0]));

    takeAsked((query) => query.at === HIGH[0]).answer({ messages: [high(HIGH[0]!)], judgements: [], hasMore: false });
    await edited;

    const news = feed.catchUp(Number("3973799999999999999"));

    takeAsked((query) => query.after === HIGH[1]).answer({ messages: [], judgements: [], hasMore: false });
    await news;

    expect(asked).toEqual([]);
  });
});
