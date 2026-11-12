import { describe, expect, test } from "bun:test";

// The chip line under a message, read from the file that ships. What makes it open the way it does
// is what a rendered screen would not name: which rule the opening runs, which chip stands where,
// and what the turn's one record press holds.

const source = await Bun.file(new URL("../../../apps/web/app/components/JudgementChips.vue", import.meta.url)).text();
const template = source.slice(0, source.indexOf("<script"));
const script = source.slice(source.indexOf("<script"));

// The line the chips stand on, up to the first thing they spread.
const row = template.slice(template.indexOf("data-meta"), template.indexOf("data-spread"));
const lead = row.slice(row.indexOf("data-meta-lead"), row.indexOf("data-meta-trail"));
const trail = row.slice(row.indexOf("data-meta-trail"));

// The record's panel, from the press to what stands under the same spread apart from it.
const record = template.slice(template.indexOf('<div v-if="recordOpen" data-record'), template.indexOf("<TurnRecords"));

describe("the row and its record press", () => {
  test("the turn's brain, calls, drafts and judgement are one press, in place of three chips and a verdict button", () => {
    expect(row).toContain('<LineChip v-if="recorded" data-record-chip');
    expect(row).toContain('@toggle="toggleRecord"');
    expect(row).not.toContain("openActions(");
    expect(script).not.toContain("const ACTION_KINDS");
    expect(script).not.toContain("openDrafts");
  });

  test("the one button carries each part's own mark alone, and no mark of its own", () => {
    expect(row).toContain('data-record-brain class="inline-flex items-center gap-1"');
    expect(row).toContain(':aria-label="$t(CHIP_LABELS.brain)"');
    expect(row).toContain('data-record-tools class="inline-flex items-center gap-1"');
    expect(row).toContain(':aria-label="$t(CHIP_LABELS.tools)"');
    expect(row).toContain('data-record-drafts class="inline-flex items-center gap-1"');
    expect(row).toContain(':aria-label="$t(CHIP_LABELS.drafts)"');
    expect(row).toContain('data-record-verdicts class="inline-flex items-center gap-1"');
    expect(row).toContain(':aria-label="$t(CHIP_LABELS.verdicts)"');
    expect(row).toContain('<LineChip v-if="recorded" data-record-chip class="h-auto!" :label=');
    expect(row).not.toContain("{{ $t(CHIP_LABELS.");
  });

  test("stands only while it holds something, and opens on one press", () => {
    expect(script).toContain("const brainCounted = computed<boolean>(() => counts.value.documents + counts.value.held + counts.value.brain > 0);");
    expect(script).toContain("const judgedRecorded = computed<boolean>(() => props.answer && (recordCards.value.length > 0 || props.roundSituation != null));");
    expect(script).toContain("const recorded = computed<boolean>(() => brainCounted.value || counts.value.tools > 0 || drafted.value || judgedRecorded.value);");
    expect(script).toContain("const recordOpen = ref(false);");
    expect(script).toContain("recordOpen.value = !recordOpen.value;");
    expect(script).toContain("    recordOpen.value ||");
  });
});

describe("the record, in the order the turn made it", () => {
  test("is one timeline, sorted by the moment each line happened", () => {
    expect(script).toContain("const timeline = computed<RecordEntry[]>(() => {");
    expect(script).toContain("timed.sort((left, right) => (left.at ?? 0) - (right.at ?? 0) || left.seq - right.seq);");
    expect(script).toContain("return [...head, ...timed.map((one) => one.entry), ...tail];");
  });

  test("what the round read from the brain stands first, on a turn that has ended", () => {
    expect(script).toContain('head.push({ kind: "reads", reads: reads.value });');
    expect(record.indexOf('<BrainReads v-if="entry.kind === \'reads\'"')).toBeGreaterThan(-1);
  });

  test("a turn still running stands what it has done so far, in its own order", () => {
    expect(script).toContain('if (props.live.actions.length > 0) push(null, { kind: "actions", actions: props.live.actions });');
    expect(record).toContain(`<TurnActions v-else-if="entry.kind === 'actions'" :actions="entry.actions" />`);
  });

  test("every call stands as the agent's own log draws it, its result under the call", () => {
    expect(script).toContain('push(row.line.at, { kind: "call", row });');
    expect(script).toContain('one.kind === "tool-result" && one.ref !== null && one.ref === line.ref');
    expect(record).toContain(`<AgentToolCall v-else-if="entry.kind === 'call'" :row="entry.row" />`);
  });

  test("what the turn wrote and then went on working stands among its calls, before the call it led to", () => {
    expect(script).toContain("const said = new Set(progressLines(loadedLines.value).map((line) => line.id));");
    expect(script).toContain("for (const line of loadedLines.value) {");
    expect(script).toContain('else if (said.has(line.id)) push(line.at, { kind: "said", text: line.text });');
    expect(record).toContain("<p v-else-if=\"entry.kind === 'said'\" data-record-said");
    expect(record).toContain("whitespace-normal break-keep wrap-anywhere");
  });

  test("each question of the draft process stands at its own moment, its answer or change whole", () => {
    expect(script).toContain('push(row.at, {');
    expect(script).toContain("draftDiff(before, line.answer)");
    expect(record.indexOf("data-record-draft")).toBeGreaterThan(-1);
    expect(record.indexOf("data-record-draft")).toBeLessThan(record.indexOf("data-draft-end"));
    expect(record).toContain("data-draft-diff");
    expect(record).toContain("data-draft-answer");
  });

  test("the end of the process and each gate's card follow, cards by their own moment", () => {
    expect(script).toContain("const end = endLine(t, rows, recordSplit.value.drafts, props.drafts);");
    expect(script).toContain("push(endRow?.at ?? null, { kind: \"end\", ...end,");
    expect(script).toContain('push(judgement.createdAt, {\n        kind: "judgement",');
    expect(record.indexOf("data-draft-end")).toBeLessThan(record.indexOf("data-record-card"));
  });

  test("what opened a turn stands once, before its first card", () => {
    expect(script).toContain("if (!seen.has(round)) {");
    expect(script).toContain('push(judgement.createdAt, { kind: "opening", opening: judgement.opening });');
    expect(record).toContain(`<TurnOpening v-else-if="entry.kind === 'opening'"`);
  });

  test("the situation note as the round read it stands last", () => {
    expect(script).toContain('tail.push({ kind: "situation", situation: props.roundSituation });');
    expect(record.indexOf("data-situation")).toBeGreaterThan(record.indexOf("data-record-card"));
  });

  test("nothing of it is cut on a line and nothing scrolls in a box of its own", () => {
    expect(record).not.toContain("truncate");
    expect(record).not.toContain("line-clamp");
    expect(record).not.toContain("max-h-");
    expect(record).not.toContain("overflow-y");
  });
});

describe("reading what the record needs", () => {
  test("a finished turn reads the log's lines once, from every run of the round", () => {
    expect(script).toContain("const lines = await Promise.all(at.runs.map((run) => readRunLines(at.agent, run)));");
    expect(script).toContain("loadedLines.value = lines.flat();");
    expect(script).toContain("actions.value = turnActions(loadedLines.value);");
    expect(script).toContain("const needLines = at !== null && loadedLines.value.length === 0;");
  });

  test("the round log's rows are read once, from the room's own route", () => {
    expect(script).toContain("`/api/rooms/${props.chatId}/drafts`, { query: { round } }");
    expect(script).toContain("const needDrafts = drafted.value && round !== null && draftRows.value === null;");
  });

  test("where the round log holds no row, the gate's own rounds stand in their place", () => {
    expect(script).toContain("gateRoundLines(t, recordSplit.value.drafts)");
    expect(record).toContain("entry.line.asked");
    expect(record).toContain("entry.line.decided");
  });
});

describe("the judgement", () => {
  test("is the round's whole record: the gates that read the person's message and the answer's send and checks", () => {
    expect(script).toContain("const recordSplit = computed(() => splitDraftJudgements(props.roundJudgements));");
    expect(script).toContain("const recordCards = computed<Judgement[]>(() => recordSplit.value.verdicts.filter((one) => !decidesMessage(one)));");
    expect(script).toContain("narrowed: narrowedOffer(judgement), kept: keptOffer(judgement), words: verdictWords(t, judgement)");
  });

  test("a person's message keeps its mark alone, which presses nothing and spreads nothing", () => {
    expect(trail).toContain('<HintTip\n          v-if="marked"\n          data-verdict-mark');
    expect(trail).toContain(':name="CHIP_ICONS.verdicts"');
    expect(script).toContain("const verdicts = computed<Judgement[]>(() => (props.answer ? [] :");
    expect(script).toContain("verdictChip(verdictState(verdicts.value, props.judging))");
    expect(template).not.toContain("data-outcome");
    expect(script).not.toContain("expanded");
  });

  test("an answer carries no mark of its own", () => {
    expect(script).toContain("const marked = computed<boolean>(() => !props.answer && (props.judging || verdicts.value.length > 0));");
  });

  test("a thinking message opens its line on its own label, where an answer's chips stand", () => {
    expect(lead.indexOf("data-thinking-label")).toBeGreaterThan(-1);
    expect(lead.indexOf("data-thinking-label")).toBeLessThan(lead.indexOf("data-record-chip"));
    expect(lead).toContain('$t("room.label.thinking_line")');
    expect(script).toContain("props.figuring ||\n    props.thinking ||\n    slots.lead !== undefined\n);");
  });

  test("an answer keeps no room for a mark, so its wait stands by its time", () => {
    expect(script).toContain("const roomForMark = !props.answer && !props.overPicture && !props.besidePicture");
  });
});

describe("the chips that stay their own", () => {
  test("how full the session stood stands first, and the rest in the order their clock decides", () => {
    const order = ["<ContextChip", "data-record-chip", "<TokenChip", "CHIP_ICONS.records", ':icon="briefingLook.icon"'].map((one) => lead.indexOf(one));

    expect(order.every((at) => at > -1)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  test("the wait stands at the trailing end with the time it is measured to, before the verdicts", () => {
    expect(lead).not.toContain('<slot name="took" />');
    expect(trail.indexOf('<slot name="took" />')).toBeGreaterThan(-1);
    expect(trail.indexOf('<slot name="took" />')).toBeLessThan(trail.indexOf("CHIP_ICONS.verdicts"));
  });

  test("the verdicts stand at the trailing end, just before the clock, room kept for the mark", () => {
    expect(trail.indexOf("CHIP_ICONS.verdicts")).toBeGreaterThan(-1);
    expect(trail.indexOf("CHIP_ICONS.verdicts")).toBeLessThan(trail.indexOf('<slot name="clock" />'));
    expect(trail).toContain('v-else-if="roomForMark && props.clock"');
    expect(trail).toContain("invisible h-(--chat-meta-line) w-6");
  });
});

// The line breaks only between its two ends: where they do not fit on one line the trailing end
// takes the line under the chips, and the chips wrap among themselves only where they alone are
// wider than the bubble. On one line the two ends stand on its foot alike.
describe("the line itself", () => {
  test("breaks between its two ends, and the chips wrap among themselves only past the bubble's width", () => {
    const line = row.slice(0, row.indexOf(">"));

    expect(line).toContain("flex min-w-0 flex-wrap items-end");
    expect(line).not.toContain("items-center");
    expect(lead.slice(0, lead.indexOf(">"))).toContain("flex-wrap");
  });

  test("reads the trailing end's width the moment it is put in", () => {
    const watcher = script.slice(script.indexOf("watch(\n  trail,"), script.indexOf("const inline"));

    expect(watcher).toContain("const observer = new ResizeObserver(measure);");
    expect(watcher.indexOf("    measure();")).toBeGreaterThan(watcher.indexOf("new ResizeObserver(measure)"));
    expect(watcher.indexOf("    measure();")).toBeLessThan(watcher.indexOf("observer.observe(element)"));
  });

  test("a mark that came beating has said it came; only one that comes settled pops", () => {
    expect(script).toContain("const markStood = marked.value;");
    expect(script).toContain('!markStood && !beaten.value ? "verdict-pop" : ""');
  });

  test("each chip stands exactly when its own thing is there, and the row when any of them is", () => {
    expect(template).toContain('<div v-if="shown || spreading" :class="frame">');
    expect(script).toContain("const shown = computed<boolean>(() => full.value || marked.value || props.clock);");
    expect(row).toContain('<ContextChip v-if="context !== null" :ratio="context" />');
    expect(script).toContain("props.live === null ? (props.spend?.context ?? null) : null");
    expect(row).toContain('<LineChip v-if="records.length > 0"');
    expect(row).toMatch(/<LineChip\s+v-if="props\.briefing !== null"/);
  });
});

describe("the full reading of the line", () => {
  const spread = template.slice(template.indexOf('<template v-if="briefingOpen'), template.indexOf('<div v-if="recordOpen" data-record'));

  test("is a chip of the row named by where it stands, and spreads the sound's own player from the engine or the old voice message", () => {
    expect(row).toContain(':label="$t(briefingLook.label)"');
    expect(spread).toContain("<AudioPlayer");
    expect(script).toContain('return mediaUrl("audio", props.chatId, held.voiceMessageId);');
    expect(script).toContain("briefingSoundUrl(held.id)");
  });

  test("asks the receiver for a reading where none stands, and follows the engine's stream to it", () => {
    expect(spread).not.toContain("autoplay");
    expect(spread).toContain('@ended.capture="readingEnded"');
    expect(script).toContain("if (!readingTouched && !playing) briefingOpen.value = false;");
    expect(script).toContain("`/api/rooms/${props.chatId}/messages/${props.messageId}/reading`, { method: \"POST\" }");
    expect(script).toContain('event.type !== "voice-briefing" || event.voice.kind !== "full"');
    expect(script).toContain('if (!briefingOpen.value || briefingState.value === "ready" || briefingState.value === "making") return;');
  });

  test("says in the quiet colour that it is being made or was stopped, and in the error colour only once it failed or was refused", () => {
    expect(spread).toContain(`<p v-if="briefingRefused !== ''" role="alert" class="text-sm text-error">`);
    expect(spread).toContain(`<p v-else-if="briefingState === 'failed'" class="text-sm text-error">`);
    expect(spread).toContain(`<p v-else-if="briefingState === 'stopped'" class="text-sm text-dimmed">{{ $t("briefing.status.stopped") }}</p>`);
    expect(spread).toContain(`<p v-else class="text-sm text-dimmed">{{ $t("briefing.status.making") }}</p>`);
  });
});

describe("what the turn wrote down", () => {
  test("is carried on the answer whole and spreads without a read", () => {
    expect(script).toContain("done.value?.records ?? []");
    expect(template).toContain('<TurnRecords v-if="recordsOpen" :records="records"');
  });
});

describe("what the answer spent", () => {
  test("stands on the same row as the other chips and spreads apart from them", () => {
    expect(row).toContain('<TokenChip v-if="chip !== null" :chip="chip" :open="spendOpen" @toggle="spendOpen = !spendOpen" />');
    expect(template).toContain('<AgentTurnFigures v-if="chip !== null && spendOpen" :lines="chip.lines"');
    expect(script).toContain("props.live !== null ? props.live.chip :");
    expect(script).toContain("roundChip(t, props.spend)");
  });
});

describe("what the chips spread", () => {
  const spread = /<div v-if="spreading" data-spread class="([^"]*)"/.exec(template)?.[1]?.split(" ") ?? [];

  test("stands at the bubble's own width, never at its longest word's", () => {
    expect(spread).toContain("basis-full");
    expect(spread).toContain("min-w-0");
  });
});
