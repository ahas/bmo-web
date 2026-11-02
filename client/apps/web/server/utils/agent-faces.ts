import { agency, agencyCall } from "./agency";
import { ownerChat } from "./owner";
import { receiver, receiverCall } from "./receiver";

import type { AgentFace } from "#shared/types";

// The person number each chat agent's own words stand under, which its face is the picture of (docs/web.md,
// 「Profile photos」). The receiver names it per room (`GET /rooms/{roomId}/own-number`), so each chat agent is asked
// for in the owner's room, then in every room it is a companion of, then in every other room — a room the console made
// on the record road numbers no agent — and the first number answered in that order stands. The answer
// changes only as agents and rooms are made, so it is kept for a minute.

const KEPT_MS = 60_000;

let kept: { at: number; faces: Promise<AgentFace[]> } | null = null;

async function ownNumber(roomId: number, agentName: string): Promise<number | null> {
  try {
    const answer = await receiverCall(
      receiver().GET("/rooms/{roomId}/own-number", { params: { path: { roomId }, query: { agentName } } })
    );

    return answer.number ?? null;
  } catch {
    return null;
  }
}

async function readFaces(): Promise<AgentFace[]> {
  const [supervisors, rooms, owner] = await Promise.all([
    agencyCall(agency().GET("/supervisors")).then((answer) => answer.items).catch(() => []),
    receiverCall(receiver().GET("/rooms")).then((answer) => answer.items).catch(() => []),
    ownerChat()
  ]);
  // The chat agents are the supervisors, the chat agent and every companion alike (docs/web.md, 「Sidebar」).
  const chats = supervisors.map((supervisor) => supervisor.name);
  const faces = await Promise.all(
    chats.map(async (name): Promise<AgentFace | null> => {
      const companionOf = rooms.filter((room) => room.companions.includes(name)).map((room) => room.id);
      const places = [...new Set([...(owner === null ? [] : [owner]), ...companionOf, ...rooms.map((room) => room.id)])];
      const numbers = await Promise.all(places.map((place) => ownNumber(place, name)));
      const personId = numbers.find((number) => number !== null) ?? null;

      return personId === null ? null : { name, personId };
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
