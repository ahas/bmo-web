import { DrawnImage } from "./drawn-image";
import { useLiveRefresh } from "./events";
import { appUrl } from "./urls";

import type { AvatarKind, AvatarRef } from "#shared/types";
import type { AvatarProps } from "@nuxt/ui";
import type { ComputedRef } from "vue";

// What stands for a name whose first character says nothing.
const ROOM_ICON = "i-material-symbols-chat-bubble-outline";
const PERSON_ICON = "i-material-symbols-person-outline";

// The letter an identity carries where its name says nothing at all and no mark was named for it.
const NAMELESS = "?";

// The pictures the console holds, by whose they are. A room and a person can carry the same
// number, so the kind is part of the key.
export type AvatarIndex = Map<string, string>;

export function avatarKey(kind: AvatarKind, id: number | string): string {
  return `${kind}:${id}`;
}

// Where an index holds a chat agent's face by the agent's registration name, beside the rooms and people: an answer
// filed under another's number, and the row standing for an agent that has not spoken yet, wear it by the name
// (docs/web.md, 「Profile photos」).
export function agentKey(name: string): string {
  return `agent:${name}`;
}

export function avatarIndex(refs: readonly AvatarRef[], toUrl: (path: string) => string): AvatarIndex {
  return new Map(refs.map((ref) => [avatarKey(ref.kind, ref.id), toUrl(ref.url)]));
}

// The first character worth showing of a name: the first letter or digit in it, as one letter.
export function initialOf(name: string): string {
  for (const character of name) {
    if (/[\p{Letter}\p{Number}]/u.test(character)) {
      return character.toUpperCase();
    }
  }

  return "";
}

// The colours an identity's circle is drawn in where it has no picture. They are dark enough for
// white lettering, which is what the circle carries whatever theme the console is in, and they are
// written as classes so that every avatar on the console — a row of a list, a folded side panel, a
// message — takes its tone from this one list.
export const AVATAR_TONES: readonly string[] = [
  "bg-red-700",
  "bg-orange-700",
  "bg-yellow-700",
  "bg-green-700",
  "bg-teal-700",
  "bg-blue-700",
  "bg-violet-700",
  "bg-pink-700",
  "bg-slate-600"
];

// The eight hues a person or a room is told apart by, at the step that carries white lettering, in
// the order of the conversation's eight name colours (room.ts NAME_COLOURS): one number chooses the
// same hue for the circle a face stands as and for the name at the head of a bubble, so the two are
// one colour (docs/web.md, 「Profile photos」).
export const FACE_TONES = [
  "bg-red-700",
  "bg-orange-700",
  "bg-amber-700",
  "bg-emerald-700",
  "bg-teal-700",
  "bg-sky-700",
  "bg-violet-700",
  "bg-pink-700"
] as const;

// Which of the eight hues a person or a room wears: chosen by its number, or by its name where it
// has none.
export function hueOf(id: number | null, name: string): number {
  const seed = id ?? [...name].reduce((sum, letter) => (sum * 31 + (letter.codePointAt(0) ?? 0)) % 1_000_003, 0);

  return Math.abs(seed) % FACE_TONES.length;
}

// The tone one identity carries. The same key always answers the same tone, so an item is known by
// its colour wherever it stands and however often the screen is drawn again.
export function avatarTone(key: string): string {
  let hash = 0;

  for (const character of key.toLowerCase()) {
    hash = (hash * 31 + character.codePointAt(0)!) % 1_000_003;
  }

  return AVATAR_TONES[hash % AVATAR_TONES.length]!;
}

// What an item wears in place of its name: the picture it has, and failing that the first letter of
// its name in a colour drawn from its own key. This is the one place that answers it, because the
// answer is needed wherever a name is gone — a side panel folded to its icons, a list of accounts,
// a row of a conversation — and a list that answered it for itself would stand its items as one
// repeated mark, which is the very thing a name was telling apart. A kind's own icon is the last
// resort and is for a name that carries no letter at all; where no icon is named, such a name
// stands as a question mark on its own tone rather than as nothing.
export function identityMark(key: string, name: string, options: { picture?: string; icon?: string; tone?: string } = {}): AvatarProps {
  if (options.picture !== undefined) {
    return pictureMark(options.picture, name);
  }

  const initial = initialOf(name);

  if (initial === "" && options.icon !== undefined) {
    return { icon: options.icon, alt: name };
  }

  // The letter takes the circle's own colour rather than the muted one an avatar's fallback
  // carries by default, which on a filled circle is barely there at all.
  return { text: initial === "" ? NAMELESS : initial, class: `${options.tone ?? avatarTone(key)} text-white`, ui: { fallback: "text-inherit" }, alt: name };
}

// A face drawn from its picture: the kept picture's address, which the viewer opens whole, and the copies the browser
// draws it from at the size it stands at (docs/web.md, 「A picture drawn small」).
export function pictureMark(picture: string, name: string): AvatarProps {
  return { src: picture, alt: name, as: { img: DrawnImage } };
}

// What one room or one person wears. The picture when there is one; otherwise the first letter
// of the name, which is a name standing in for a face rather than a broken image. A chat agent is one of them like
// any other, and a name with no letter at all falls back to the mark of its kind.
export function avatarFor(
  index: AvatarIndex,
  kind: AvatarKind,
  id: number | null,
  name: string
): AvatarProps {
  const key = avatarKey(kind, id ?? name);
  const picture = id === null ? undefined : index.get(key);

  return identityMark(key, name, { picture, icon: kind === "room" ? ROOM_ICON : PERSON_ICON, tone: FACE_TONES[hueOf(id, name)] });
}

// The whole list, asked for once a screen. It is a row per room and per person, so every name
// on the screen is answered from it rather than from a request of its own.
export function useAvatars(): ComputedRef<AvatarIndex> {
  const { data, refresh } = useFetch<AvatarRef[]>("/api/avatars", {
    key: "avatars",
    lazy: true,
    server: false,
    default: () => []
  });

  useLiveRefresh(() => { void refresh({ dedupe: "defer" }); }, { on: ["avatars-updated"], everyMs: 60_000 });

  return computed<AvatarIndex>(() => avatarIndex(data.value ?? [], appUrl));
}
