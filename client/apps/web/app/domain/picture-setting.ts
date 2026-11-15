// A picture the console sets on the receiver's kept pictures (docs/web.md, 「Profile photos」, a picture set in the
// console): which kind of subject it is for, and the console's route it is set and dropped at, which says the
// receiver's refusals in the pack's words.

import type { OwnerChat } from "#shared/types";

export type PictureKind = "room" | "person" | "agent";

/**
 * Whose picture is one's own: the sender the receiver files the owner under for the administrator, and the first
 * sender linked to the account otherwise; none where no sender is known.
 */
export function ownSenderOf(owner: OwnerChat): number | null {
  return owner.senderId !== null && owner.senders.includes(owner.senderId) ? owner.senderId : (owner.senders[0] ?? null);
}

/** The console's route a subject's picture is set at (`PUT`) and dropped at (`DELETE`). */
export function pictureRoute(kind: PictureKind, subject: number | string): string {
  return `/api/avatars/${kind}/${encodeURIComponent(String(subject))}`;
}
