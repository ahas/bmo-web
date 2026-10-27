import { agentKey, avatarFor, avatarKey, useAvatars } from "./avatars";
import { chatAgent } from "#shared/agent-names";
import { chatIdOf } from "./agents";

import type { AgentMeta } from "./agents";
import type { AvatarIndex } from "./avatars";
import type { AgentFace, RoomSummary } from "#shared/types";
import type { AvatarProps } from "@nuxt/ui";
import type { ComputedRef } from "vue";

// What an agent stands as wherever it stands (docs/web.md, 「Profile photos」): every chat agent its face, decided
// here and nowhere else, so the chat agents — who are equal — are drawn alike on every screen; every other agent its
// group's mark.

/** What an agent's mark is drawn from. */
export type AgentMarkSubject = Pick<AgentMeta, "name" | "label" | "chatId" | "group" | "icon">;

/** The person number each chat agent's own words stand under, by its name. */
export type AgentFaces = ReadonlyMap<string, number>;

export function agentFacesOf(faces: readonly AgentFace[]): AgentFaces {
  return new Map(faces.map((face) => [face.name, face.personId]));
}

/** Whether an agent stands as a face: a chat agent, and a room's own session. */
export function wearsFace(agent: Pick<AgentMeta, "group">): boolean {
  return agent.group === "designated";
}


/**
 * An agent's picture wherever a screen names it (docs/web.md, 「Profile photos」): the picture of the person number its
 * words stand under — the agent's own face, whichever row of the catalogue it stands in, a session registered for one
 * room among them — then of a room made for it, and failing both its label's letter on its identity's colour. A room's
 * picture stands only where a room is what is shown, never for an agent.
 */
export function agentPicture(
  agent: Pick<AgentMeta, "name" | "label" | "chatId">,
  avatars: AvatarIndex,
  faces: AgentFaces,
  rooms: readonly RoomSummary[]
): AvatarProps {
  // A session the chat agent keeps for one room is that agent serving it, and wears the agent's own face.
  const session = chatIdOf(agent.name);
  const name = session !== null || agent.name === chatAgent().name ? chatAgent().name : agent.name;
  const person = faces.get(name) ?? null;

  if (person !== null && avatars.has(avatarKey("person", person))) return avatarFor(avatars, "person", person, agent.label);

  const room = rooms.find((one) => one.companions?.includes(name) === true && avatars.has(avatarKey("room", one.chatId)));

  return room === undefined ? avatarFor(avatars, "person", person, agent.label) : avatarFor(avatars, "room", room.chatId, agent.label);
}

/** The face each agent wears on this screen, or none where it stands as its group's mark. */
export function useAgentFace(): ComputedRef<(agent: Pick<AgentMeta, "name" | "label" | "chatId" | "group">) => AvatarProps | undefined> {
  const avatars = useAvatars();
  const { data } = useFetch<AgentFace[]>("/api/agent-faces", { key: "agent-faces", lazy: true, server: false, default: () => [] });
  const rooms = useNuxtData<RoomSummary[]>("rooms").data;
  const faces = computed(() => agentFacesOf(data.value ?? []));

  return computed(() => (agent) => (wearsFace(agent) ? agentPicture(agent, avatars.value, faces.value, rooms.value ?? []) : undefined));
}

/**
 * The avatar index with every chat agent's face laid in under its name beside the rooms and people: the picture of
 * the person number its words stand under, or of a room made for it.
 */
export function withAgentFaces(avatars: AvatarIndex, faces: AgentFaces, rooms: readonly RoomSummary[]): AvatarIndex {
  const index = new Map(avatars);
  const names = new Set([...faces.keys(), ...rooms.flatMap((room) => room.companions ?? [])]);

  for (const name of names) {
    const src = agentPicture({ name, label: name, chatId: null }, avatars, faces, rooms).src;

    if (typeof src === "string") index.set(agentKey(name), src);
  }

  return index;
}

/** The screen's avatar index, every chat agent's face laid in under its name. */
export function useAgentAvatars(): ComputedRef<AvatarIndex> {
  const avatars = useAvatars();
  const { data } = useFetch<AgentFace[]>("/api/agent-faces", { key: "agent-faces", lazy: true, server: false, default: () => [] });
  const rooms = useNuxtData<RoomSummary[]>("rooms").data;

  return computed(() => withAgentFaces(avatars.value, agentFacesOf(data.value ?? []), rooms.value ?? []));
}
