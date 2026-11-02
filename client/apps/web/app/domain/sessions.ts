import type { SessionView } from "#shared/agency";
import type { Translate } from "#shared/wording";

// An agent's session as the console lists it and asks it cleared (the agency's docs/session-resets.md).

// The line a reset's confirmation says of what it clears, by the session's scope (the agency's `docs/api.md`,
// 「sessions」): a supervisor's one session across its rooms, or its session in one room. Any other scope says the
// plain line.
export function sessionClears(t: Translate, session: Pick<SessionView, "kind" | "running" | "models" | "title" | "chatId" | "generation">): string {
  if (session.kind === "agent") return t("agents.message.session_clears_chat");
  if (session.kind === "room") {
    return t("agents.message.session_clears_companion", { room: session.title ?? String(session.chatId), generation: (session.generation ?? 0).toLocaleString("en-US") });
  }

  return t("agents.message.session_clears");
}

// Which session a row is, on one line: a room and its generation, or the models it runs on.
export function sessionDetail(t: Translate, session: Pick<SessionView, "kind" | "models" | "title" | "chatId" | "generation">): string {
  if (session.chatId !== null) {
    return t("agents.label.session_room", { room: session.title ?? String(session.chatId), generation: (session.generation ?? 0).toLocaleString("en-US") });
  }
  if (session.kind === "agent") return t("agents.label.session_chat", { model: session.models.join(", ") });

  return t("agents.label.session_models", { models: session.models.join(", ") });
}

// When a session was last cleared, on the console's clock, or nothing where it never was.
export function sessionClearedAt(t: Translate, seconds: number | null): string {
  if (seconds === null) return "";

  const at = new Date(seconds * 1000).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });

  return t("agents.label.session_cleared_at", { time: at });
}
