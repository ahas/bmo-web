import { describe, expect, test } from "bun:test";

import { foundMessages, steppedHit } from "../../../apps/web/app/domain/room-find";

import type { ArchivedMessage } from "../../../apps/web/shared/types";

// Finding a phrase in a room (docs/web.md, the room screen's find).

// The console's own reading of a count, which the list search asks for.
Object.assign(globalThis, { useAppConfig: () => ({ bmoUi: { zone: "Asia/Seoul", locale: "ko-KR", dateLocale: "ko" } }) });

function said(messageId: number, text: string, senderName = "person-a", files: string[] = []): ArchivedMessage {
  return {
    chatId: -1,
    messageId: String(messageId),
    senderId: 7,
    senderName,
    sentAt: 1_788_000_000 + messageId,
    text,
    imagePath: null,
    replyToMessageId: null,
    attachments: files.map((name, id) => ({ id, kind: "document" as const, name, bytes: null, type: null, available: true }))
  };
}

describe("the messages a phrase finds", () => {
  const messages = [said(1, "The Deploy went out"), said(2, "nothing here"), said(3, "words", "Deploy Bot"), said(4, "a file", "person-a", ["deploy-notes.pdf"])];

  test("are those whose words, sender or files hold it, in any case, oldest first", () => {
    expect(foundMessages(messages, "deploy")).toEqual(["1", "3", "4"]);
    expect(foundMessages(messages, "  went out ")).toEqual(["1"]);
  });

  test("holds what was heard in a voice note, which the bubble stands under its player", () => {
    const heard = { ...said(5, ""), attachments: [{ id: 0, kind: "audio" as const, name: "voice.ogg", bytes: null, type: "audio/ogg", available: true }], transcript: "the deploy is held until dawn", voiceSeconds: 7, voiceState: "heard" };

    expect(foundMessages([...messages, heard], "dawn")).toEqual(["5"]);
    // A recording that could not be heard has no words to find.
    expect(foundMessages([{ ...heard, transcript: null, voiceState: "failed" }], "dawn")).toEqual([]);
  });

  test("are none for an empty phrase or one nothing holds", () => {
    expect(foundMessages(messages, "")).toEqual([]);
    expect(foundMessages(messages, "absent")).toEqual([]);
  });
});

describe("a step among the hits", () => {
  test("starts at the newest, goes up to older and down to newer, and holds at the ends", () => {
    expect(steppedHit(3, null, -1)).toBe(2);
    expect(steppedHit(3, 2, -1)).toBe(1);
    expect(steppedHit(3, 0, -1)).toBe(0);
    expect(steppedHit(3, 1, 1)).toBe(2);
    expect(steppedHit(3, 2, 1)).toBe(2);
    expect(steppedHit(0, null, -1)).toBeNull();
  });
});
