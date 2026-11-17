import { fileSizeText } from "#shared/file-sizes";
import { wording } from "#shared/wording";

import { roomFileLimit } from "./receiver";

import type { FileLimit } from "#shared/types";

// How a file sent into a room is said where it did not go (docs/web.md, the room screen's input box): the receiver's
// kind for it in the pack's words, and a file past the room's limit with the chat service and the largest it takes.

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

/** Why one file did not go, in the pack's words for the `FileUnsent` kind the receiver gave (its `docs/codes.md`); a
 * road's own reason stands as the road gave it. */
export async function unsentReason(one: { name: string; reason: unknown }, limit: () => Promise<FileLimit | null>): Promise<string> {
  const reason = (typeof one.reason === "object" && one.reason !== null ? one.reason : { kind: "refused", reason: one.reason }) as Record<string, unknown>;

  if (reason.kind === "empty") return wording("room.error.file_empty_named", { name: one.name });
  if (reason.kind === "too-large") return overLimitWords(one.name, await limit());

  return typeof reason.reason === "string" && reason.reason !== "" ? `${one.name}: ${reason.reason}` : wording("common.error.not_sent");
}
