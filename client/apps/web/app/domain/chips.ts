import type { BarColor } from "bmo-ui/app/domain/bars";
import type { VerdictState } from "./judgements";
import type { MessageBriefing, TurnRecord } from "#shared/types";
import type { Translate } from "#shared/wording";

// The chips of a message's thin line — how full the session stood, what the turn read, what it
// called, what it spent, what it wrote down, how its answer was drafted, the verdicts, and the voice briefing that speaks it — and
// how each one answers a pointer. They stand side by side, and those that spread what is under them
// answer alike.
//
// A chip standing open carries a background of its own, and that is what makes the open and the
// closed states of this row differ at a glance. It also means the closed state's hover colour is
// the open one's resting colour: an open chip given that hover answers a pointer with the colour
// it already wears, which is to say with nothing. So each state walks its own three steps —
// resting, under the pointer, and pressed — and no two of them land on one colour.
//
// The chips stand inside a bubble, whose ground is the raised one on the left and a tint on the
// right, so the steps are washes of the chip's own letter colour laid over whatever ground is under
// it rather than grounds of their own: a ground of the theme's would vanish on the bubble that wears
// the same one. Over a picture a chip stands inside the overlay chip's own ground and draws no box of
// its own, so nothing lightens over the picture: it answers a pointer by its light letters alone,
// dimmed at rest and full under the pointer and pressed, and it keeps no side room of its own, so
// the overlay chip's room is the same at both ends (docs/web.md, 「The image overlay chip」).
export function chipLook(open: boolean, over = false): string {
  if (over) {
    return "px-0 text-white/75 hover:text-white active:text-white";
  }

  return open
    ? "px-1 bg-current/10 text-muted hover:bg-current/20 hover:text-highlighted active:bg-current/5 active:text-muted"
    : "px-1 text-dimmed hover:bg-current/10 hover:text-muted active:bg-current/20 active:text-highlighted";
}

// A chip that spreads nothing — how full the session stood — is pressed for nothing, so it rests in
// the closed chip's colours and answers no pointer with a colour of its own.
export const STILL_CHIP_LOOK = "px-1 text-dimmed";

export type ChipKind = "context" | "brain" | "tools" | "tokens" | "records" | "drafts" | "verdicts" | "briefing";

// A chip says what it is with its mark alone, and its name with its tooltip.
export const CHIP_ICONS: Record<ChipKind, string> = {
  context: "i-material-symbols-data-usage",
  brain: "i-material-symbols-psychology-outline",
  tools: "i-material-symbols-build-outline",
  tokens: "i-material-symbols-token-outline",
  records: "i-material-symbols-inventory-2-outline",
  drafts: "i-material-symbols-edit-note",
  verdicts: "i-material-symbols-gavel",
  briefing: "i-material-symbols-record-voice-over-outline"
};

export const CHIP_LABELS: Record<ChipKind, string> = {
  context: "room.label.chip_context",
  brain: "room.label.chip_brain",
  tools: "room.label.chip_tools",
  tokens: "room.label.chip_tokens",
  records: "room.label.chip_records",
  drafts: "room.label.chip_drafts",
  verdicts: "room.label.chip_verdicts",
  briefing: "room.label.chip_briefing"
};

// How full the session stood, as the context chip says it: a whole percentage of the window.
export function contextChipText(ratio: number): string {
  return `${Math.round(ratio * 100)}%`;
}

// How the briefing chip looks at each state of the line's full reading. The mark is the chip's own
// before anything is made and once the reading is there, the spinning mark of work going on while it
// is being made, its own again in the error colour where it could not be made, and its own where it
// was stopped before it stood, to be asked for again; the name says the state in the tooltip.
export interface BriefingChip {
  icon: string;
  iconClass: string;
  label: string;
}

export function briefingChip(state: MessageBriefing["state"]): BriefingChip {
  switch (state) {
    case "making":
      return { icon: "i-material-symbols-progress-activity", iconClass: "animate-spin", label: "room.label.chip_briefing_making" };
    case "failed":
      return { icon: CHIP_ICONS.briefing, iconClass: "text-error", label: "room.label.chip_briefing_failed" };
    case "stopped":
      return { icon: CHIP_ICONS.briefing, iconClass: "", label: "room.label.chip_briefing_stopped" };
    case "idle":
    case "ready":
      return { icon: CHIP_ICONS.briefing, iconClass: "", label: CHIP_LABELS.briefing };
  }
}

// How the verdict chip's mark looks at each state of its message's verdicts: beating in the chip's
// own grey while the message is being judged, then the bubble's green or red mark ink, or the chip's
// grey again; the name says the state in the tooltip (docs/web.md, 「Room screen」).
export interface VerdictChip {
  iconClass: string;
  label: string;
}

export function verdictChip(state: VerdictState): VerdictChip {
  switch (state) {
    case "judging":
      return { iconClass: "verdict-beat", label: "room.label.chip_verdicts_judging" };
    case "success":
      return { iconClass: "text-(--chat-mark-success)", label: "room.label.chip_verdicts_passed" };
    case "error":
      return { iconClass: "text-(--chat-mark-error)", label: "room.label.chip_verdicts_failed" };
    case "neutral":
      return { iconClass: "", label: CHIP_LABELS.verdicts };
  }
}

// Where one record landed, as the badge its line wears: a note of the room, an errand of its
// memories, a situation rule, a new TODO row or words appended to one, or a watch that wakes the agent,
// with its number where the call's answer named it.
export function recordLook(t: Translate, record: TurnRecord): { label: string; color: BarColor } {
  const id = record.id;

  switch (record.kind) {
    case "note":
      return { label: id === null ? t("room.label.record_note") : t("room.label.record_note_numbered", { id }), color: "info" };
    case "memory":
      return { label: id === null ? t("room.label.record_memory") : t("room.label.record_memory_numbered", { id }), color: "warning" };
    case "rule":
      return { label: id === null ? t("room.label.record_rule") : t("room.label.record_rule_numbered", { id }), color: "secondary" };
    case "todo-add":
      return { label: id === null ? t("room.label.record_todo_add") : t("room.label.record_todo_add_numbered", { id }), color: "primary" };
    case "todo-append":
      return {
        label: id === null ? t("room.label.record_todo_append") : t("room.label.record_todo_append_numbered", { id }),
        color: "primary"
      };
    case "watch":
      return { label: id === null ? t("room.label.record_watch") : t("room.label.record_watch_numbered", { id }), color: "success" };
  }
}
