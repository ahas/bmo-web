import { hasBody } from "./room-copy";
import { REACTION_EMOJIS } from "./message-acts";

import type { ContextMenuItem } from "@nuxt/ui";
import type { Said } from "./room-copy";
import type { Translate } from "#shared/wording";

// What one message's menu offers: the answer, the acts on the message — a reaction, a pin, an edit of the reader's own
// and a delete of it — the three ways of taking the message away, and the way into choosing several of them. What the
// record would refuse is not offered: the answer and the acts stand only where the reader may write to the room, a
// message the reader's own senders did not say carries no edit, and no delete unless the reader is the administrator.
export interface MessageMenuActions {
  reply: () => void;
  forward: () => void;
  react: (emoji: string) => void;
  pin: (on: boolean) => void;
  edit: () => void;
  remove: () => void;
  copy: () => void;
  copyBody: () => void;
  copyRef: () => void;
  select: () => void;
}

// What the menu is built from, beyond the words: whether the message is the reader's, whether the reader is the
// administrator, and where the message stands in the record.
export interface MessageMenuState extends Said {
  deleted?: boolean;
  // Whether the reader's own senders said it.
  mine?: boolean;
  // Whether the reader is the platform administrator, whose delete the record takes on any message.
  administrator?: boolean;
  // Whether the reader may write to the room. The answer and the acts on a message stand only where they may;
  // the copy and the choosing stand for every reader.
  writable?: boolean;
  // Whether the record holds a pin on it, and the emoji the reader has put on it where one stands.
  pinned?: boolean;
  reaction?: string | null;
}

// The reactions as the messenger offers them: one strip of every emoji the console offers at the menu's head, drawn
// by the row's own slot of this name, each emoji pressed putting it on the message or taking the reader's own off.
export const REACTION_STRIP_SLOT = "reactions";

/** The emojis the strip offers, the reader's own marked, each pressed doing what the menu's act does. */
export function reactionStrip(reaction: string | null | undefined, react: (emoji: string) => void): { emoji: string; mine: boolean; press: () => void }[] {
  return REACTION_EMOJIS.map((emoji) => ({ emoji, mine: reaction === emoji, press: () => react(emoji) }));
}

function reactions(t: Translate): ContextMenuItem {
  // The strip is one entry: pressing one of its emojis selects the entry, which closes the menu.
  return { label: t("room.action.react"), slot: REACTION_STRIP_SLOT, onSelect: () => {} };
}

export function messageMenu(t: Translate, item: MessageMenuState, actions: MessageMenuActions): ContextMenuItem[][] {
  // A deleted message has nothing left to answer, act on, copy or choose but the line that points at it.
  if (item.deleted === true) {
    return [[{ label: t("room.action.copy_ref"), icon: "i-material-symbols-tag", onSelect: () => actions.copyRef() }]];
  }

  // The answer and the acts are writes to the room, so they stand only where the reader may write it.
  const writable = item.administrator === true || item.writable === true;

  const own: ContextMenuItem[] = [];

  if (writable && item.mine === true) {
    own.push({ label: t("room.action.edit_message"), icon: "i-material-symbols-edit-outline", onSelect: () => actions.edit() });
  }

  if (writable && (item.mine === true || item.administrator === true)) {
    own.push({ label: t("common.action.delete"), icon: "i-material-symbols-delete-outline", onSelect: () => actions.remove() });
  }

  // The forward is the owner's alone: the record keeps the copy as theirs (docs/web.md, the room screen's message
  // menu).
  const answer: ContextMenuItem[] = writable
    ? [
        { label: t("room.action.reply"), icon: "i-material-symbols-reply", onSelect: () => actions.reply() },
        ...(item.administrator === true
          ? [{ label: t("room.action.forward"), icon: "i-material-symbols-forward", onSelect: () => actions.forward() }]
          : [])
      ]
    : [];

  const acts: ContextMenuItem[] = writable
    ? [
        {
          label: item.pinned === true ? t("room.action.unpin") : t("room.action.pin"),
          icon: "i-material-symbols-keep",
          onSelect: () => actions.pin(item.pinned !== true)
        }
      ]
    : [];

  return [
    writable ? [reactions(t)] : [],
    answer,
    acts,
    own,
    [
      { label: t("common.action.copy"), icon: "i-material-symbols-content-copy-outline", onSelect: () => actions.copy() },
      {
        label: t("room.action.copy_text"),
        icon: "i-material-symbols-text-fields",
        disabled: !hasBody(item),
        onSelect: () => actions.copyBody()
      },
      { label: t("room.action.copy_ref"), icon: "i-material-symbols-tag", onSelect: () => actions.copyRef() }
    ],
    [{ label: t("room.action.select"), icon: "i-material-symbols-checklist", onSelect: () => actions.select() }]
  ].filter((group) => group.length > 0);
}
