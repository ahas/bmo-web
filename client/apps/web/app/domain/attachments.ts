import { fileSizeText } from "#shared/file-sizes";

import type { AttachLimits, ExactMessageId, FileLimit } from "#shared/types";
import type { Translate } from "#shared/wording";

// A file the owner has attached but not sent yet: the file itself, a key of its own so the
// list can be drawn and one removed, and a preview when the browser can show one. A recording
// made in the box stands as a file too, its length kept with it so the tray names what it is.
export interface PickedFile {
  key: string;
  file: File;
  previewUrl: string | null;
  voice?: { seconds: number };
}

// What one send carries: the words with every long paste put back where its mark stood, and the
// files in the order they were attached.
export interface ComposedMessage {
  text: string;
  files: PickedFile[];
}

// Why a file was turned away, as the notice says it: the verdict and its reason, and the file it is about where the
// verdict does not name it, so a long name never pushes the reason out of a narrow notice.
export interface Refusal {
  title: string;
  description: string | null;
}

// What was taken and what was turned away, so the console can show both at once.
export interface Picked {
  files: PickedFile[];
  refusals: Refusal[];
}

// The images a browser draws without help. Everything else stands as its name and size.
const PREVIEW_TYPES = new Set(["image/jpeg", "image/jpg", "image/png", "image/gif", "image/webp"]);

export function isPreviewable(type: string): boolean {
  return PREVIEW_TYPES.has(type.trim().toLowerCase());
}

// What a file is refused for, in the words the console says it in; null when it may go. A file past the largest the
// place it goes to takes is refused naming who declares that limit and the limit itself; with no limit declared, a
// file of any size goes. The place holds the same limit on its own side, so this spares the upload rather than
// deciding it.
export function refusalFor(t: Translate, file: File, largest: FileLimit | null): Refusal | null {
  if (file.size === 0) {
    return { title: t("room.error.attachment_empty", { name: file.name }), description: null };
  }

  if (largest !== null && file.size > largest.bytes) {
    return { title: t("room.error.attachment_too_large", { by: largest.by, limit: fileSizeText(largest.bytes) }), description: attachmentLabel(file) };
  }

  return null;
}

// The files added to what is already attached: too large or empty ones are turned away by name, the same file picked
// twice is taken once, and where the place declares how many one send carries, what would run past it is left behind
// rather than silently dropped.
export function pickFiles(
  t: Translate,
  attached: readonly PickedFile[],
  incoming: readonly File[],
  preview: (file: File) => string | null,
  limits: AttachLimits
): Picked {
  const files = [...attached];
  const refusals: Refusal[] = [];
  const seen = new Set(attached.map((picked) => identity(picked.file)));

  for (const file of incoming) {
    const refusal = refusalFor(t, file, limits.largest);

    if (refusal !== null) {
      refusals.push(refusal);
      continue;
    }

    if (seen.has(identity(file))) {
      continue;
    }

    if (limits.most !== null && files.length >= limits.most) {
      refusals.push({ title: t("room.error.attachment_too_many", { max: limits.most, name: file.name }), description: null });
      continue;
    }

    seen.add(identity(file));
    files.push({ key: `${identity(file)}:${files.length}`, file, previewUrl: preview(file) });
  }

  return { files, refusals };
}

// The same file picked twice — dropped and then pasted, say — is one attachment.
function identity(file: File): string {
  return `${file.name}:${file.size}:${file.lastModified}`;
}

// What one attached file reads as while it waits to be sent.
export function attachmentLabel(file: File): string {
  return `${file.name} · ${fileSizeText(file.size)}`;
}

// The body one send carries: the words as the caption, the files in the order they were
// attached. The first file is the one the caption goes with, which the bot decides; the console
// only has to keep the order. A reply is that first file's too.
export function attachmentBody(caption: string, files: readonly PickedFile[], replyTo: ExactMessageId | null = null): FormData {
  const body = new FormData();

  body.set("caption", caption);

  if (replyTo !== null) {
    body.set("replyTo", String(replyTo));
  }

  for (const picked of files) {
    body.append("file", picked.file, picked.file.name);
  }

  return body;
}
