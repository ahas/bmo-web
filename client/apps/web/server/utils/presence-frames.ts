import { frameEvent, rewrittenFrame } from "./sse-frames";

// A presence of the receiver's stream as every reader is handed it (docs/web.md, 「Presence and typing」): an
// account that turned its presence off is handed with neither state nor last moment seen, to every reader alike,
// and so is every account while nobody knows whose presence may be shown.

interface PresenceData {
  type?: unknown;
  who?: { kind?: unknown; account?: unknown } | null;
}

/** One whole frame of the receiver's with the presence it carries hidden where its account shows none. */
export function maskedPresence(frame: string, hidden: ReadonlySet<number> | null): string {
  // Most frames are no presence, and they pass without being read.
  if (!frame.includes('"presence"')) return frame;

  const event = frameEvent(frame);

  if (event?.name !== "bot") return frame;

  let data: PresenceData;

  try {
    data = JSON.parse(event.data) as PresenceData;
  } catch {
    return frame;
  }

  const account = data.who?.kind === "account" ? data.who.account : undefined;

  if (data.type !== "presence" || typeof account !== "number") return frame;
  if (hidden !== null && !hidden.has(account)) return frame;

  return rewrittenFrame(frame, () => JSON.stringify({ ...data, state: null, lastSeenAt: null }));
}
