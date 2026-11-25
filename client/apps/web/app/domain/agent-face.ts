import { agentKey, avatarFor, avatarKey, useAvatars } from "./avatars";
import { chatAgent } from "#shared/agent-names";
import { chatIdOf } from "./agents";
import { agentAvatar } from "./room";

import type { AgentMeta } from "./agents";
import type { AvatarIndex } from "./avatars";
import type { AgentFace, RoomSummary } from "#shared/types";
import type { AvatarProps } from "@nuxt/ui";
import type { ComputedRef } from "vue";

// What an agent stands as wherever it stands (docs/web.md, 「Profile photos」): every chat agent its face, decided
// here and nowhere else, so the chat agents — who are equal — are drawn alike on every screen; a role and a repository
// their branch's mark.

/** What an agent's mark is drawn from. */
export type AgentMarkSubject = Pick<AgentMeta, "name" | "label" | "chatId" | "group" | "icon">;

/** The person number each chat agent's own words stand under and the rooms it speaks in that are no one's private
 * room, by its name. */
export type AgentFaces = ReadonlyMap<string, Pick<AgentFace, "personId" | "rooms">>;

export function agentFacesOf(faces: readonly AgentFace[]): AgentFaces {
  return new Map(faces.map((face) => [face.name, { personId: face.personId, rooms: face.rooms }]));
}

/** Whether an agent stands as a face: every supervisor alike. */
export function wearsFace(agent: Pick<AgentMeta, "group">): boolean {
  return agent.group === "supervisor";
}


/**
 * An agent's picture wherever a screen names it (docs/web.md, 「Profile photos」): the picture of the person number its
 * words stand under — the agent's own face, whichever row of the catalogue it stands in, a session registered for one
 * room among them — then of the newest room it speaks in that keeps one and is no one's private room, and failing both
 * its label's letter on its identity's colour.
 */
export function agentPicture(agent: Pick<AgentMeta, "name" | "label" | "chatId">, avatars: AvatarIndex, faces: AgentFaces): AvatarProps {
  // A session the chat agent keeps for one room is that agent serving it, and wears the agent's own face.
  const session = chatIdOf(agent.name);
  const name = session !== null || agent.name === chatAgent().name ? chatAgent().name : agent.name;
  const face = faces.get(name);
  const person = face?.personId ?? null;

  if (person !== null && avatars.has(avatarKey("person", person))) return avatarFor(avatars, "person", person, agent.label);

  const room = face?.rooms.find((one) => avatars.has(avatarKey("room", one)));

  return room === undefined ? avatarFor(avatars, "person", person, agent.label) : avatarFor(avatars, "room", room, agent.label);
}

/** The face each agent wears on this screen, or none where it stands as its group's mark. */
export function useAgentFace(): ComputedRef<(agent: Pick<AgentMeta, "name" | "label" | "chatId" | "group">) => AvatarProps | undefined> {
  const avatars = useAvatars();
  const { data } = useFetch<AgentFace[]>("/api/agent-faces", { key: "agent-faces", lazy: true, server: false, default: () => [] });
  const faces = computed(() => agentFacesOf(data.value ?? []));

  return computed(() => (agent) => (wearsFace(agent) ? agentPicture(agent, avatars.value, faces.value) : undefined));
}

/**
 * The avatar index with every chat agent's face laid in under its name beside the rooms and people: the picture of
 * the person number its words stand under, or of a room it speaks in.
 */
export function withAgentFaces(avatars: AvatarIndex, faces: AgentFaces): AvatarIndex {
  const index = new Map(avatars);

  for (const name of faces.keys()) {
    const src = agentPicture({ name, label: name, chatId: null }, avatars, faces).src;

    if (typeof src === "string") index.set(agentKey(name), src);
  }

  return index;
}

/** The screen's avatar index, every chat agent's face laid in under its name. */
export function useAgentAvatars(): ComputedRef<AvatarIndex> {
  const avatars = useAvatars();
  const { data } = useFetch<AgentFace[]>("/api/agent-faces", { key: "agent-faces", lazy: true, server: false, default: () => [] });

  return computed(() => withAgentFaces(avatars.value, agentFacesOf(data.value ?? [])));
}

/**
 * What a room wears wherever it is drawn (docs/web.md, 「An agent's private room stands as its agent」): an agent's
 * private room the face its agent wears, under the index's agent faces, and its name's letter on the agent's own
 * colour where the agent has none; any other room its own picture.
 */
export function roomFace(avatars: AvatarIndex, room: Pick<RoomSummary, "chatId" | "title" | "agent">): AvatarProps {
  return room.agent === null ? avatarFor(avatars, "room", room.chatId, room.title) : agentAvatar(avatars, room.agent, room.title);
}
