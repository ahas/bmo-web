// The tabs of the room information a room's name opens (docs/web.md, the room screen's room information): the room's
// members, each kind of what its messages carried, its situation, and for the administrator its figures, its chat
// services and its tone layer.

import type { RoomHolding } from "#shared/types";

export type RoomInfoTab = "members" | RoomHolding | "situation" | "session" | "providers" | "tone";
