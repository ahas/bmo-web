// A picture the console sets on the receiver's kept pictures (docs/web.md, 「Profile photos」, a picture set in the
// console): which kind of subject it is for, the route it is set and dropped at through the console's relay, and the
// pack's words for each refusal the receiver names.

import type { OwnerChat } from "#shared/types";

export type PictureKind = "room" | "person" | "agent";

/**
 * Whose picture is one's own: the sender the receiver files the owner under for the administrator, and the first
 * sender linked to the account otherwise; none where no sender is known.
 */
export function ownSenderOf(owner: OwnerChat): number | null {
  return owner.senderId !== null && owner.senders.includes(owner.senderId) ? owner.senderId : (owner.senders[0] ?? null);
}

/** The relay address a subject's picture is set at (`PUT`) and dropped at (`DELETE`). */
export function pictureRoute(kind: PictureKind, subject: number | string): string {
  return `/api/receiver/avatars/${kind}/${encodeURIComponent(String(subject))}`;
}

// The receiver's refusals of a picture (its `docs/api.md`, 「Rooms」), each by its code.
const REFUSALS: Readonly<Record<string, string>> = {
  "picture-too-large": "picture.error.too_large",
  "not-a-picture": "picture.error.not_a_picture",
  "no-picture-given": "picture.error.not_a_picture",
  "no-number": "picture.error.no_number"
};

/** The pack's key for a refusal's code, or null for one the section says in its own failure sentence. */
export function refusalKey(code: string | null): string | null {
  return code === null ? null : (REFUSALS[code] ?? null);
}
