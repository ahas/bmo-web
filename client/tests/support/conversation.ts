// How a conversational agent's row declares its session, as the agency answers it in the agent list (the
// agency's docs/agents.md, 「One runner」): what a test hands the console as an agent of a kind.

export type SessionScope = "agent" | "room";
export type TurnShape = "window" | "pieces";

export interface Conversation {
  scope: SessionScope;
  shape: TurnShape;
  // Whether it answers every room that names no answerer.
  defaultAnswerer: boolean;
}

// A room-scoped supervisor's: a session in each room, its settings' pieces.
const roomScoped: Conversation = { scope: "room", shape: "pieces", defaultAnswerer: false };

// The chat agent's: one session across the rooms, its window's turns, answering every room that names nobody.
const chat: Conversation = { scope: "agent", shape: "window", defaultAnswerer: true };

/** The conversation an agent of this kind carries, or null for a kind that is no conversational agent's. */
export function conversationOf(row: { kind: string }): Conversation | null {
  return row.kind === "chat" ? chat : row.kind === "room" ? roomScoped : null;
}
