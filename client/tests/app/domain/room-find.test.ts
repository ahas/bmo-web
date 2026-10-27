import { describe, expect, test } from "bun:test";

import { foundMessages, steppedHit } from "../../../apps/web/app/domain/room-find";

import type { ArchivedMessage } from "../../../apps/web/shared/types";

// Finding a phrase in a room (docs/web.md, the room screen's find).

function said(messageId: number, text: string, senderName = "person-a", files: string[] = []): ArchivedMessage {
  return {
    chatId: -1,
    messageId,
    senderId: 7,
    senderName,
    sentAt: 1_788_000_000 + messageId,
    text,
    imagePath: null,
    replyToMessageId: null,
    attachments: files.map((name, id) => ({ id, kind: "document", name, bytes: null, type: null, available: true }))
  };
}

describe("the messages a phrase finds", () => {
  const messages = [said(1, "The Deploy went out"), said(2, "nothing here"), said(3, "words", "Deploy Bot"), said(4, "a file", "person-a", ["deploy-notes.pdf"])];

  test("are those whose words, sender or files hold it, in any case, oldest first", () => {
    expect(foundMessages(messages, "deploy")).toEqual([1, 3, 4]);
    expect(foundMessages(messages, "  went out ")).toEqual([1]);
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
