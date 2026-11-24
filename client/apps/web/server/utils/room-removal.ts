import { wording } from "#shared/wording";

import { chatRoadName } from "./receiver";

// How a room's removal is said in the dialog (docs/web.md, the room menu's removal of its registration): each
// warning the receiver gives and each thing it could not remove, by the code or kind it carries (the receiver's `docs/codes.md`, `RoomRemovalWarning` and
// `RemovalLeft`), in the pack's sentences. The receiver's English is never shown; a code the pack holds no sentence
// for is said by the pack's sentence for its sort.

type Fields = Record<string, unknown>;

const text = (value: unknown): string => (typeof value === "string" ? value : "");

const names = (value: unknown): string => (Array.isArray(value) ? value.filter((one) => typeof one === "string").join(", ") : "");

// Each warning code's sentence, from the warning's own fields.
const WARNINGS: Readonly<Record<string, (one: Fields) => string>> = {
  answerers: (one) => wording("room.label.removal_warning_answerers", { names: names(one.names) }),
  road: (one) => wording("room.label.removal_warning_road", { road: chatRoadName(text(one.road)) }),
  private: (one) => wording("room.label.removal_warning_private", { user: text(one.user) })
};

// Each kind of thing left behind, its sentence by its path.
const LEFT: Readonly<Record<string, (one: Fields) => string>> = {
  "outside-data-root": (one) => wording("room.label.removal_left_outside", { path: text(one.path) }),
  "not-removed": (one) => wording("room.label.removal_left_not_removed", { path: text(one.path) })
};

const fieldsOf = (value: unknown): Fields => (typeof value === "object" && value !== null ? (value as Fields) : {});

/** A removal's warnings, each in the pack's sentence for its code. */
export function removalWarnings(warned: unknown): string[] {
  if (!Array.isArray(warned)) return [];

  return warned.map((each) => {
    const one = fieldsOf(each);
    const say = typeof one.code === "string" && Object.hasOwn(WARNINGS, one.code) ? WARNINGS[one.code] : undefined;

    return say === undefined ? wording("room.label.removal_warning_other") : say(one);
  });
}

/** What a removal could not take down, each in the pack's sentence for its kind. */
export function removalLeft(couldNot: unknown): string[] {
  if (!Array.isArray(couldNot)) return [];

  return couldNot.map((each) => {
    const one = fieldsOf(each);
    const say = typeof one.kind === "string" && Object.hasOwn(LEFT, one.kind) ? LEFT[one.kind] : undefined;

    return say === undefined ? wording("room.label.removal_left_other") : say(one);
  });
}
