import { userOf } from "../utils/account-service";

import type { OwnerChat } from "#shared/types";

// Whose chat is the owner's own, as the receiver names it (the receiver's `docs/boundary-api.md`, `GET /owner`), the
// sender every message the owner sends is archived under, the senders whose messages are the signed-in person's own
// (docs/web.md, 「Which messages stand on the right」), the owner's sender among them for the owner alone, and whether
// the one signed in is the administrator and whether the owner, for what a room offers them alone. A receiver or an
// account service that is not reached names none.
export default defineEventHandler(async (event): Promise<OwnerChat> => {
  const signed = await signedInUser(event);
  const [chatId, senderId, linked, owner] = await Promise.all([
    ownerChat(),
    ownerSender(),
    signed.id === null ? Promise.resolve([] as number[]) : userOf(signed.id).then((user) => user?.senders ?? [], () => [] as number[]),
    isOwnerLogin(signed).catch(() => false)
  ]);
  const senders = [...new Set([...linked, ...(owner && senderId !== null ? [senderId] : [])])];

  return { chatId, senderId, senders, administrator: signed.administrator, owner };
});
