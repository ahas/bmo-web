import { agency, agencyCall, carriedOf } from "./agency";
import { ownerChat } from "./owner";
import { receiver, receiverCall } from "./receiver";
import { within } from "./unit-answer";

import type { AgentFace } from "#shared/types";

// The person number each chat agent's own words stand under, which its face is the picture of (docs/web.md,
// 「Profile photos」). The receiver names it per room (`GET /rooms/{roomId}/own-number`), so each chat agent is asked
// for in the owner's room and in every room it is a companion of, and the first number answered stands. The answer
// changes only as agents and rooms are made, so it is kept for a minute.

const KEPT_MS = 60_000;

let kept: { at: number; faces: Promise<AgentFace[]> } | null = null;

async function ownNumber(roomId: number, agentName: string): Promise<number | null> {
  try {
    const answer = await receiverCall(
      receiver().GET("/rooms/{roomId}/own-number", { params: { path: { roomId }, query: { agentName } }, signal: within(5_000) })
    );

    return answer.number ?? null;
  } catch {
    return null;
  }
}

async function readFaces(): Promise<AgentFace[]> {
  const [agents, rooms, owner] = await Promise.all([
    agencyCall(agency().GET("/agents")).then((answer) => answer.items).catch(() => []),
    receiverCall(receiver().GET("/rooms", { signal: within(5_000) })).then((answer) => answer.items).catch(() => []),
    ownerChat()
  ]);
  // The chat agents a person designates: a row of the chat kind holding a role (docs/web.md, 「Sidebar」).
  const chats = agents.filter((agent) => carriedOf(agent).kind === "chat" && agent.role !== "").map((agent) => agent.name);
  const faces = await Promise.all(
    chats.map(async (name): Promise<AgentFace | null> => {
      const places = [...(owner === null ? [] : [owner]), ...rooms.filter((room) => room.companions.includes(name)).map((room) => room.id)];

      for (const place of places) {
        const personId = await ownNumber(place, name);

        if (personId !== null) return { name, personId };
      }

      return null;
    })
  );

  return faces.filter((face): face is AgentFace => face !== null);
}

/** Each chat agent's own person number, where the receiver names one. */
export function agentFaces(now: number = Date.now()): Promise<AgentFace[]> {
  if (kept === null || now - kept.at >= KEPT_MS) {
    const faces = readFaces();

    kept = { at: now, faces };
    faces.catch(() => {
      kept = null;
    });
  }

  return kept.faces;
}
