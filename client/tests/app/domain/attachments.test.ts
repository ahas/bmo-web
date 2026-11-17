import { describe, expect, test } from "bun:test";

import { wording } from "../../../apps/web/shared/wording";

import { attachmentBody, attachmentLabel, isPreviewable, pickFiles, refusalFor } from "../../../apps/web/app/domain/attachments";
import { fileSizeText } from "../../../apps/web/shared/file-sizes";

import type { PickedFile } from "../../../apps/web/app/domain/attachments";
import type { AttachLimits, FileLimit } from "../../../apps/web/shared/types";
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

// A place that declares no limit, and a chat service that declares fifty million bytes, as one does.
const NONE: AttachLimits = { largest: null, most: null };
const DECLARED: FileLimit = { bytes: 50_000_000, by: "Chat A" };

describe("picking files to send", () => {
  test("takes what it is given, with a preview for the images and none for the rest", () => {
    const { files, refusals } = pickFiles(wording, [], [file("IMG_0421.jpg", 4, "image/jpeg"), file("report.pdf", 4, "application/pdf")], preview, NONE);

    expect(files.map((picked) => picked.file.name)).toEqual(["IMG_0421.jpg", "report.pdf"]);
    expect(files.map((picked) => picked.previewUrl)).toEqual(["blob:IMG_0421.jpg", null]);
    expect(refusals).toEqual([]);
  });

  test("adds to what is already attached and never takes the same file twice", () => {
    const first = pickFiles(wording, [], [file("a.png", 4, "image/png")], preview, NONE);
    const second = pickFiles(wording, first.files, [file("a.png", 4, "image/png"), file("b.png", 4, "image/png")], preview, NONE);

    expect(second.files.map((picked) => picked.file.name)).toEqual(["a.png", "b.png"]);
    expect(second.files.map((picked) => picked.key)).toEqual([...new Set(second.files.map((picked) => picked.key))]);
  });

  test("a file past the declared limit is turned away naming who declares it and the limit, and the rest still go", () => {
    const { files, refusals } = pickFiles(
      wording,
      [],
      [sized(KO.line_46, 60 * 1024 * 1024, "video/mp4"), file(KO.line_46_2, 4, "image/jpeg")],
      preview,
      { largest: DECLARED, most: null }
    );

    expect(files.map((picked) => picked.file.name)).toEqual([KO.line_50]);
    expect(refusals).toEqual([
      { title: wording("room.error.attachment_too_large", { by: "Chat A", limit: fileSizeText(50_000_000) }), description: `${KO.line_51} · ${fileSizeText(60 * 1024 * 1024)}` }
    ]);
  });

  test("with no limit declared, a file of any size and any number of files are taken", () => {
    const many = [sized("film.mkv", 4 * 1024 * 1024 * 1024, "video/x-matroska"), ...Array.from({ length: 24 }, (_, index) => file(`f${index}.txt`, 4, "text/plain"))];
    const { files, refusals } = pickFiles(wording, [], many, preview, NONE);

    expect(files).toHaveLength(25);
    expect(refusals).toEqual([]);
  });

  test("an empty file is turned away too", () => {
    const { files, refusals } = pickFiles(wording, [], [sized(KO.line_56, 0)], preview, NONE);

    expect(files).toEqual([]);
    expect(refusals[0]?.title).toContain(KO.line_59);
  });

  test("past the count the place declares for one send, what is left over is named rather than dropped quietly", () => {
    const many = Array.from({ length: 12 }, (_, index) => file(`f${index}.txt`, 4, "text/plain"));
    const { files, refusals } = pickFiles(wording, [], many, preview, { largest: null, most: 10 });

    expect(files).toHaveLength(10);
    expect(refusals).toHaveLength(2);
    expect(refusals[0]?.title).toContain("f10.txt");
  });
});

describe("what an attachment reads as, and what is sent", () => {
  test("its name and its size", () => {
    expect(attachmentLabel(sized(KO.line_78, 2 * 1024 * 1024))).toBe(KO.line_78_2);
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

  test("a file just past the declared limit is refused and one at it is not", () => {
    expect(refusalFor(wording, sized("a", 50_000_000), DECLARED)).toBeNull();
    expect(refusalFor(wording, sized("a", 50_000_001), DECLARED)?.title).toContain("Chat A");
  });
});
