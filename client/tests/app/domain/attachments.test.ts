import { describe, expect, test } from "bun:test";

import { wording } from "../../../apps/web/shared/wording";

import { MAX_ATTACHMENTS } from "../../../apps/web/shared/config";
import { attachmentBody, attachmentLabel, fileSizeText, isPreviewable, pickFiles, refusalFor } from "../../../apps/web/app/domain/attachments";

import type { PickedFile } from "../../../apps/web/app/domain/attachments";
import KO from "../../fixtures/app/domain/attachments.test.ko.json";

function file(name: string, size: number, type = "application/octet-stream"): File {
  return new File([new Uint8Array(Math.min(size, 8))], name, { type, lastModified: 1 });
}

// A file of a stated size without holding one that large in memory.
function sized(name: string, size: number, type = "application/octet-stream"): File {
  const made = file(name, 1, type);

  Object.defineProperty(made, "size", { value: size });

  return made;
}

const preview = (candidate: File): string | null => (isPreviewable(candidate.type) ? `blob:${candidate.name}` : null);

describe("picking files to send", () => {
  test("takes what it is given, with a preview for the images and none for the rest", () => {
    const { files, refusals } = pickFiles(wording, [], [file("IMG_0421.jpg", 4, "image/jpeg"), file("report.pdf", 4, "application/pdf")], preview);

    expect(files.map((picked) => picked.file.name)).toEqual(["IMG_0421.jpg", "report.pdf"]);
    expect(files.map((picked) => picked.previewUrl)).toEqual(["blob:IMG_0421.jpg", null]);
    expect(refusals).toEqual([]);
  });

  test("adds to what is already attached and never takes the same file twice", () => {
    const first = pickFiles(wording, [], [file("a.png", 4, "image/png")], preview);
    const second = pickFiles(wording, first.files, [file("a.png", 4, "image/png"), file("b.png", 4, "image/png")], preview);

    expect(second.files.map((picked) => picked.file.name)).toEqual(["a.png", "b.png"]);
    expect(second.files.map((picked) => picked.key)).toEqual([...new Set(second.files.map((picked) => picked.key))]);
  });

  test("a file past the ceiling is turned away by name, and the rest still go", () => {
    const { files, refusals } = pickFiles(
      wording,
      [],
      [sized(KO.line_46, 60 * 1024 * 1024, "video/mp4"), file(KO.line_46_2, 4, "image/jpeg")],
      preview
    );

    expect(files.map((picked) => picked.file.name)).toEqual([KO.line_50]);
    expect(refusals[0]).toContain(KO.line_51);
    expect(refusals[0]).toContain("50MB");
  });

  test("an empty file is turned away too", () => {
    const { files, refusals } = pickFiles(wording, [], [sized(KO.line_56, 0)], preview);

    expect(files).toEqual([]);
    expect(refusals[0]).toContain(KO.line_59);
  });

  test("past the count one send carries, what is left over is named rather than dropped quietly", () => {
    const many = Array.from({ length: MAX_ATTACHMENTS + 2 }, (_, index) => file(`f${index}.txt`, 4, "text/plain"));
    const { files, refusals } = pickFiles(wording, [], many, preview);

    expect(files).toHaveLength(MAX_ATTACHMENTS);
    expect(refusals).toHaveLength(2);
    expect(refusals[0]).toContain(`f${MAX_ATTACHMENTS}.txt`);
  });
});

describe("what an attachment reads as, and what is sent", () => {
  test("the count ceiling is the same one the console tells the owner about", () => {
    expect(MAX_ATTACHMENTS).toBe(10);
  });

  test("its name and its size", () => {
    expect(attachmentLabel(sized(KO.line_78, 2 * 1024 * 1024))).toBe(KO.line_78_2);
    expect(fileSizeText(900)).toBe("900B");
    expect(fileSizeText(2048)).toBe("2KB");
  });

  test("a size of four figures or more carries its thousands separator", () => {
    expect(fileSizeText(1020)).toBe("1,020B");
    expect(fileSizeText(1023 * 1024)).toBe("1,023KB");
    expect(fileSizeText(1500 * 1024 * 1024)).toBe("1,500.0MB");
  });

  test("the body carries the words once and the files in the order they were attached", () => {
    const picked: PickedFile[] = [
      { key: "a", file: file("a.jpg", 4, "image/jpeg"), previewUrl: null },
      { key: "b", file: file("b.pdf", 4, "application/pdf"), previewUrl: null }
    ];
    const body = attachmentBody(KO.line_94, picked);

    expect(body.get("caption")).toBe(KO.line_96);
    expect(body.getAll("file").map((part) => (part as File).name)).toEqual(["a.jpg", "b.pdf"]);
    expect(body.get("replyTo")).toBeNull();
    expect(attachmentBody(KO.line_99, picked, "7").get("replyTo")).toBe("7");
  });

  test("only what a browser can draw gets a preview", () => {
    expect(isPreviewable("image/png")).toBe(true);
    expect(isPreviewable("IMAGE/JPEG")).toBe(true);
    expect(isPreviewable("application/pdf")).toBe(false);
    expect(isPreviewable("")).toBe(false);
  });

  test("a file just past the ceiling is refused and one at it is not", () => {
    expect(refusalFor(wording, sized("a", 50 * 1024 * 1024))).toBeNull();
    expect(refusalFor(wording, sized("a", 50 * 1024 * 1024 + 1))).toContain(KO.line_111);
  });
});
