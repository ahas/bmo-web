import { receiver, receiverCall } from "./receiver";

// The owner's private chat, as the receiver names it (the receiver's `docs/api.md`, 「The owner」), or null where
// the receiver is not reached.
export async function ownerChat(): Promise<number | null> {
  try {
    return (await receiverCall(receiver().GET("/owner"))).room ?? null;
  } catch {
    return null;
  }
}

// The registration name of the receiver's default answerer, the agent whose turns are the chat agent's, as the
// owner's room names it among its answerers; null where the receiver is not reached or names none.
export async function defaultAnswerer(): Promise<string | null> {
  const room = await ownerChat();

  if (room === null) return null;

  try {
    const answerers = await receiverCall(receiver().GET("/rooms/{roomId}/answerers", { params: { path: { roomId: room } } }));

    return answerers.default === "" ? null : answerers.default;
  } catch {
    return null;
  }
}
