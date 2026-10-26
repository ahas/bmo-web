import { describe, expect, test } from "bun:test";

// The chip line under a message, read from the file that ships. What makes it open the way it does
// is what a rendered screen would not name: which rule the opening runs, which chip stands where,
// and that nothing but the chips folds.

const source = await Bun.file(new URL("../../../apps/web/app/components/JudgementChips.vue", import.meta.url)).text();
const template = source.slice(0, source.indexOf("<script"));
const script = source.slice(source.indexOf("<script"));

// The line the chips stand on, up to the first thing they spread.
const row = template.slice(template.indexOf("data-meta"), template.indexOf("data-spread"));
const lead = row.slice(row.indexOf("data-meta-lead"), row.indexOf("data-meta-trail"));
const trail = row.slice(row.indexOf("data-meta-trail"));

describe("opening the row", () => {
  test("runs the one rule that says what stands open, rather than a rule of its own", () => {
    expect(script).toContain("openedCards(verdicts.value, expanded.value)");
    expect(script).toContain("splitDraftJudgements(props.judgements)");
  });

  test("is the chips' alone: nothing spread below folds on its own", () => {
    // Every control of this row is one of its chips, and they all stand on the row itself: what
    // they spread below — a stage's card, the figures, what the turn did or wrote down — carries none.
    const controls = [...template.matchAll(/<button|<LineChip|<TokenChip/g)].map((found) => found.index ?? 0);
    const spread = template.indexOf('<template v-if="briefingOpen');

    expect(controls).toHaveLength(7);
    expect(Math.max(...controls)).toBeLessThan(spread);
    expect(template.slice(spread)).not.toContain("<button");
  });
});

describe("the chips of the row", () => {
  test("each is a mark with a figure or nothing, and none carries a word of its own", () => {
    expect(row).toContain(':icon="CHIP_ICONS.brain" :label="$t(CHIP_LABELS.brain)"');
    expect(row).toContain(':icon="CHIP_ICONS.tools" :label="$t(CHIP_LABELS.tools)"');
    expect(row).toContain(':icon="CHIP_ICONS.records" :label="$t(CHIP_LABELS.records)"');
    expect(trail).toContain(':icon="CHIP_ICONS.verdicts"');
    expect(row).not.toContain("room.label.");
  });

  test("the verdicts' chip is its mark alone, saying the whole of them by its colour and name", () => {
    const verdicts = row.slice(row.indexOf("<LineChip\n          v-if=\"marked\""), row.indexOf("<slot name=\"clock\" />"));

    expect(verdicts).toContain(':icon-class="markClass"');
    expect(verdicts).toContain(':label="$t(markLook.label)"');
    expect(verdicts).not.toContain("v-for");
    expect(verdicts).not.toContain("countText");
    expect(script).toContain("verdictChip(verdictState(verdicts.value, props.judging))");
  });

  test("stand how full the session stood first, then in the order their own clock decides", () => {
    // How full the session stood stands first, where it was placed. After it, the documents and the
    // figure stand from the turn's first second, a call joins them when it is made, and what the
    // turn wrote down arrives with the answer. A chip that arrives late standing first would push
    // every chip beside it sideways the moment it landed. The briefing that speaks the answer comes
    // after the answer has gone out, so it stands last.
    const order = ["<ContextChip", "CHIP_ICONS.brain", "<TokenChip", "CHIP_ICONS.tools", "CHIP_ICONS.records", "CHIP_ICONS.drafts", ':icon="briefingLook.icon"'].map((one) =>
      lead.indexOf(one)
    );

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
    // The kept room is the chip's own width: its two sides and its 16px mark.
    expect(trail).toContain("invisible h-(--chat-meta-line) w-6");
  });

  // The line breaks only between its two ends: where they do not fit on one line the trailing end
  // takes the line under the chips, and the chips wrap among themselves only where they alone are
  // wider than the bubble. On one line the two ends stand on its foot alike.
  test("the line breaks between its two ends, and the chips wrap among themselves only past the bubble's width", () => {
    const line = row.slice(0, row.indexOf(">"));

    expect(line).toContain("flex min-w-0 flex-wrap items-end");
    expect(line).not.toContain("items-center");
    expect(lead.slice(0, lead.indexOf(">"))).toContain("flex-wrap");
  });

  // A sent bubble's flight copies the bubble in the update that puts it in, before any observer has
  // reported: the trailing end's width is read then too, so the line already stands at the end of the
  // words in the copy, and only a later change of its width waits for the observer.
  test("the trailing end's width is read the moment it is put in, not first when the observer reports", () => {
    const watcher = script.slice(script.indexOf("watch(\n  trail,"), script.indexOf("const inline"));

    expect(watcher).toContain("const observer = new ResizeObserver(measure);");
    expect(watcher.indexOf("    measure();")).toBeGreaterThan(watcher.indexOf("new ResizeObserver(measure)"));
    expect(watcher.indexOf("    measure();")).toBeLessThan(watcher.indexOf("observer.observe(element)"));
  });

  // A mark that came beating has said it came; only one that comes with its verdicts settled pops.
  test("the mark pops only where it comes settled, never where it stood or came beating", () => {
    expect(script).toContain("const markStood = marked.value;");
    expect(script).toContain("!markStood && !beaten.value ? \"verdict-pop\" : \"\"");
  });

  test("each stands exactly when its own thing is there, and the row when any of them is", () => {
    expect(template).toContain('<div v-if="shown || spreading" :class="frame">');
    expect(script).toContain("const shown = computed<boolean>(() => full.value || marked.value || props.clock);");
    expect(script).toContain("const marked = computed<boolean>(() => props.judging || verdicts.value.length > 0);");
    // How full the session stood stands only once the turn has ended and its round reported it.
    expect(row).toContain('<ContextChip v-if="context !== null" :ratio="context" />');
    expect(script).toContain("props.live === null ? (props.spend?.context ?? null) : null");
    // A turn whose every document was already held still stands its chip, at nought, to open the list.
    expect(row).toContain('<LineChip v-if="counts.documents + counts.held + counts.brain > 0"');
    expect(row).toContain('<LineChip v-if="counts.tools > 0"');
    expect(row).toContain('<LineChip v-if="records.length > 0"');
    expect(row).toContain('<LineChip v-if="drafted"');
    expect(trail).toMatch(/<LineChip\s+v-if="marked"/);
    expect(row).toMatch(/<LineChip\s+v-if="props\.briefing !== null"/);
  });
});

describe("the full reading of the line", () => {
  const spread = template.slice(template.indexOf('<template v-if="briefingOpen'), template.indexOf('<template v-for="kind in ACTION_KINDS"'));

  test("is a chip of the row named by where it stands, and spreads the sound's own player from the engine or the old voice message", () => {
    expect(row).toContain(':label="$t(briefingLook.label)"');
    expect(spread).toContain("<AudioPlayer");
    expect(script).toContain('return mediaUrl("audio", props.chatId, held.voiceMessageId);');
    expect(script).toContain("briefingSoundUrl(held.id)");
  });

  test("asks the receiver for a reading where none stands, and follows the engine's stream to it", () => {
    expect(spread).toMatch(/<AudioPlayer[^>]*\n\s*autoplay\n/);
    expect(script).toContain("`/api/rooms/${props.chatId}/messages/${props.messageId}/reading`, { method: \"POST\" }");
    expect(script).toContain('event.type !== "voice-briefing" || event.voice.kind !== "full"');
  });

  test("says in the quiet colour that it is being made, and in the error colour only once it failed or was refused", () => {
    expect(spread).toContain(`<p v-if="briefingRefused !== ''" role="alert" class="text-sm text-error">`);
    expect(spread).toContain(`<p v-else-if="briefingState === 'failed'" class="text-sm text-error">`);
    expect(spread).toContain(`<p v-else class="text-sm text-dimmed">{{ $t("briefing.status.making") }}</p>`);
  });
});

describe("what the turn read and called", () => {
  test("are two chips and two lists, one of each sort of action", () => {
    expect(script).toContain('const ACTION_KINDS: readonly ActionKind[] = ["context", "tool"];');
    expect(row).toContain("@toggle=\"openActions('context')\"");
    expect(row).toContain("@toggle=\"openActions('tool')\"");
    expect(script).toContain("return listOf(kind, actions.value);");
  });

  test("a running turn counts each sort whole, what fell off the front of its block included", () => {
    expect(script).toContain('const held = handed.filter((action) => action.state === "held").length;');
    expect(script).toContain("const documents = handed.length - held + live.droppedContext;");
    expect(script).toContain("tools: live.actions.length + live.dropped - handed.length - live.droppedContext");
    expect(template).toContain(':actions="liveOf(kind)" :dropped="liveDropped(kind)"');
  });

  test("a document the session already held is listed but not counted as read", () => {
    expect(script).toContain("held: named ? held : (done.value?.held ?? 0)");
    expect(script).toContain("counts.value.documents + counts.value.held + counts.value.brain;");
  });

  test("what the round's end names as read stands in place of the log's documents, and is counted but for the held", () => {
    expect(script).toContain('const reads = computed<DraftRead[]>(() => (props.live === null ? (props.drafts?.reads ?? []) : []));');
    expect(script).toContain("documents: named ? reads.value.length - held : (done.value?.documents ?? 0)");
    expect(script).toContain('return reads.value.length > 0 ? brain.filter((action) => action.kind === "tool") : brain;');
    expect(template).toContain(`<BrainReads v-if="kind === 'context' && reads.length > 0" :reads="reads"`);
  });

  test("a finished turn reads its lines out of the log once, when a list is first opened", () => {
    expect(script).toContain("at.runs.map((run) => readRunLines(at.agent, run))");
    expect(script).toContain("loadedLines.value = lines.flat();");
    expect(script).toContain("actions.value = turnActions(loadedLines.value);");
    expect(script).toContain("if (!next || at === null || actions.value.length > 0 || loadingActions.value || !logListed(kind))");
    expect(template).toContain('v-if="restOf(kind) > 0"');
  });

  test("each spread on its own row alone, a running turn's starting where the browser last left that sort", () => {
    // A press sets the one list it was made on, on this row; what the browser keeps only says where
    // a running turn's list starts, and an answer's never reads it.
    expect(script).toContain("const pressed = reactive<Record<ActionKind, boolean | null>>({ context: null, tool: null });");
    expect(script).toContain("return pressed[kind] ?? (props.live !== null && !folded.value[kind]);");

    const opening = script.slice(script.indexOf("async function openActions"), script.indexOf("const chip = computed"));

    expect(opening).toContain("pressed[kind] = next;");
    expect(opening).toContain("setFolded(kind, !next);");
    expect(opening.match(/setFolded\(/g)).toHaveLength(1);
    expect(opening).not.toMatch(/pressed\[(?!kind\])/);
    expect(script).not.toContain("folded.value =");
  });
});

describe("what the turn wrote down", () => {
  test("is carried on the answer whole and spreads without a read", () => {
    expect(script).toContain("done.value?.records ?? []");
    expect(template).toContain('<TurnRecords v-if="recordsOpen" :records="records"');
  });
});

describe("what opened the turn", () => {
  const cards = template.slice(template.indexOf('<template v-for="turn in turns"'));

  test("stands once above each turn's cards, whichever gates the turn ran", () => {
    expect(script).toContain("openedTurns(opened.value)");
    expect(cards.indexOf("<TurnOpening")).toBeGreaterThan(-1);
    expect(cards.indexOf("<TurnOpening")).toBeLessThan(cards.indexOf('v-for="{ judgement, narrowed, kept } in turn.cards"'));
    expect(cards).toContain('v-if="turn.opening !== null && turn.opening.instructions.length > 0"');
  });

  test("a gate asked about none says what it narrowed from and left, and the item rule where it kept by that alone", () => {
    expect(script).toContain("narrowed: narrowedOffer(judgement)");
    expect(cards).toContain('<p v-if="narrowed.itemRule"');
    expect(cards).toContain('room.label.offer_counts", { held: countText(narrowed.held), left: countText(narrowed.left) }');
  });

  test("a gate's card says what each of its rules kept, wherever its round's record holds a row for the gate", () => {
    expect(script).toContain("kept: keptOffer(judgement)");
    expect(cards).toContain('<p v-if="kept !== null" data-kept');
    expect(cards).toContain('room.label.offer_kept", { item: countText(kept.item), keyword: countText(kept.keyword), word: countText(kept.word), person: countText(kept.person), recent: countText(kept.recent) }');
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
  // The spread is an item of the bubble's wrapping row, and the bubble cuts what it holds at its own
  // edge. Without its least width given up, the longest unbroken word in a card or an instruction's
  // text sets that width, the spread stands wider than the bubble and its trailing side is cut.
  const spread = /<div v-if="spreading" data-spread class="([^"]*)"/.exec(template)?.[1]?.split(" ") ?? [];

  test("stands at the bubble's own width, never at its longest word's", () => {
    expect(spread).toContain("basis-full");
    expect(spread).toContain("min-w-0");
  });
});

// How the round's draft process made the answer (docs/web.md, the room screen's draft chip): a count on the answer's
// last message, the summary and the round log's rows spread under it, read once from the room's own route.
const draftRows = await Bun.file(new URL("../../../apps/web/app/components/DraftRows.vue", import.meta.url)).text();
const rowsTemplate = draftRows.slice(0, draftRows.indexOf("<script"));

describe("the draft chip", () => {

  test("stands on a turn that has ended, where the page read the round's process or the gate wrote of it", () => {
    expect(script).toContain("props.live === null && roundOfDrafts.value !== null && (props.drafts !== null || split.value.drafts.length > 0)");
    expect(row).toContain('<LineChip v-if="drafted" :icon="CHIP_ICONS.drafts" :label="$t(CHIP_LABELS.drafts)" :open="draftsOpen" @toggle="openDrafts">');
    expect(row).toContain('<RollingNumber :value="draftCount" />');
  });

  test("reads the round's rows the first time it opens and never again once they are in", () => {
    expect(script).toContain("`/api/rooms/${props.chatId}/drafts`, { query: { round } }");
    expect(script).toContain("if (!draftsOpen.value || round === null || draftRows.value !== null || loadingDrafts.value) return;");
    expect(template).toContain('<DraftRows v-if="draftsOpen && drafted" :summary="draftLines" :rows="draftRows" :loading="loadingDrafts" :failure="draftsFailure" />');
  });

  test("spreads the summary, then each row's number, question, kind, outcome, length, change and time, and a question's answer whole", () => {
    expect(rowsTemplate.indexOf("data-draft-summary")).toBeLessThan(rowsTemplate.indexOf("data-draft-rows"));

    for (const fact of ["countText(row.number)", "row.question", "draftKindText($t, row.kind)", "draftOutcomeText($t, row.outcome, row.kind)", "room.label.draft_chars", "room.label.draft_changed", "countText(row.ms)"]) {
      expect({ fact, stood: rowsTemplate.includes(fact) }).toEqual({ fact, stood: true });
    }
    expect(rowsTemplate).toMatch(/<div v-if="draftAnswerShown\(row\)" data-draft-answer[^>]*>\s*<p[^>]*>\{\{ \$t\("room\.label\.draft_answer"\) \}\}<\/p>\s*<pre[^>]*whitespace-pre-wrap wrap-anywhere[^>]*>\{\{ row\.answer \}\}<\/pre>/);
    // No answer and no row's text is folded.
    expect(rowsTemplate).not.toContain("UChatTool");
    expect(rowsTemplate).not.toContain("UCollapsible");
  });
});

// An ended turn's calls stand as the agent's own log draws a tool call (docs/web.md, the room screen's tool chip):
// the command under its prompt and its result under it, whatever program the turn ran on.
describe("the tool chip of an ended turn", () => {
  test("draws each call as the log's tool call, its results by the call's reference", async () => {
    const source = await Bun.file(new URL("../../../apps/web/app/components/JudgementChips.vue", import.meta.url)).text();

    expect(source).toContain('<AgentToolCall v-for="row in callRows" :key="row.key" :row="row" />');
    expect(source).toContain('one.kind === "tool-result" && one.ref !== null && one.ref === line.ref');
  });
});
