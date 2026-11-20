import { describe, expect, test } from "bun:test";

import { heldRows } from "../../../apps/web/app/domain/room-holding";

import type { ArchivedMessage, MessageAttachment } from "../../../apps/web/shared/types";

// What each of the room information's tabs stands of the messages read for it (docs/web.md, the room screen's room
// information): its own kind of what each message carried, newest first, a file counted by what its name says it is,
// and nothing of a deleted message.

const ROOM = -12;

function message(messageId: number, sentAt: number, over: Partial<ArchivedMessage> = {}): ArchivedMessage {
  return { chatId: ROOM, messageId: String(messageId), senderId: 11, senderName: "person-a", sentAt, text: "", imagePath: null, replyToMessageId: null, ...over };
}

// A kept file as the console serves it: played files with a type of their own kind, the rest kept as files, each with
// the type its name implies.
const SERVED: Record<MessageAttachment["kind"], string> = { video: "video/mp4", animation: "video/mp4", audio: "audio/ogg", document: "application/octet-stream", sticker: "image/webp" };

function file(id: number, kind: MessageAttachment["kind"], name: string, impliedType: string | null = null): MessageAttachment {
  return { id, kind, name, bytes: 2048, type: SERVED[kind], available: true, impliedType };
}

describe("the rows a tab stands", () => {
  test("media holds a message's picture and its videos and animations, newest first, and no sticker's picture", () => {
    const rows = heldRows("media", [
      message(1, 100, { imagePath: "/kept/1.jpg" }),
      message(2, 200, { imagePath: "/kept/2.webp", sticker: true }),
      message(3, 300, { attachments: [file(30, "video", "clip.mp4"), file(31, "document", "notes.pdf"), file(32, "animation", "loop.mp4")] })
    ]);

    expect(rows.map((row) => [row.kind, row.messageId])).toEqual([["video", "3"], ["animation", "3"], ["picture", "1"]]);
  });

  test("files holds a message's documents alone", () => {
    const rows = heldRows("file", [message(1, 100, { imagePath: "/kept/1.jpg", attachments: [file(10, "document", "notes.pdf"), file(11, "audio", "song.mp3")] })]);

    expect(rows).toMatchObject([{ kind: "file", attachment: { name: "notes.pdf" } }]);
  });

  test("a document whose name is a video's or a sound's stands under media or music, as a file line where it does not play", () => {
    const sent = [
      message(1, 100, { attachments: [file(10, "document", "clip.mkv", "video/x-matroska")] }),
      message(2, 200, { attachments: [file(20, "document", "track.wma", "audio/x-ms-wma")] })
    ];

    expect(heldRows("media", sent)).toMatchObject([{ kind: "file", messageId: "1", attachment: { name: "clip.mkv" } }]);
    expect(heldRows("music", sent)).toMatchObject([{ kind: "file", messageId: "2", attachment: { name: "track.wma" } }]);
    expect(heldRows("file", sent)).toEqual([]);
  });

  test("links holds every address the words hold outside code, each once, with its site", () => {
    const text = "read https://example.com/a and https://example.com/a again, then `https://example.org/code` and [here](https://example.net/b)";
    const rows = heldRows("link", [message(1, 100, { text })]);

    expect(rows.map((row) => (row.kind === "link" ? [row.url, row.site] : null))).toEqual([
      ["https://example.com/a", "example.com"],
      ["https://example.net/b", "example.net"]
    ]);
  });

  test("a voice note stands with its length and the words heard in it, and music with neither", () => {
    const heard = message(1, 100, { attachments: [file(10, "audio", "voice.ogg")], voiceSeconds: 7, transcript: "words heard" });

    expect(heldRows("voice", [heard])).toMatchObject([{ kind: "sound", seconds: 7, transcript: "words heard" }]);
    expect(heldRows("music", [heard])).toMatchObject([{ kind: "sound", seconds: null, transcript: null }]);
  });

  test("a deleted message stands under no tab", () => {
    expect(heldRows("file", [message(1, 100, { deletedAt: 1, attachments: [file(10, "document", "notes.pdf")] })])).toEqual([]);
  });
});
