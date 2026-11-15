import { userOf } from "./account-service";
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

/** Whether the signed-in login is the owner's: the account the account service links to the owner's sender, or a
 * console login standing before the account model, which is the owner's. What is granted to the owner hangs on this,
 * never on the console a word was typed in (docs/web.md, 「Access」). */
export async function isOwnerLogin(signed: SignedIn): Promise<boolean> {
  if (signed.id === null) return signed.administrator;

  const owner = await ownerSender();

  return owner !== null && ((await userOf(signed.id))?.senders ?? []).includes(owner);
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
