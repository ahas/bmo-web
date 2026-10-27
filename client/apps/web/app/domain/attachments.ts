import { MAX_ATTACHMENT_BYTES, MAX_ATTACHMENTS } from "#shared/config";

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

// What was taken and what was turned away, so the console can show both at once.
export interface Picked {
  files: PickedFile[];
  refusals: string[];
}

// The images a browser draws without help. Everything else stands as its name and size.
const PREVIEW_TYPES = new Set(["image/jpeg", "image/jpg", "image/png", "image/gif", "image/webp"]);

export function isPreviewable(type: string): boolean {
  return PREVIEW_TYPES.has(type.trim().toLowerCase());
}

export function fileSizeText(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes.toLocaleString("ko-KR")}B`;
  }

  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 1024).toLocaleString("ko-KR")}KB`;
  }

  return `${(bytes / (1024 * 1024)).toLocaleString("ko-KR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}MB`;
}

// What a file is refused for, in the words the console says it in; null when it may go. The
// bot holds the same ceiling on its own side, so this is what spares the upload rather than
// what decides it.
export function refusalFor(t: Translate, file: File): string | null {
  if (file.size === 0) {
    return t("room.error.attachment_empty", { name: file.name });
  }

  if (file.size > MAX_ATTACHMENT_BYTES) {
    return t("room.error.attachment_too_large", { name: file.name, size: fileSizeText(file.size) });
  }

  return null;
}

// The files added to what is already attached: too large or empty ones are turned away by
// name, the same file picked twice is taken once, and what would run past the ceiling on how
// many one send carries is left behind rather than silently dropped.
export function pickFiles(
  t: Translate,
  attached: readonly PickedFile[],
  incoming: readonly File[],
  preview: (file: File) => string | null
): Picked {
  const files = [...attached];
  const refusals: string[] = [];
  const seen = new Set(attached.map((picked) => identity(picked.file)));

  for (const file of incoming) {
    const refusal = refusalFor(t, file);

    if (refusal !== null) {
      refusals.push(refusal);
      continue;
    }

    if (seen.has(identity(file))) {
      continue;
    }

    if (files.length >= MAX_ATTACHMENTS) {
      refusals.push(t("room.error.attachment_too_many", { max: MAX_ATTACHMENTS, name: file.name }));
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
export function attachmentBody(caption: string, files: readonly PickedFile[], replyTo: number | null = null): FormData {
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
