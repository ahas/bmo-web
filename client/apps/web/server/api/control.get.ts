import type { ControlStatus } from "#shared/types";

// Whether the receiver answers, and which chat is the owner's own. Both come from the receiver's health
// (the receiver's `docs/boundary-api.md`): a screen that knows the rooms are there knows whose room it is
// standing in as well.
export default defineEventHandler(async (event): Promise<ControlStatus> => {
  await requireUserSession(event);

  try {
    const health = await receiverCall(receiver().GET("/health"));
    const owner = await ownerChat().catch(() => null);

    return { reachable: health.ready === true, ownerChatId: owner };
  } catch {
    return { reachable: false, ownerChatId: null };
  }
});
