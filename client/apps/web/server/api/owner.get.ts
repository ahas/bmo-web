import { userOf } from "../utils/account-service";

import type { OwnerChat } from "#shared/types";

// Whose chat is the owner's own, as the receiver names it (the receiver's `docs/boundary-api.md`, `GET /owner`), the
// sender every message the owner sends is archived under, the senders whose messages are the signed-in person's own
// (docs/web.md, 「Which messages stand on the right」), and whether the one signed in is the administrator, for what a
// room offers them alone. A receiver or an account service that is not reached names none.
export default defineEventHandler(async (event): Promise<OwnerChat> => {
  const signed = await signedInUser(event);
  const [chatId, senderId, linked] = await Promise.all([
    ownerChat(),
    ownerSender(),
    signed.id === null ? Promise.resolve([] as number[]) : userOf(signed.id).then((user) => user?.senders ?? [], () => [] as number[])
  ]);
  const senders = [...new Set([...linked, ...(signed.administrator && senderId !== null ? [senderId] : [])])];

  return { chatId, senderId, senders, administrator: signed.administrator };
});
