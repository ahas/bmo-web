// A picture the console sets on the receiver's kept pictures (docs/web.md, 「Profile photos」, a picture set in the
// console): which kind of subject it is for, and the console's route it is set and dropped at, which says the
// receiver's refusals in the pack's words.

import type { OwnerChat } from "#shared/types";

export type PictureKind = "room" | "person" | "agent" | "company-bmo" | "own-bmo";

/**
 * Whose picture is one's own: the sender the receiver files the owner under for the administrator, and the first
 * sender linked to the account otherwise; none where no sender is known.
 */
export function ownSenderOf(owner: OwnerChat): number | null {
  return owner.senderId !== null && owner.senders.includes(owner.senderId) ? owner.senderId : (owner.senders[0] ?? null);
}

/** The console's route a subject's picture is set at (`PUT`) and dropped at (`DELETE`): a company's default for its
 * people's BMOs by the company, one's own BMO's at one route, and a room's, a person's or an agent's on the receiver's
 * kept pictures. */
export function pictureRoute(kind: PictureKind, subject: number | string): string {
  if (kind === "company-bmo") return `/api/organization/companies/${encodeURIComponent(String(subject))}/agent/picture`;
  if (kind === "own-bmo") return "/api/account/agent/picture";

  return `/api/avatars/${kind}/${encodeURIComponent(String(subject))}`;
}

/** The words a kind's picture is set and dropped with: what saving does, the way back, and what that did. */
export interface PictureWords {
  note: string;
  clear: string;
  cleared: string;
}

/** The words of a kind: a BMO profile's picture drops to the company's or to none, every other one to the provider's. */
export function pictureWords(kind: PictureKind): PictureWords {
  if (kind === "company-bmo") {
    return { note: "bmo_profile.label.company_picture_note", clear: "bmo_profile.action.picture_remove", cleared: "bmo_profile.message.picture_removed" };
  }

  if (kind === "own-bmo") {
    return { note: "bmo_profile.label.own_picture_note", clear: "bmo_profile.action.picture_company", cleared: "bmo_profile.message.picture_company" };
  }

  return { note: "picture.label.preview_note", clear: "picture.action.clear", cleared: "picture.message.cleared" };
}

/** The reads a changed picture makes every screen take again: the receiver's pictures, and a BMO profile's own. */
export function pictureReads(kind: PictureKind): string[] {
  return kind === "company-bmo" || kind === "own-bmo" ? ["avatars", "agent-faces", "bmo-profile"] : ["avatars", "agent-faces"];
}
