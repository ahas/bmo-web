import { hasBody } from "./room-copy";

import type { ContextMenuItem } from "@nuxt/ui";
import type { Said } from "./room-copy";
import type { Translate } from "#shared/wording";

// What one message's menu offers: answering it, the three ways of taking the message away, and
// the way into choosing several of them.
export interface MessageMenuActions {
  reply: () => void;
  copy: () => void;
  copyBody: () => void;
  copyRef: () => void;
  select: () => void;
}

export function messageMenu(t: Translate, item: Said & { deleted?: boolean }, actions: MessageMenuActions): ContextMenuItem[][] {
  // A deleted message has nothing left to answer, copy or choose but the line that points at it.
  if (item.deleted === true) {
    return [[{ label: t("room.action.copy_ref"), icon: "i-material-symbols-tag", onSelect: () => actions.copyRef() }]];
  }

  return [
    [{ label: t("room.action.reply"), icon: "i-material-symbols-reply", onSelect: () => actions.reply() }],
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
  ];
}
