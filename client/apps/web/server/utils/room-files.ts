import { fileSizeText } from "#shared/file-sizes";
import { wording } from "#shared/wording";

import { roomFileLimit } from "./receiver";

import type { FileLimit } from "#shared/types";

// How a file sent into a room is said where it did not go (docs/web.md, the room screen's input box): the receiver's
// kind for it in the pack's words, a file refused by its refusal's code, and a file past the room's limit with the chat
// service and the largest it takes.

/** The room's limit, read once a send needs it and once at most: only a file turned away as past it is said with it.
 * A limit that cannot be read is none. */
export function roomLimitOnce(chatId: number): () => Promise<FileLimit | null> {
  let read: Promise<FileLimit | null> | null = null;

  return () => (read ??= roomFileLimit(chatId).catch(() => null));
}

/** A file past the room's limit, said with the chat service and the largest it takes; where the limit cannot be read,
 * said as past the room's. */
export function overLimitWords(name: string, limit: FileLimit | null): string {
  return limit === null
    ? wording("room.error.file_too_large_named", { name })
    : wording("room.error.file_over_limit_named", { name, by: limit.by, limit: fileSizeText(limit.bytes) });
}

// The pack's sentence for each refusal code a file not kept carries (the receiver's `docs/codes.md`, `FileUnsent`): a chat
// road's refusal code (bmo-chat's `docs/protocol.md`, 「Refusals」) or the receiver's own. A code the pack holds no
// sentence for is said as a file that could not be sent.
const REFUSED_FILE_WORDS: Readonly<Record<string, string>> = {
  platform: "room.error.file_refused_platform",
  "unsupported-capability": "room.error.file_refused_unsupported",
  "not-ready": "room.error.file_refused_not_ready",
  failed: "room.error.file_refused_failed",
  "upstream-failed": "room.error.file_refused_failed"
};

/** A file not kept, in the pack's sentence for the refusal code it carries, naming it; never the receiver's English. */
export function refusedFileWords(name: string, code: unknown): string {
  const key = typeof code === "string" && Object.hasOwn(REFUSED_FILE_WORDS, code) ? REFUSED_FILE_WORDS[code] : undefined;

  return wording(key ?? "room.error.file_unsent_named", { name });
}

/** Why one file did not go, in the pack's words for the `FileUnsent` kind the receiver gave (its `docs/codes.md`): a
 * refused one by its refusal's code, and a reason of no kind the console knows as a file that could not be sent. */
export async function unsentReason(one: { name: string; reason: unknown }, limit: () => Promise<FileLimit | null>): Promise<string> {
  const reason = (typeof one.reason === "object" && one.reason !== null ? one.reason : {}) as Record<string, unknown>;

  if (reason.kind === "empty") return wording("room.error.file_empty_named", { name: one.name });
  if (reason.kind === "too-large") return overLimitWords(one.name, await limit());

  return refusedFileWords(one.name, reason.kind === "refused" ? reason.code : undefined);
}
