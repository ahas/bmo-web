import type { MessageBriefing, VoiceBriefing } from "./types";

// Where a voice briefing stands, read off the voice engine's word for it (its `docs/boundary-api.md`, 「Briefings」)
// by the server's page reads and the tab's stream alike: done, failed, stopped before it stood, or else still
// waiting on its making.
export function briefingStateOf(engineState: unknown): VoiceBriefing["state"] {
  switch (engineState) {
    case "done":
    case "failed":
    case "stopped":
      return engineState;
    default:
      return "waiting";
  }
}

// Where a line's full reading stands for its chip (docs/web.md, the room screen's voice briefing chip), as the
// briefing it is stands.
export function readingStateOf(state: VoiceBriefing["state"]): MessageBriefing["state"] {
  switch (state) {
    case "done":
      return "ready";
    case "waiting":
      return "making";
    case "failed":
    case "stopped":
      return state;
  }
}
