import { ACCOUNT_PRESENCE_EVENT } from "#shared/types";

import { frameEvent, rewrittenFrame } from "./sse-frames";

import type { AccountPresenceEvent, PresenceState } from "#shared/types";
import type { CompanyAccounts } from "./company-people";

// A presence of the receiver's stream as every reader is handed it (docs/web.md, 「Presence and typing」): an
// account that turned its presence off is handed with neither state nor last moment seen, to every reader alike,
// and so is every account while nobody knows whose presence may be shown. The presence of an account of the
// reader's company is handed by account as well, with no room, for the screens that show a person outside a room.

interface PresenceData {
  type?: unknown;
  who?: { kind?: unknown; account?: unknown } | null;
  state?: unknown;
  lastSeenAt?: unknown;
}

const STATES: readonly PresenceState[] = ["online", "away", "offline"];

// The presence a whole frame of the receiver's tells of an account, or null where it tells none.
function accountPresence(frame: string): { account: number; data: PresenceData } | null {
  // Most frames are no presence, and they pass without being read.
  if (!frame.includes('"presence"')) return null;

  const event = frameEvent(frame);

  if (event?.name !== "bot") return null;

  let data: PresenceData;

  try {
    data = JSON.parse(event.data) as PresenceData;
  } catch {
    return null;
  }

  const account = data.who?.kind === "account" ? data.who.account : undefined;

  if (data.type !== "presence" || typeof account !== "number") return null;

  return { account, data };
}

/** One whole frame of the receiver's with the presence it carries hidden where its account shows none. */
export function maskedPresence(frame: string, hidden: ReadonlySet<number> | null): string {
  const told = accountPresence(frame);

  if (told === null) return frame;
  if (hidden !== null && !hidden.has(told.account)) return frame;

  return rewrittenFrame(frame, () => JSON.stringify({ ...told.data, state: null, lastSeenAt: null }));
}

/**
 * One stream's reader of the presence its reader's company's people are handed by account: for each frame, already
 * masked, that tells an account of the company's presence in any room, the account's presence with no room — written
 * only where it differs from what this stream last handed of the account, since the receiver tells the same gathered
 * presence once for every room the account stands in.
 */
export function accountPresenceFrames(company: CompanyAccounts): (frame: string) => string[] {
  const handed = new Map<number, string>();

  return (frame) => {
    const told = accountPresence(frame);

    if (told === null || !company.has(told.account)) return [];

    const presence: AccountPresenceEvent = {
      account: told.account,
      state: STATES.find((state) => state === told.data.state) ?? null,
      lastSeenAt: typeof told.data.lastSeenAt === "number" ? told.data.lastSeenAt : null
    };
    const data = JSON.stringify(presence);

    if (handed.get(told.account) === data) return [];

    handed.set(told.account, data);

    return [`event: ${ACCOUNT_PRESENCE_EVENT}\ndata: ${data}\n\n`];
  };
}
