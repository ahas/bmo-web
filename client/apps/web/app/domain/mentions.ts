import { nextTick, ref, shallowRef } from "vue";

import type { Ref, ShallowRef } from "vue";
import type { AvatarProps } from "@nuxt/ui";

// The mention an @ starts in the input box (docs/web.md, the room screen's section on mentions): the list of the room's people and
// agents a name can be picked from, the keyboard that moves over it, and the words a pick leaves in the box. The
// name is written as itself, because that is what the receiver reads: a message reaches an agent because its words
// carry the agent's registered label or a wake word (the receiver's `docs/wake.md`), and a person is named as the
// room names them. No @ survives a pick.

// One name the list offers: a person's, or an agent's label, and which of the two it is for the mark beside it.
export type MentionKind = "person" | "agent";

export interface MentionCandidate {
  // The name written into the words, which is what the receiver reads.
  text: string;
  kind: MentionKind;
  // The picture the row wears, on an agent that has one (docs/web.md, the room screen's mention section).
  avatar?: AvatarProps;
}

// An agent a room offers: the receiver's registration name, the name it is called by, and the picture the catalogue
// gives it.
export interface MentionAgent {
  name: string;
  label: string;
  avatar?: AvatarProps;
}

// Who a room offers: the people who spoke there, the reader's own left out, and the agents answering it.
export interface MentionSources {
  people: readonly string[];
  agents: readonly MentionAgent[];
}

// What the list reads of the box it stands over: the words, where the caret is, and the way back to the words after a
// pick. A textarea is one, and a test's stand-in need be no more.
export type MentionBox = Pick<HTMLTextAreaElement, "value" | "selectionStart" | "focus" | "setSelectionRange">;

// How much of a name may follow the @ before the list gives up on it: a name is short, and an @ inside a sentence
// that keeps going is a sentence.
const QUERY_MAX = 40;

export interface Mentions {
  open: ShallowRef<boolean>;
  items: ShallowRef<MentionCandidate[]>;
  active: Ref<number>;
  // Whether the mention being typed is still the one the list was opened for.
  track: () => void;
  // A key the open list takes for itself; true means it was taken.
  key: (event: KeyboardEvent) => boolean;
  // The name at a place in the list, written into the words.
  choose: (index?: number) => void;
  aim: (index: number) => void;
  close: () => void;
}

// Which name stands at the caret, where the caret is inside an @ and its words: the place the @ starts at, or null.
function tokenAt(value: string, caret: number): { at: number; query: string } | null {
  const before = value.slice(0, caret);
  const found = /(^|\s)@([^\s@]*)$/.exec(before);

  if (found === null || found[2]!.length > QUERY_MAX) return null;

  return { at: before.length - found[2]!.length - 1, query: found[2]! };
}

/**
 * The mention a box offers, over the words and the box they are written in: the names written in `text`, the box read
 * for its caret, and the room's people and agents read when the list is asked for.
 */
export function useMentions(text: Ref<string>, box: () => MentionBox | null, sources: () => MentionSources, enabled: () => boolean): Mentions {
  const open = shallowRef(false);
  const items = shallowRef<MentionCandidate[]>([]);
  const active = ref(0);
  // Where the @ stands in the words and where the caret was when the list was last read; a pick replaces that stretch.
  let at = -1;
  let caret = -1;

  const candidates = (): MentionCandidate[] => {
    const { people, agents } = sources();
    const held = new Map<string, MentionCandidate>();

    // The agents first: calling one is what an @ is usually for. An agent's name wins one both lists hold, since it
    // is the name the receiver wakes.
    for (const agent of agents) {
      const label = agent.label.trim();

      if (label !== "") held.set(label, { text: label, kind: "agent", ...(agent.avatar === undefined ? {} : { avatar: agent.avatar }) });
    }

    for (const name of people) {
      if (name.trim() !== "" && !held.has(name)) held.set(name, { text: name, kind: "person" });
    }

    return [...held.values()];
  };

  const close = (): void => {
    open.value = false;
    items.value = [];
    active.value = 0;
    at = -1;
    caret = -1;
  };

  const track = (): void => {
    if (!enabled()) return close();

    const area = box();

    if (area === null) return close();

    const found = tokenAt(area.value, area.selectionStart ?? 0);

    if (found === null) return close();

    const query = found.query.toLowerCase();
    const shown = candidates().filter((candidate) => candidate.text.toLowerCase().includes(query));

    if (shown.length === 0) return close();

    at = found.at;
    caret = area.selectionStart ?? 0;
    // A list that was already open keeps the choice it stood on where that name is still offered.
    const held = open.value ? items.value[active.value] : undefined;
    items.value = shown;
    active.value = held === undefined ? 0 : Math.max(0, shown.findIndex((candidate) => candidate.text === held.text && candidate.kind === held.kind));
    open.value = true;
  };

  const key = (event: KeyboardEvent): boolean => {
    if (!open.value) return false;
    // A key pressed to finish a composition is the letters' own, not the list's.
    if (event.isComposing) return false;

    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      const step = event.key === "ArrowDown" ? 1 : -1;

      active.value = (active.value + step + items.value.length) % items.value.length;

      return true;
    }

    if (event.key === "Escape") {
      close();

      return true;
    }

    // Enter with a modifier is a line of its own, and never a pick.
    if ((event.key === "Enter" || event.key === "Tab") && !event.shiftKey && !event.altKey && !event.ctrlKey && !event.metaKey) {
      choose();

      return true;
    }

    return false;
  };

  const aim = (index: number): void => {
    active.value = index;
  };

  const choose = (index: number = active.value): void => {
    const area = box();
    const candidate = items.value[index];

    if (area === null || candidate === undefined || at < 0 || caret < 0) return close();

    const value = text.value;
    // The words after the @ that were not read as a name stay where they stand; the name takes the @ and its start.
    const after = value.slice(caret);
    const next = `${value.slice(0, at)}${candidate.text} ${after}`;

    text.value = next;
    close();

    // The caret goes after the name and the space it left, so typing carries on from there.
    void nextTick(() => {
      const place = at + candidate.text.length + 1;

      area.focus();
      area.setSelectionRange(place, place);
    });
  };

  return { open, items, active, track, key, choose, aim, close };
}

