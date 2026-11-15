import { linkSender, senderLinks } from "./account-service";
import { administratorKey } from "./owner-key";
import { receiver, receiverCall } from "./receiver";

import type { SignedIn } from "./accounts";

// The owner's private chat, as the receiver names it (the receiver's `docs/api.md`, 「The owner」), or null where
// the receiver is not reached.
export async function ownerChat(): Promise<number | null> {
  try {
    return (await receiverCall(receiver().GET("/owner"))).room ?? null;
  } catch {
    return null;
  }
}

/** The sender the receiver names as the owner's, under which every message the owner sends is archived; null where the
 * receiver is not reached or names none. */
export async function ownerSender(): Promise<number | null> {
  try {
    return (await receiverCall(receiver().GET("/owner"))).senderId ?? null;
  } catch {
    return null;
  }
}

/**
 * Whose the owner's account is (docs/accounts.md, 「The owner's account」): the user the account service links to the
 * sender the receiver names as the owner's. Where no user is linked to it, the link is made to the user the data move
 * made the platform administrator — the console's one account before the model, which was the owner's, a fact the
 * move wrote once and no route changes — so the owner's account stands the moment it is first asked, at this server's
 * start or at the first request that needs it. A link that stands is never moved. Where the link cannot be made, the
 * move's administrator stands as the owner unlinked, and keeps the owner's own road.
 */
export interface OwnerStanding {
  account: number | null;
  linked: boolean;
}

export async function ownerStanding(administrator: () => Promise<string | null> = administratorKey): Promise<OwnerStanding> {
  const moved = async (): Promise<number | null> => {
    const key = await administrator().catch(() => null);

    return key === null ? null : Number(key);
  };
  const sender = await ownerSender();

  if (sender === null) return { account: await moved(), linked: false };

  try {
    const link = (await senderLinks([sender]))[0];

    if (link !== undefined) return { account: Number(link.user), linked: true };

    const mover = await moved();

    if (mover === null) {
      console.warn("the owner's sender stands linked to no account, and no data move names an administrator to link it to");

      return { account: null, linked: false };
    }

    await linkSender(mover, sender);
    console.log(`the owner's sender ${sender} is linked to user ${mover}, the data move's administrator`);

    return { account: mover, linked: true };
  } catch (error) {
    console.warn(`the owner's sender could not be linked to the owner's account: ${String(error)}`);

    return { account: await moved(), linked: false };
  }
}

/** Whether the signed-in login is the owner's: the owner's account, or a console login standing before the account
 * model, which is the owner's. What is granted to the owner hangs on this, never on the console a word was typed in
 * (docs/web.md, 「Access」). */
export async function isOwnerLogin(signed: SignedIn): Promise<boolean> {
  if (signed.id === null) return signed.administrator;

  return (await ownerStanding()).account === signed.id;
}

/** Whether the login speaks on the owner's own road: a console login standing before the account model, and the
 * owner's account while the owner's sender stands linked to none. */
export async function onOwnersRoad(signed: SignedIn, standing: () => Promise<OwnerStanding> = ownerStanding): Promise<boolean> {
  if (signed.id === null) return signed.administrator;

  const owner = await standing();

  return !owner.linked && owner.account === signed.id;
}

// The supervisor the receiver's default answerer setting names, the one that answers every room naming none (the
// receiver's `docs/api.md`, 「Supervisors」); null where the receiver is not reached or names none.
export async function defaultAnswerer(): Promise<string | null> {
  try {
    const held = await receiverCall(receiver().GET("/default-answerer"));

    return held.supervisor === "" ? null : held.supervisor;
  } catch {
    return null;
  }
}
