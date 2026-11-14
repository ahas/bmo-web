import { describe, expect, test } from "bun:test";

import { wording } from "../../../apps/web/shared/wording";

import { PICTURE_LEAD, pictureProperties, sideToRead, stretchAround, widened } from "../../../apps/web/app/domain/gallery";

import type { RoomPicture, RoomPicturePage } from "../../../apps/web/shared/types";
import KO from "../../fixtures/app/domain/gallery.test.ko.json";

function picture(messageId: number, text = KO.line_9): RoomPicture {
  return { messageId: String(messageId), album: null, senderName: "agent-a", sentAt: 1_790_000_000, text, file: { name: `${messageId}.jpg`, bytes: 2048, type: "image/jpeg" } };
}

function page(ids: number[], before: number, hasMore: boolean, total = 20): RoomPicturePage {
  return { pictures: ids.map((id) => picture(id)), hasMore, before, total };
}

// The viewer walks one unbroken stretch of the room's pictures, read outward from the one it opened
// on, and knows where each stands among all of the room's.
describe("the stretch of a room's pictures the viewer walks", () => {
  const around = stretchAround(page([7], 6, false), page([5, 6], 4, true), page([8, 9], 7, false));

  test("stands the pictures before, the one opened and those after in the room's order", () => {
    expect(around.pictures.map((held) => held.messageId)).toEqual(["5", "6", "7", "8", "9"]);
    expect(around).toMatchObject({ before: 4, total: 20, older: true, newer: false });
  });

  test("an older page goes in front, its start becomes the stretch's, and a picture already held is not taken twice", () => {
    const wider = widened(around, page([3, 4, 5], 1, false), "older");

    expect(wider.pictures.map((held) => held.messageId)).toEqual(["3", "4", "5", "6", "7", "8", "9"]);
    expect(wider).toMatchObject({ before: 1, older: false });
  });

  test("reads on only once the viewer comes near an end the room goes on past", () => {
    expect(sideToRead(around, PICTURE_LEAD - 1)).toBe("older");
    expect(sideToRead({ ...around, older: false }, 0)).toBeNull();
    expect(sideToRead({ ...around, older: false, newer: true }, 4)).toBe("newer");
    expect(sideToRead(around, -1)).toBeNull();
  });
});

describe("a picture's properties", () => {
  const labels = (rows: { label: string }[]) => rows.map((row) => row.label);

  test("name the file, its size, format and drawn size, and the caption without the picture mark", () => {
    const rows = pictureProperties(wording, picture(-7001, KO.line_46), { width: 1280, height: 720 });

    expect(rows.find((row) => row.label === wording("room.label.picture_format"))?.value).toBe("JPEG");
    expect(rows.find((row) => row.label === wording("common.label.picture_resolution"))?.value).toBe(wording("common.label.picture_resolution_value", { width: "1,280", height: "720" }));
    expect(rows.at(-1)).toEqual({ label: wording("common.label.picture_caption"), value: KO.line_50 });
  });

  test("a picture whose file is gone says so, and one not drawn yet or without words leaves those rows out", () => {
    const rows = pictureProperties(wording, { ...picture(4), file: null }, null);

    expect(labels(rows)).toEqual([
      wording("room.label.picture_sender"),
      wording("room.label.picture_sent_at"),
      wording("room.label.picture_message"),
      wording("room.label.picture_file")
    ]);
    expect(rows.at(-1)?.value).toBe(wording("room.label.picture_not_kept"));
  });
});
