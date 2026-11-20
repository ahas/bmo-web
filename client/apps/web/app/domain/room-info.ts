// The tabs of the room information a room's name opens (docs/web.md, the room screen's room information): the room's
// members, each kind of what its messages carried, its situation, its callers, and for the administrator its figures
// and its chat services.

import type { RoomHolding } from "#shared/types";

export type RoomInfoTab = "members" | RoomHolding | "situation" | "callers" | "session" | "providers";
