import type { Translate } from "./wording";

// What the console calls a chat road the receiver names (docs/web.md, 「A chat road's name」): each road by its key, in the
// pack's own words for it. The receiver's label for a road is its own English and is never shown; a road the pack
// holds no words for is called by the pack's word for a messenger, its key beside it so two such roads stay apart.

// The key the receiver names the road it keeps itself by: the record the console reads a room off, which every room
// stands on and no chat service is.
export const RECORD_ROAD = "record";

// The pack's words for each road the receiver declares, by the road's key: the receiver's own record and every chat
// service its configuration may name a road for.
export const ROAD_NAMES: Readonly<Record<string, string>> = {
  [RECORD_ROAD]: "room.label.road_record",
  telegram: "room.label.road_telegram",
  kakao: "room.label.road_kakao",
  teams: "room.label.road_teams",
  discord: "room.label.road_discord"
};

/** A chat road's name in the reader's language, by its key. */
export function roadName(say: Translate, key: string): string {
  const named = Object.hasOwn(ROAD_NAMES, key) ? ROAD_NAMES[key] : undefined;

  return named === undefined ? say("room.label.road_other", { key }) : say(named);
}
