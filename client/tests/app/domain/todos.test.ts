import { describe, expect, test } from "bun:test";

import { wording } from "../../../apps/web/shared/wording";

import { setModelRegistrations } from "../../../apps/web/shared/model-short";
import {
  itemModel,
  boardInOrder,
  busyBlocks,
  busyKey,
  canDrag,
  canMove,
  canResolve,
  canStop,
  heldLine,
  mergedLine,
  canTop,
  rowVerbs,
  clampPanelWidth,
  DEFAULT_VIEW,
  doneTail,
  dragBlocked,
  filterCount,
  queueSection,
  canBottom,
  EDGE_BAND_PX,
  EDGE_STEP_PX,
  edgeScrollStep,
  filterLabel,
  isTodoFilter,
  jobGoingOn,
  keptDoneLimit,
  nextDoneLimit,
  PANEL_MAX_WIDTH,
  PANEL_MIN_WIDTH,
  queueOrder,
  reorderedQueue,
  requesterLine,
  searchTally,
  stateColour,
  stateIcon,
  stateLabel,
  stopDetail,
  stoppedLine,
  deployWaitsLine,
  todoSearchFields,
  waitingLine,
  waitingOverdue,
  todoSections,
  todoWaitingSections,
  conditionCount,
  conditionQuery,
  conditionsOf,
  NO_CONDITIONS,
  todoTimeline,
  todoState,
  todoSummary,
  unfinishedLabel,
  unfinishedState,
  approvalChangeIcon,
  approvalChangeLine,
  approvalLabel,
  instructionParts,
  jobRecordLine,
  readableSource,
} from "../../../apps/web/app/domain/todos";
import { DRAG_START_PX, movedEnoughToDrag, rowAtPoint, startsRowDrag } from "../../../apps/web/app/domain/row-drag";
import { todoModelPlan } from "../../../apps/web/app/domain/todo-models";

import type { RoomSummary, TodoBoard, TodoItem, TodoSpan, WaitTarget } from "../../../apps/web/shared/types";
import type { TodoConditions, TodoFilter } from "../../../apps/web/app/domain/todos";

// The owner's own room and a worker, by neutral names.
const OWNER_ID = 1001;
const WORKER = "worker-b";

// The app configuration bmo-ui reads its zone and locales from, as the console sets it, which a test of the
// module alone does not bring with it.
Object.assign(globalThis, { useAppConfig: () => ({ bmoUi: { zone: "Asia/Seoul", locale: "ko-KR", dateLocale: "ko" } }) });

function item(id: number, over: Partial<TodoItem> = {}): TodoItem {
  return {
    id,
    title: `Item ${id}`,
    instruction: `Instruction as said (Owner, ...):\n\`\`\`text\nDo item ${id}\n\`\`\``,
    requester: "Owner",
    requesterId: 42,
    chatId: OWNER_ID,
    approved: true, awaitingApproval: false,
    recommended: false,
    done: false,
    running: false,
    worker: null,
    cowork: false,
    priority: id,
    status: "waiting",
    model: null,
    ranOn: null,
    note: null,
    reports: [],
    unfinished: null,
    unfinishedResolvedAt: null,
    unfinishedResolution: null,
    brief: null,
    heldAt: null,
    heldReason: null,
    heldKind: null,
    mergedInto: null,
    mergedAt: null,
    mergedIntoTitle: null,
    mergedFrom: [],
    attempts: 0,
    progress: null,
    stopped: null,
    holding: null,
    waiting: null,
    deployWaits: false,
    holdPending: false,
    orderActive: false,
    seconds: null,
    spans: [],
    createdAt: 1_756_800_000,
    doneAt: null,
    ...over
  };
}

const CHOICES: TodoBoard["choices"] = { workers: [], chats: [], requesters: [] };
const NO_STANDING: TodoBoard["standing"] = { queue: 0, running: 0, pending: 0, held: 0, merged: 0 };

const board: TodoBoard = {
  queue: [item(1), item(2, { running: true, status: "running (Job #91)" }), item(3)],
  pending: [item(9, { approved: false, awaitingApproval: true, requester: "Heidi", requesterId: 777, chatId: -1002 })],
  held: [], merged: [],
  done: [item(4, { done: true, doneAt: 1_756_900_000, status: "done" })],
  doneTotal: 1,
  standingNotes: [],
  choices: CHOICES,
  standing: { queue: 3, running: 1, pending: 1, held: 0, merged: 0 },
  paused: false, deployHold: null
};

// The moment the tests are read at, and the moment an item that is reporting was marked done, fixed here so a
// state never reads differently by the clock it is tested at.
const NOW = 1_756_900_000;
const REPORTED = NOW - 60;

// The titles of the sections the board above stands in, and the header's count of a queue with the
// requests waiting on him beside it where there are any.
const SECTION_TITLES = [wording("todo.title.section_pending"), wording("todo.title.section_queue"), wording("todo.title.section_done")];

function summary(queue: number, pending = 0): string {
  const parts = [wording("todo.label.summary_queue", { n: String(queue) })];

  return (pending > 0 ? [...parts, wording("todo.label.summary_pending", { n: String(pending) })] : parts).join(" · ");
}

const rooms: RoomSummary[] = [
  { chatId: -1002, title: "Charlie Room", messageCount: 3, lastMessageAt: null, pinned: false }
];

describe("the panel's sections", () => {
  test("what waits on the owner comes first, then the queue, then what was done", () => {
    expect(todoSections(wording, board).map((section) => section.key)).toEqual(["pending", "queue", "done"]);
    expect(todoSections(wording, board).map((section) => section.label)).toEqual(SECTION_TITLES);
    expect(todoSections(wording, board)[1]?.items.map((entry) => entry.id)).toEqual([2, 1, 3]);
  });

  test("the titles stand before the rows do, and only the rows are waited for", () => {
    expect(todoWaitingSections(wording).map((section) => section.label)).toEqual(SECTION_TITLES);
    expect(todoWaitingSections(wording).map((section) => section.rows)).toEqual([1, 3, 3]);
  });

  test("a filter stands the titles it names, and a search reaches what is set aside", () => {
    expect(todoWaitingSections(wording, { ...DEFAULT_VIEW, filter: "pending" }).map((one) => one.key)).toEqual(["pending"]);
    expect(todoWaitingSections(wording, { ...DEFAULT_VIEW, filter: "running" }).map((one) => one.key)).toEqual(["queue"]);
    expect(todoWaitingSections(wording, { ...DEFAULT_VIEW, filter: "all" }, true).map((one) => one.key))
      .toEqual(["pending", "queue", "held", "merged", "done"]);
  });

  test("under a condition nothing can be said about which sections will stand, so none is named", () => {
    const conditioned = todoWaitingSections(wording, { ...DEFAULT_VIEW, conditions: { ...NO_CONDITIONS, worker: WORKER } });

    expect(conditioned.map((one) => one.label)).toEqual([null]);
    expect(conditioned[0]?.rows).toBe(4);
  });

  test("an empty section says so rather than standing blank", () => {
    const sections = todoSections(wording, { queue: [], pending: [], held: [], merged: [],
    done: [], doneTotal: 0, standingNotes: [], choices: CHOICES, standing: NO_STANDING, paused: false, deployHold: null });

    expect(sections.map((section) => section.empty)).toEqual([
      wording("todo.message.section_pending_empty"),
      wording("todo.message.section_queue_empty"),
      wording("todo.message.section_done_empty")
    ]);
  });

  test("the header counts the queue and says how many wait on him", () => {
    expect(todoSummary(wording, board)).toBe(summary(3, 1));
    expect(todoSummary(wording, { ...board, standing: { ...board.standing, pending: 0 } })).toBe(summary(3));
    // A search or a condition narrows the rows and not the count.
    expect(todoSummary(wording, { ...board, queue: [], pending: [] })).toBe(summary(3, 1));
  });
});

describe("what a row shows", () => {
  test("a row that a run has says so, and a step of a work order says how far the order has come", () => {
    expect(stateLabel(wording, item(2, { running: true, attempts: 1 }))).toBe(wording("todo.label.state_running"));
    expect(stateLabel(wording, item(2, { running: true, attempts: 3, progress: "step 2/3" }))).toBe(wording("todo.label.state_running_progress", { progress: "step 2/3" }));
    expect(stateLabel(wording, item(2, { running: true, attempts: 5, progress: "synthesis" }))).toBe(wording("todo.label.state_running_progress", { progress: "synthesis" }));
  });

  test("how many times the item has been run is history, never the progress a running row wears", () => {
    expect(stateLabel(wording, item(2, { running: true, attempts: 3 }))).toBe(wording("todo.label.state_running"));
    expect(stateLabel(wording, item(2, { running: true, attempts: 3, progress: "build 1/4" }))).toBe(wording("todo.label.state_running_progress", { progress: "build 1/4" }));
  });

  test("no row anywhere wears a job number", () => {
    for (const held of [item(1), item(2, { running: true, status: "running (Job #91)", attempts: 2 }), item(4, { done: true })]) {
      expect(stateLabel(wording, held)).not.toContain("Job #");
    }
  });

  test("a waiting request names the room and the person who asked", () => {
    expect(requesterLine(board.pending[0] as TodoItem, rooms)).toBe("Charlie Room · Heidi");
  });

  test("a room the console does not know is named by its number", () => {
    expect(requesterLine(item(9, { chatId: -1, requester: "someone" }), rooms)).toBe("-1 · someone");
  });

  test("an item filed with no room at all is just the requester", () => {
    expect(requesterLine(item(9, { chatId: null }), rooms)).toBe("Owner");
  });

  test("the model is the one the item will go out on, short, and whole for its tooltip", () => {
    // A pinned item names the model it was filed to run on, whatever its worker would do.
    expect(itemModel(item(9, { model: "claude-opus-5-5", worker: "bmo-agent" }))).toBe("CC/CO55");
    expect(itemModel(item(9, { model: "claude-opus-5-5" }), true)).toBe("claude-opus-5-5");
  });

  test("an auto item names the road its worker goes out on, and a running job's own road over it", () => {
    const plan = todoModelPlan();

    plan.value = { workers: { "bmo-agent": "deepseek/deepseek-flash", worker: "registered/qwen3.8-flash-next-iq3_s" }, running: { 9: "claude-code/claude-opus-5-5" } };

    // The worker's own road, the pin it holds or the model its work key maps to.
    expect(itemModel(item(8, { model: null, worker: "bmo-agent" }))).toBe("DS/DSF");
    expect(itemModel(item(8, { model: null, worker: null }))).toBe("QFN38");
    expect(itemModel(item(8, { model: null, worker: null }), true)).toBe("registered/qwen3.8-flash-next-iq3_s");
    // A registered alias is read as the engine its registration names, with no provider.
    setModelRegistrations([{ key: "registered::flash-next-coder", provider: "registered", model: "qwen3.8-flash-next-coder" }]);
    expect(itemModel(item(8, { model: "registered::flash-next-coder" }))).toBe("QFNC38");
    setModelRegistrations([]);
    // A job of the item running names the road that run actually took.
    expect(itemModel(item(9, { model: null, worker: "bmo-agent" }))).toBe("CC/CO55");
    expect(itemModel(item(9, { model: null, worker: "bmo-agent" }), true)).toBe("claude-code/claude-opus-5-5");
    // Nothing known of it at all still names the plan, as the item was filed.
    expect(itemModel(item(7, { model: null, worker: "unheard-of" }))).toBe("auto");

    plan.value = null;
  });
});

describe("moving an item within the queue", () => {
  test("the first cannot go up and the last cannot go down", () => {
    expect(canMove(board.queue, 1, "up")).toBe(false);
    expect(canMove(board.queue, 1, "down")).toBe(true);
    expect(canMove(board.queue, 3, "down")).toBe(false);
    expect(canMove(board.queue, 3, "up")).toBe(true);
  });

  test("an item that is not in the queue moves neither way", () => {
    expect(canMove(board.queue, 9, "up")).toBe(false);
    expect(canMove(board.queue, 9, "down")).toBe(false);
  });
});

describe("where an item stands", () => {
  test("waiting on the owner, waiting in the queue, being done, or done", () => {
    expect(todoState(item(9, { approved: false, awaitingApproval: true }))).toBe("pending");
    // One that opened by itself under an unattended label carries no approval and is past approval all the same.
    expect(todoState(item(10, { approved: false, awaitingApproval: false }))).toBe("waiting");
    expect(todoState(item(11, { approved: false, awaitingApproval: false, running: true }))).toBe("running");
    expect(approvalLabel(wording, item(10, { approved: false, awaitingApproval: false }))).toBe(wording("todo.label.opened_unattended"));
    expect(approvalLabel(wording, item(12, { approved: true, awaitingApproval: false }))).toBe(wording("todo.label.approved"));
    expect(todoState(item(1))).toBe("waiting");
    expect(todoState(item(2, { running: true }))).toBe("running");
    expect(todoState(item(4, { done: true }))).toBe("done");
  });

  test("an item a job is going on for is under way, whatever its status line was left saying", () => {
    expect(todoState(item(2, { running: true, status: "waiting" }))).toBe("running");
    expect(todoState(item(2, { running: true, status: "left" }))).toBe("running");
  });

  test("an item no job is going on for waits, whatever its status line was left saying", () => {
    expect(todoState(item(1, { status: "running (Job #91)" }))).toBe("waiting");
    expect(todoState(item(1, { status: "running" }))).toBe("waiting");
  });

  test("being done and waiting on the owner are decided before any run is asked about", () => {
    expect(todoState(item(4, { done: true, running: true }))).toBe("done");
    expect(todoState(item(9, { approved: false, awaitingApproval: true, running: true }))).toBe("pending");
  });

  test("an item the job service holds is held from its state, with no report beside it", () => {
    expect(todoState(item(6, { status: "held" }))).toBe("held");
    expect(todoState(item(6, { status: "held", holdPending: true }))).toBe("stopping");
  });

  test("an item nobody has taken reads as waiting, whatever word the table happens to hold", () => {
    expect(stateLabel(wording, item(1))).toBe(wording("todo.label.state_waiting"));
    expect(stateLabel(wording, item(1, { status: "left" }))).toBe(wording("todo.label.state_waiting"));
    expect(stateLabel(wording, item(1, { status: "running" }))).toBe(wording("todo.label.state_waiting"));
    expect(stateLabel(wording, item(2, { running: true }))).toBe(wording("todo.label.state_running"));
    expect(stateLabel(wording, item(2, { running: true, status: "waiting" }))).toBe(wording("todo.label.state_running"));
    expect(stateLabel(wording, item(9, { approved: false, awaitingApproval: true }))).toBe(wording("todo.label.state_pending"));
    expect(stateLabel(wording, item(4, { done: true }))).toBe(wording("todo.label.state_done"));
  });
});

describe("an item whose job is still writing its report", () => {
  test("a done item whose agency job is still going is reporting, and wears the reporting word", () => {
    const held = item(5, { done: true, liveState: "running", doneAt: REPORTED, status: "done" });

    expect(todoState(held, NOW)).toBe("reporting");
    expect(stateLabel(wording, held, NOW)).toBe(wording("todo.label.state_reporting"));
  });

  test("the same item is done once the agency says its job ended", () => {
    const held = item(5, { done: true, liveState: null, doneAt: REPORTED, status: "done" });

    expect(todoState(held, NOW)).toBe("done");
    expect(stateLabel(wording, held, NOW)).toBe(wording("todo.label.state_done"));
  });

  test("no clock bounds it: however long ago it was marked done, it reports until its job ends", () => {
    const held = (ago: number): TodoItem => item(5, { done: true, liveState: "running", doneAt: NOW - ago });

    expect(todoState(held(60), NOW)).toBe("reporting");
    expect(todoState(held(24 * 60 * 60), NOW)).toBe("reporting");
    expect(todoState(item(5, { done: true, liveState: "running", doneAt: null }), NOW)).toBe("reporting");
    expect(todoState(item(5, { done: true, liveState: null, doneAt: NOW }), NOW)).toBe("done");
  });

  test("the server's own word that it reports stands as well", () => {
    expect(todoState(item(5, { done: true, reporting: true }), NOW)).toBe("reporting");
  });

  test("the row stays at the head of the queue with the running ones, and not among the finished", () => {
    const reporting = item(5, { done: true, liveState: "running", doneAt: REPORTED, priority: 2, status: "done" });
    const sections = todoSections(wording, { ...board, done: [reporting, ...board.done] }, { ...DEFAULT_VIEW, filter: "all" }, NOW);

    expect(jobGoingOn(todoState(reporting, NOW))).toBe(true);
    expect(sections[1]?.items.map((entry) => entry.id)).toEqual([2, 5, 1, 3]);
    expect(sections[2]?.items.map((entry) => entry.id)).toEqual([4]);
  });

  test("the running tab shows it and its badge counts it, and the waiting tab does neither", () => {
    const reporting = item(5, { done: true, liveState: "running", doneAt: REPORTED, priority: 2, status: "done" });
    const withReporting = { ...board, done: [reporting, ...board.done] };
    const shownUnder = (filter: TodoFilter) =>
      todoSections(wording, withReporting, { ...DEFAULT_VIEW, filter }, NOW).flatMap((section) => section.items.map((entry) => entry.id));

    expect(shownUnder("running")).toEqual([2, 5]);
    expect(shownUnder("waiting")).toEqual([1, 3]);
    expect(filterCount(withReporting, "running", NOW)).toBe(filterCount(board, "running", NOW)! + 1);
    expect(filterCount(withReporting, "waiting", NOW)).toBe(filterCount(board, "waiting", NOW));
  });

  test("the header counts it with the queue it is standing in", () => {
    const reporting = item(5, { done: true, liveState: "running", doneAt: REPORTED, priority: 2 });

    expect(todoSummary(wording, { ...board, done: [reporting, ...board.done] }, NOW)).toBe(summary(4, 1));
    expect(todoSummary(wording, board, NOW)).toBe(summary(3, 1));
  });

  test("the other four states are what they were", () => {
    expect(todoState(item(1), NOW)).toBe("waiting");
    expect(todoState(item(2, { running: true }), NOW)).toBe("running");
    expect(todoState(item(9, { approved: false, awaitingApproval: true, running: true }), NOW)).toBe("pending");
    expect(todoState(item(4, { done: true, doneAt: REPORTED }), NOW)).toBe("done");

    const sections = todoSections(wording, board, { ...DEFAULT_VIEW, filter: "all" }, NOW);

    expect(sections[1]?.items.map((entry) => entry.id)).toEqual([2, 1, 3]);
    expect(sections[2]?.items.map((entry) => entry.id)).toEqual([4]);
  });
});

describe("the colour a row's word wears", () => {
  // The reporting state is built the way the state's own tests build it: marked done with the agency's job for it
  // still going.
  const reporting = item(5, { done: true, liveState: "running", doneAt: REPORTED, status: "done" });

  test("each state wears its own, and done wears the console's word for finished", () => {
    expect(stateColour(item(4, { done: true }), NOW)).toBe("success");
    expect(stateColour(item(2, { running: true }), NOW)).toBe("primary");
    expect(stateColour(item(9, { approved: false, awaitingApproval: true }), NOW)).toBe("warning");
    expect(stateColour(item(1), NOW)).toBe("neutral");
    expect(stateColour(item(7, { heldAt: NOW }), NOW)).toBe("neutral");
  });

  test("a done row whose run is still going wears what a running row wears", () => {
    expect(todoState(reporting, NOW)).toBe("reporting");
    expect(stateColour(reporting, NOW)).toBe(stateColour(item(2, { running: true }), NOW));
  });

  test("done is told apart by its colour from every state standing beside it", () => {
    const done = stateColour(item(4, { done: true }), NOW);

    for (const other of [
      item(2, { running: true }),
      item(7, { heldAt: NOW }),
      item(1),
      item(9, { approved: false, awaitingApproval: true }),
      reporting
    ]) {
      const state = todoState(other, NOW);

      expect({ state, sameAsDone: stateColour(other, NOW) === done }).toEqual({ state, sameAsDone: false });
    }
  });
});

// An item held while its run still goes is on its way to a hold, not there yet: it keeps its place in
// the queue under its own word until the run has ended.
describe("an item held while it still runs", () => {
  const stopping = item(8, { heldAt: NOW, running: true, holdPending: true });

  test("reads as waiting to stop in the warning colour, and as held once nothing of it runs", () => {
    expect(todoState(stopping, NOW)).toBe("stopping");
    expect(stateLabel(wording, stopping, NOW)).toBe(wording("todo.label.held_pending"));
    expect(stateColour(stopping, NOW)).toBe("warning");
    expect(todoState(item(8, { heldAt: NOW }), NOW)).toBe("held");
  });

  // The kinds of setting aside never share a word, and none of them is a bare pause.
  test("says who set it aside: the owner's stop reads as stopping then stopped, a failure hold as held for failures", () => {
    const stopped = item(9, { heldAt: NOW, running: true, holdPending: true, heldKind: "stop", heldReason: "wrong direction" });
    expect(stateLabel(wording, stopped, NOW)).toBe(wording("live.status.stopping"));
    expect(stateColour(stopped, NOW)).toBe("warning");
    expect(stateIcon(stopped, NOW)).toBe("i-material-symbols-back-hand-outline");
    const ended = item(9, { heldAt: NOW, heldKind: "stop", heldReason: "wrong direction" });
    expect(stateLabel(wording, ended, NOW)).toBe(wording("todo.label.held_stop"));
    expect(stateColour(ended, NOW)).toBe("neutral");
    expect(stateLabel(wording, item(10, { heldAt: NOW, heldKind: "failure" }), NOW)).toBe(wording("todo.label.held_failure"));
    expect(stateLabel(wording, item(13, { heldAt: NOW, running: true, holdPending: true, heldKind: "pause" }), NOW)).toBe(wording("todo.label.held_pausing"));
    expect(stateLabel(wording, item(13, { heldAt: NOW, heldKind: "pause" }), NOW)).toBe(wording("todo.label.held_pause"));
    expect(stateLabel(wording, item(11, { heldAt: NOW }), NOW)).toBe(wording("todo.label.held_plain"));
    expect(stateIcon(item(11, { heldAt: NOW }), NOW)).toBe("i-material-symbols-pause-circle-outline");
  });

  test("can be stopped while something of it is in flight, unless it is already his stop", () => {
    expect(canStop(item(12, { running: true }))).toBe(true);
    expect(canStop(item(12, { orderActive: true }))).toBe(true);
    expect(canStop(item(12, { heldAt: NOW, running: true, holdPending: true }))).toBe(true);
    expect(canStop(item(12, {}))).toBe(false);
    expect(canStop(item(12, { running: true, heldAt: NOW, heldKind: "stop" }))).toBe(false);
    expect(canStop(item(12, { running: true, done: true }))).toBe(false);
    expect(heldLine(wording, item(12, { heldAt: NOW, heldKind: "stop", heldReason: "wrong turn" }), () => "yesterday")).toBe(wording("todo.label.held_since_reason", { since: "yesterday", kind: wording("todo.label.held_stop"), reason: "wrong turn" }));
    expect(heldLine(wording, item(12, { heldAt: NOW }), () => "yesterday")).toBe(wording("todo.label.held_since", { since: "yesterday", kind: wording("todo.label.held_plain") }));
    expect(heldLine(wording, item(12, {}), () => "yesterday")).toBeNull();
  });

  test("stands in the queue section, shown by the all and running tabs and hidden by the waiting tab", () => {
    const withStopping: TodoBoard = { ...board, queue: [...board.queue, stopping] };
    const ids = (filter: TodoFilter) =>
      todoSections(wording, withStopping, { ...DEFAULT_VIEW, filter }, NOW).flatMap((section) => section.items.map((one) => one.id));

    expect(ids("all")).toContain(8);
    expect(ids("running")).toContain(8);
    expect(ids("waiting")).not.toContain(8);
  });
});

describe("the conditions beyond the state", () => {
  const worker: TodoConditions = { ...NO_CONDITIONS, worker: "agent-a" };

  test("are counted, and none is what a fresh view carries", () => {
    expect(conditionCount(DEFAULT_VIEW.conditions)).toBe(0);
    expect(conditionCount({ ...worker, unfinished: "open" })).toBe(2);
  });

  test("go to the archive as only the ones that are set", () => {
    expect(conditionQuery(NO_CONDITIONS)).toEqual({});
    expect(conditionQuery({ ...worker, chat: "-1002", cowork: "off" })).toEqual({ worker: "agent-a", chat: "-1002", cowork: "off" });
  });

  test("are read back from a stored view or a query, and nothing else passes for one", () => {
    expect(conditionsOf(undefined)).toEqual(NO_CONDITIONS);
    expect(conditionsOf({ worker: " agent-a ", unfinished: "open", cowork: "on", chat: "-1002", requester: "Owner" })).toEqual({
      worker: "agent-a",
      unfinished: "open",
      cowork: "on",
      chat: "-1002",
      requester: "Owner"
    });
    expect(conditionsOf({ worker: "", unfinished: "maybe", cowork: 1, chat: "room", requester: ["Owner"] })).toEqual(NO_CONDITIONS);
    expect(conditionsOf({ chat: "-" })).toEqual({ ...NO_CONDITIONS, chat: "-" });
  });

  test("leave standing only the sections that hold something", () => {
    const sections = todoSections(wording, { ...board, queue: [] }, { ...DEFAULT_VIEW, conditions: worker }, NOW);

    expect(sections.map((section) => section.key)).toEqual(["pending", "done"]);
    expect(todoSections(wording, { ...board, queue: [] }, DEFAULT_VIEW, NOW).map((section) => section.key)).toEqual(["pending", "queue", "done"]);
  });

  test("take the handles away, since the rows between are hidden", () => {
    const view = { ...DEFAULT_VIEW, conditions: worker };

    expect(dragBlocked(view)).toBe(true);
    expect(canDrag(item(1), view, NOW)).toBe(false);
  });
});

describe("filtering the panel by state", () => {
  test("everything stands when nothing is filtered out", () => {
    expect(todoSections(wording, board, { ...DEFAULT_VIEW, filter: "all" }).map((section) => section.key)).toEqual([
      "pending",
      "queue",
      "done"
    ]);
  });

  test("one state leaves only the sections that can hold it", () => {
    const running = todoSections(wording, board, { ...DEFAULT_VIEW, filter: "running" });

    expect(running.map((section) => section.key)).toEqual(["queue"]);
    expect(running[0]?.items.map((entry) => entry.id)).toEqual([2]);

    const waiting = todoSections(wording, board, { ...DEFAULT_VIEW, filter: "waiting" });

    expect(waiting[0]?.items.map((entry) => entry.id)).toEqual([1, 3]);
    expect(todoSections(wording, board, { ...DEFAULT_VIEW, filter: "pending" }).map((s) => s.key)).toEqual(["pending"]);
    expect(todoSections(wording, board, { ...DEFAULT_VIEW, filter: "done" }).map((s) => s.key)).toEqual(["done"]);
  });

  test("a filter that empties a section leaves the section saying so rather than lying", () => {
    const sections = todoSections(wording, { ...board, queue: [] }, { ...DEFAULT_VIEW, filter: "waiting" });

    expect(sections[0]?.items).toEqual([]);
    expect(sections[0]?.empty).toBe(wording("todo.message.section_queue_empty"));
  });

  test("the filter words are the words the rows wear", () => {
    expect(filterLabel(wording, "all")).toBe(wording("common.label.all"));
    expect(filterLabel(wording, "waiting")).toBe(wording("todo.label.state_waiting"));
    expect(filterLabel(wording, "running")).toBe(wording("todo.label.state_running"));
    expect(isTodoFilter("waiting")).toBe(true);
    expect(isTodoFilter("nonsense")).toBe(false);
  });
});

describe("the order the rows stand in", () => {
  test("queue order is the owner's own, under the row a job is going on for", () => {
    const queue = todoSections(wording, board, { ...DEFAULT_VIEW, filter: "all" })[1];

    expect(queue?.items.map((entry) => entry.id)).toEqual([2, 1, 3]);
  });
});

describe("which button is waiting", () => {
  test("the two arrows of one row are two different buttons", () => {
    expect(busyKey(7, "move", "up")).not.toBe(busyKey(7, "move", "down"));
  });

  test("an arrow and a save on one row are two different buttons", () => {
    expect(busyKey(7, "move", "up")).not.toBe(busyKey(7, "approve"));
  });

  test("the same button on two rows is two different buttons", () => {
    expect(busyKey(7, "approve")).not.toBe(busyKey(8, "approve"));
  });

  test("the same button named twice is the same name, so approve and save-the-note wait as one", () => {
    expect(busyKey(7, "approve")).toBe(busyKey(7, "approve"));
  });
});

describe("what a press holds back while it runs", () => {
  test("drop is not offered while something else on its row runs", () => {
    expect(busyBlocks(new Set([busyKey(7, "approve")]), 7, "drop")).toBe(true);
    expect(busyBlocks(new Set([busyKey(7, "move", "up")]), 7, "drop")).toBe(true);
  });

  test("nothing else on the row is offered while its drop runs", () => {
    expect(busyBlocks(new Set([busyKey(7, "drop")]), 7, "approve")).toBe(true);
    expect(busyBlocks(new Set([busyKey(7, "drop")]), 7, "unapprove")).toBe(true);
  });

  test("two buttons that are not drop run side by side", () => {
    const busy = new Set([busyKey(7, "move", "up"), busyKey(7, "approve")]);

    expect(busyBlocks(busy, 7, "move")).toBe(false);
    expect(busyBlocks(busy, 7, "approve")).toBe(false);
    expect(busyBlocks(busy, 7, "top")).toBe(false);
  });

  test("one row's press holds back nothing of another row", () => {
    expect(busyBlocks(new Set([busyKey(7, "drop")]), 8, "approve")).toBe(false);
    expect(busyBlocks(new Set([busyKey(7, "approve")]), 8, "drop")).toBe(false);
  });

  test("a drop that is running does not hold itself back", () => {
    expect(busyBlocks(new Set([busyKey(7, "drop")]), 7, "drop")).toBe(false);
  });

  test("nothing waiting holds nothing back", () => {
    expect(busyBlocks(new Set(), 7, "drop")).toBe(false);
    expect(busyBlocks(new Set(), 7, "approve")).toBe(false);
  });
});

describe("sending an item to the front", () => {
  test("moves anything but the one already standing there", () => {
    expect(canTop(board.queue, 2)).toBe(true);
    expect(canTop(board.queue, 1)).toBe(false);
    expect(canTop(board.queue, 9)).toBe(false);
  });
});

// A row's own menu offers what the opened row offers for the state it is in, and nothing it does not
// (docs/web.md, the TODO panel's section).
describe("what a row's menu offers", () => {
  const queue = [item(1), item(2), item(3)];

  test("a request waiting on him is approved, set aside, closed or thrown out", () => {
    expect(rowVerbs(item(9, { approved: false, awaitingApproval: true }), queue)).toEqual(["approve", "hold", "done", "append", "drop"]);
  });

  test("an approved row behind another is sent to the front or has its approval taken back, never thrown out", () => {
    expect(rowVerbs(item(2), queue)).toEqual(["hold", "top", "done", "append", "unapprove"]);
    expect(rowVerbs(item(1), queue)).not.toContain("top");
  });

  test("a running row opens its job's log and is not closed from the menu: its job closes it", () => {
    expect(rowVerbs(item(2, { running: true }), queue)).toEqual(["log", "hold", "top", "append", "unapprove"]);
  });

  test("taking an approval back stands last, apart from the job's log that opens the menu", () => {
    const verbs = rowVerbs(item(2, { running: true }), queue);

    expect(verbs.at(0)).toBe("log");
    expect(verbs.at(-1)).toBe("unapprove");
  });

  test("a row set aside is taken back or thrown out, and one he stopped or wound down is not closed", () => {
    const held = { heldAt: 1_756_800_100, heldReason: null };

    expect(rowVerbs(item(2, { ...held, heldKind: null }), queue)).toEqual(["release", "done", "append", "drop"]);
    expect(rowVerbs(item(2, { ...held, heldKind: "stop" }), queue)).not.toContain("done");
    expect(rowVerbs(item(2, { ...held, heldKind: "pause" }), queue)).not.toContain("done");
  });

  test("a finished or merged row offers nothing, so no menu opens over it", () => {
    expect(rowVerbs(item(2, { done: true, doneAt: 1_756_800_100 }), queue)).toEqual([]);
    expect(rowVerbs(item(2, { mergedInto: 1 }), queue)).toEqual([]);
  });
});

describe("an approval in an item's record", () => {
  const given = { id: 1, kind: "approval" as const, caller: "tester", at: NOW };

  test("names its kind and the caller whose token gave it", () => {
    expect(approvalChangeLine(wording, given)).toBe([wording("todo.label.approval_given"), "tester"].join(" · "));
    expect(approvalChangeLine(wording, { ...given, kind: "recommendation", caller: null })).toBe(
      [wording("todo.label.approval_recommended"), wording("todo.label.approval_no_caller")].join(" · ")
    );
  });

  test("wears a mark of its own for a recommendation", () => {
    expect(approvalChangeIcon(given)).not.toBe(approvalChangeIcon({ ...given, kind: "recommendation" }));
  });

  test("an item only recommended still awaits the owner's approval", () => {
    expect(approvalLabel(wording, item(9, { approved: false, awaitingApproval: true, recommended: true }))).toBe(wording("todo.label.recommended_awaiting"));
    expect(approvalLabel(wording, item(9, { approved: true, awaitingApproval: false, recommended: true }))).toBe(wording("todo.label.approved"));
    expect(todoState(item(9, { approved: false, awaitingApproval: true, recommended: true }))).toBe("pending");
  });
});

describe("dragging a row to a place of its own", () => {
  // A queue with no run going on in it, so that what is read here is the drop's own arrangement
  // and nothing else. What the pin does to a drop has a block of its own below.
  const queue = [item(1), item(2), item(3)];

  // The queue section as the panel shows it, with a row that is done and still reporting
  // standing in it where its priority puts it.
  const reporting = item(5, { done: true, liveState: "running", doneAt: REPORTED, priority: 2, status: "done" });
  const shown = todoSections(wording, { ...board, queue, done: [reporting, ...board.done] }, { ...DEFAULT_VIEW, filter: "all" }, NOW);
  const withReporting = shown[1]?.items ?? [];

  test("dragging a row up puts it before the row it was dropped on", () => {
    expect(reorderedQueue(queue, 3, 1)).toEqual([3, 1, 2]);
    expect(reorderedQueue(queue, 3, 2)).toEqual([1, 3, 2]);
  });

  test("dragging a row down puts it after the row it was dropped on", () => {
    expect(reorderedQueue(queue, 1, 3)).toEqual([2, 3, 1]);
    expect(reorderedQueue(queue, 1, 2)).toEqual([2, 1, 3]);
  });

  test("dropping a row on itself changes nothing, and so does dropping on a row that is not there", () => {
    expect(reorderedQueue(queue, 2, 2)).toEqual([1, 2, 3]);
    expect(reorderedQueue(queue, 2, 9)).toEqual([1, 2, 3]);
    expect(reorderedQueue(queue, 9, 2)).toEqual([1, 2, 3]);
  });

  test("what comes back is the queue itself, only differently arranged", () => {
    for (const dragged of [1, 2, 3]) {
      for (const over of [1, 2, 3]) {
        expect([...reorderedQueue(queue, dragged, over)].sort()).toEqual([1, 2, 3]);
      }
    }
  });

  test("a row that is only reporting is no part of the order the bot is asked for", () => {
    expect(withReporting.map((entry) => entry.id)).toEqual([5, 1, 2, 3]);
    expect(reorderedQueue(withReporting, 3, 1, NOW)).toEqual([3, 1, 2]);
    expect(reorderedQueue(withReporting, 1, 5, NOW)).toEqual([1, 2, 3]);
  });

  test("only a row that is waiting carries a handle", () => {
    expect(canDrag(item(1), DEFAULT_VIEW, NOW)).toBe(true);
    expect(canDrag(item(2, { running: true }), DEFAULT_VIEW, NOW)).toBe(false);
    expect(canDrag(reporting, DEFAULT_VIEW, NOW)).toBe(false);
    expect(canDrag(item(4, { done: true, doneAt: REPORTED }), DEFAULT_VIEW, NOW)).toBe(false);
    expect(canDrag(item(9, { approved: false, awaitingApproval: true }), DEFAULT_VIEW, NOW)).toBe(false);
  });

  test("the waiting tab drags like the whole list, and no other tab or search does", () => {
    const waiting = { ...DEFAULT_VIEW, filter: "waiting" } as const;
    const held = { ...DEFAULT_VIEW, filter: "held" } as const;

    expect(dragBlocked(DEFAULT_VIEW)).toBe(false);
    expect(dragBlocked(waiting)).toBe(false);
    expect(canDrag(item(1), waiting, NOW)).toBe(true);
    expect(dragBlocked(held)).toBe(true);
    expect(dragBlocked(DEFAULT_VIEW, true)).toBe(true);
    expect(canDrag(item(1), DEFAULT_VIEW, NOW, true)).toBe(false);
  });

  test("an order dropped under the waiting tab still names the running row it hid", () => {
    const rows = queueSection(board, NOW);

    expect(rows.map((row) => row.id)).toEqual([2, 1, 3]);
    expect(reorderedQueue(rows, 3, 1, NOW)).toEqual([2, 3, 1]);
  });

  test("the rows stand in the saved order at once, numbered from the front", () => {
    const moved = boardInOrder(board, [3, 1, 2]);

    expect(moved.queue.map((entry) => entry.id)).toEqual([3, 1, 2]);
    expect(moved.queue.map((entry) => entry.priority)).toEqual([1, 2, 3]);

    // Nothing outside the queue is touched, and neither is the board that was handed over.
    expect(moved.pending).toEqual(board.pending);
    expect(moved.done).toEqual(board.done);
    expect(board.queue.map((entry) => entry.id)).toEqual([1, 2, 3]);
  });
});

describe("the row a job is going on for standing first", () => {
  // The queue as the archive hands it over: the run is going on for the third of five rows by
  // the owner's own numbering, which is a number the queue came to hold while it ran.
  const running = item(3, { running: true, status: "running (Job #91)" });
  const held: TodoBoard = {
    queue: [item(1), item(2), running, item(4), item(5)],
    pending: [],
    held: [], merged: [],
    done: [],
    doneTotal: 0,
    standingNotes: [],
    choices: CHOICES,
    standing: NO_STANDING,
    paused: false, deployHold: null
  };

  // The queue section as the panel stands it up.
  function shownOf(board: TodoBoard): TodoItem[] {
    return todoSections(wording, board, { ...DEFAULT_VIEW, filter: "all" }, NOW)[1]?.items ?? [];
  }

  test("it stands at the head of the queue, whatever number it holds", () => {
    expect(shownOf(held).map((entry) => entry.id)).toEqual([3, 1, 2, 4, 5]);

    const last = { ...held, queue: [item(1), item(2), item(9, { running: true, priority: 9 })] };

    expect(shownOf(last).map((entry) => entry.id)).toEqual([9, 1, 2]);
  });

  test("the rows under it keep the order the owner gave them", () => {
    expect(shownOf(held).slice(1).map((entry) => entry.id)).toEqual([1, 2, 4, 5]);
    expect(shownOf(held).slice(1).map((entry) => entry.priority)).toEqual([1, 2, 4, 5]);
  });

  test("a row wearing the reporting word stays lifted with the running ones until its job has ended", () => {
    const reporting = item(6, { done: true, liveState: "running", doneAt: REPORTED, priority: 2, status: "done" });

    expect(shownOf({ ...held, done: [reporting] }).map((entry) => entry.id)).toEqual([6, 3, 1, 2, 4, 5]);
    expect(shownOf({ ...held, done: [{ ...reporting, liveState: null }] }).map((entry) => entry.id)).toEqual([3, 1, 2, 4, 5]);
  });

  test("so do the rows winding down on their way to being held", () => {
    const stopping = item(4, { heldAt: NOW, running: true, holdPending: true, heldKind: "pause" });

    expect(todoState(stopping, NOW)).toBe("stopping");
    expect(shownOf({ ...held, queue: [item(1), item(2), running, stopping, item(5)] }).map((entry) => entry.id)).toEqual([3, 4, 1, 2, 5]);
  });

  test("a queue with no run going on in it stands exactly as the archive handed it over", () => {
    const idle = { ...held, queue: [item(1), item(2), item(4)] };

    expect(shownOf(idle).map((entry) => entry.id)).toEqual([1, 2, 4]);
    expect(reorderedQueue(idle.queue, 4, 1, NOW)).toEqual([4, 1, 2]);
    expect(reorderedQueue(idle.queue, 1, 4, NOW)).toEqual([2, 4, 1]);
  });

  test("a row dropped on it lands directly under it", () => {
    const shown = shownOf(held);

    expect(reorderedQueue(shown, 5, 3, NOW)).toEqual([3, 5, 1, 2, 4]);
    expect(reorderedQueue(shown, 4, 3, NOW)).toEqual([3, 4, 1, 2, 5]);
    expect(reorderedQueue(shown, 1, 3, NOW)).toEqual([3, 1, 2, 4, 5]);
  });

  test("nothing at all comes to stand above it, however the drop was aimed", () => {
    const shown = shownOf(held);

    for (const dragged of [1, 2, 4, 5]) {
      for (const over of [1, 2, 3, 4, 5]) {
        const order = reorderedQueue(shown, dragged, over, NOW);

        expect(order[0]).toBe(3);
        expect([...order].sort()).toEqual([1, 2, 3, 4, 5]);
      }
    }
  });

  test("a drop that stays clear of it is the drop it always was", () => {
    const shown = shownOf(held);

    expect(reorderedQueue(shown, 5, 1, NOW)).toEqual([3, 5, 1, 2, 4]);
    expect(reorderedQueue(shown, 1, 4, NOW)).toEqual([3, 2, 4, 1, 5]);
    expect(reorderedQueue(shown, 2, 2, NOW)).toEqual([3, 1, 2, 4, 5]);
  });

  test("what a drop saves is the list the section shows, drop after drop", () => {
    let board = held;

    for (const [dragged, over] of [[5, 3], [1, 4], [2, 5], [4, 3], [1, 2]] as const) {
      const order = reorderedQueue(shownOf(board), dragged, over, NOW);

      board = boardInOrder(board, order);

      expect(queueOrder(shownOf(board), NOW)).toEqual(order);
      expect(board.queue[0]?.id).toBe(3);
      expect(board.queue[0]?.priority).toBe(1);
    }
  });
});

describe("the press that carries a row", () => {
  // Three rows of the same height standing one under the other, with the panel's own gap between
  // them, as the queue's boxes are read off the screen.
  const boxes = [
    { id: 1, top: 100, bottom: 140 },
    { id: 2, top: 144, bottom: 184 },
    { id: 3, top: 188, bottom: 228 }
  ];

  // The scrolling part of the panel those rows stand in.
  const list = { top: 100, bottom: 700 };

  test("a press that never moves far enough is not a drag", () => {
    expect(movedEnoughToDrag({ x: 40, y: 120 }, { x: 40, y: 120 })).toBe(false);
    expect(movedEnoughToDrag({ x: 40, y: 120 }, { x: 43, y: 123 })).toBe(false);
  });

  test("a press that moves past the threshold is one", () => {
    expect(movedEnoughToDrag({ x: 40, y: 120 }, { x: 40, y: 120 + DRAG_START_PX })).toBe(true);
    expect(movedEnoughToDrag({ x: 40, y: 120 }, { x: 40, y: 60 })).toBe(true);
    expect(movedEnoughToDrag({ x: 40, y: 120 }, { x: 12, y: 120 })).toBe(true);
  });

  test("only the main button of the leading pointer starts one", () => {
    expect(startsRowDrag({ button: 0, isPrimary: true })).toBe(true);
    expect(startsRowDrag({ button: 2, isPrimary: true })).toBe(false);
    expect(startsRowDrag({ button: 1, isPrimary: true })).toBe(false);
    expect(startsRowDrag({ button: 0, isPrimary: false })).toBe(false);
  });

  test("a point that falls on no row picks nothing", () => {
    expect(rowAtPoint(boxes, 40)).toBeNull();
    expect(rowAtPoint(boxes, 142)).toBeNull();
    expect(rowAtPoint(boxes, 400)).toBeNull();
    expect(rowAtPoint([], 120)).toBeNull();
  });

  test("a point on a row picks that row", () => {
    expect(rowAtPoint(boxes, 100)).toBe(1);
    expect(rowAtPoint(boxes, 139)).toBe(1);
    expect(rowAtPoint(boxes, 160)).toBe(2);
    expect(rowAtPoint(boxes, 227)).toBe(3);
  });

  test("a row carried through the middle of the list does not move it", () => {
    expect(edgeScrollStep(list, 400)).toBe(0);
    expect(edgeScrollStep(list, 100 + EDGE_BAND_PX)).toBe(0);
    expect(edgeScrollStep(list, 700 - EDGE_BAND_PX)).toBe(0);
  });

  test("a row carried to an edge makes the list creep that way, faster the nearer it is", () => {
    expect(edgeScrollStep(list, 690)).toBeGreaterThan(0);
    expect(edgeScrollStep(list, 699)).toBeGreaterThan(edgeScrollStep(list, 690));
    expect(edgeScrollStep(list, 700)).toBe(EDGE_STEP_PX);
    expect(edgeScrollStep(list, 110)).toBeLessThan(0);
    expect(edgeScrollStep(list, 100)).toBe(-EDGE_STEP_PX);
  });

  test("a row carried off the ends of the list creeps at the full step", () => {
    expect(edgeScrollStep(list, 20)).toBe(-EDGE_STEP_PX);
    expect(edgeScrollStep(list, 900)).toBe(EDGE_STEP_PX);
  });
});

describe("how wide the panel may be dragged", () => {
  test("a width between the bounds is kept as it is", () => {
    expect(clampPanelWidth(400)).toBe(400);
    expect(clampPanelWidth(320.4)).toBe(320);
  });

  test("a width outside them is brought back to the nearest bound", () => {
    expect(clampPanelWidth(10)).toBe(PANEL_MIN_WIDTH);
    expect(clampPanelWidth(4_000)).toBe(PANEL_MAX_WIDTH);
    expect(clampPanelWidth(Number.NaN)).toBeGreaterThanOrEqual(PANEL_MIN_WIDTH);
  });
});

// An outstanding note the work left, and whether it still stands. The unit is the item: such a note
// is prose, so there is nothing inside one a machine could mark, and a note is resolved once every
// part of it is either done since or standing as a TODO row of its own.
describe("whether a finished item's unfinished note still stands", () => {
  const left = "The console side was not touched. Only the script was done.";

  test("an item that left no unfinished note has none to read and none to resolve", () => {
    const row = item(1, { done: true, doneAt: 1_756_800_000 });

    expect(unfinishedState(row)).toBe("none");
    expect(unfinishedLabel(wording, row)).toBeNull();
    expect(canResolve(row)).toBe(false);
  });

  test("an unfinished note nobody has resolved reads as one of the leftovers", () => {
    const row = item(1, { done: true, doneAt: 1_756_800_000, unfinished: left });

    expect(unfinishedState(row)).toBe("open");
    expect(unfinishedLabel(wording, row)).toBe(wording("todo.label.unfinished_open"));
    expect(canResolve(row)).toBe(true);
  });

  test("a resolved unfinished note reads differently and is not resolved a second time", () => {
    const row = item(1, {
      done: true,
      doneAt: 1_756_800_000,
      unfinished: left,
      unfinishedResolvedAt: 1_756_886_400,
      unfinishedResolution: "Raised as #31."
    });

    // The words the job wrote are still on the row; what changed is that they are no longer
    // outstanding.
    expect(row.unfinished).toBe(left);
    expect(unfinishedState(row)).toBe("resolved");
    expect(unfinishedLabel(wording, row)).toBe(wording("todo.label.unfinished_resolved"));
    expect(canResolve(row)).toBe(false);
  });
});

// The finished list only grows, so it comes a page at a time. What the panel asks for next, what
// a re-read must not take back, and what the foot of the list says when there is no more.
describe("reaching further back through the finished", () => {
  test("asks for a page more than it holds, until it holds them all", () => {
    expect(nextDoneLimit(0, 90)).toBe(20);
    expect(nextDoneLimit(20, 90)).toBe(40);
    expect(nextDoneLimit(80, 90)).toBe(90);
  });

  test("asks for nothing once it has them all", () => {
    expect(nextDoneLimit(90, 90)).toBeNull();
    expect(nextDoneLimit(0, 0)).toBeNull();
  });

  test("never asks for more than there are", () => {
    expect(nextDoneLimit(15, 18)).toBe(18);
  });
});

describe("a re-read while he is scrolled down", () => {
  test("asks for the run he is holding, so news does not take his pages back", () => {
    expect(keptDoneLimit(60)).toBe(60);
    expect(keptDoneLimit(41)).toBe(60);
  });

  test("asks for a page where he has scrolled nowhere", () => {
    expect(keptDoneLimit(0)).toBe(20);
    expect(keptDoneLimit(7)).toBe(20);
  });
});

describe("the line under the finished list", () => {
  test("says nothing while there is more to come, since more is on its way", () => {
    expect(doneTail(wording, { shown: 20, total: 90, searching: false })).toBeNull();
  });

  test("says how many there were once the end is reached", () => {
    expect(doneTail(wording, { shown: 90, total: 90, searching: false })).toBe(wording("todo.message.done_all_loaded", { n: "90" }));
  });

  test("counts what was found rather than what there is, while something is being searched for", () => {
    expect(doneTail(wording, { shown: 3, total: 3, searching: true })).toBe(wording("todo.message.done_all_found", { n: "3" }));
  });

  test("says nothing for an empty list: the section already says it is empty", () => {
    expect(doneTail(wording, { shown: 0, total: 0, searching: true })).toBeNull();
    expect(doneTail(wording, { shown: 0, total: 0, searching: false })).toBeNull();
  });
});

describe("what a search found", () => {
  test("counts every list, since a search reaches the whole table and not the finished alone", () => {
    expect(searchTally(wording, { queue: [item(1)], pending: [item(2)], held: [], merged: [],
    done: [item(3)], doneTotal: 12, standingNotes: [], choices: CHOICES, standing: NO_STANDING, paused: false, deployHold: null })).toBe(wording("todo.message.search_found", { n: "14" }));
  });

  test("says so once where nothing anywhere matched", () => {
    expect(searchTally(wording, { queue: [], pending: [], held: [], merged: [],
    done: [], doneTotal: 0, standingNotes: [], choices: CHOICES, standing: NO_STANDING, paused: false, deployHold: null })).toBe(wording("todo.message.search_none"));
  });

  test("counts the ones behind the page rather than the ones on the screen", () => {
    expect(searchTally(wording, { queue: [], pending: [], held: [], merged: [],
    done: [item(3)], doneTotal: 40, standingNotes: [], choices: CHOICES, standing: NO_STANDING, paused: false, deployHold: null })).toBe(wording("todo.message.search_found", { n: "40" }));
  });
});

// Setting an item aside. It is out of the queue and out of the requests waiting on him, and it
// is out of sight everywhere except its own chip — which is the whole of what he asked for.
describe("an item set aside", () => {
  const aside = item(7, { heldAt: 1_756_900_000, heldReason: "not now" });
  const board: TodoBoard = { queue: [item(1)], pending: [item(9, { approved: false, awaitingApproval: true })], held: [aside], merged: [], done: [], doneTotal: 0, standingNotes: [], choices: CHOICES, standing: { queue: 1, running: 0, pending: 1, held: 1, merged: 0 }, paused: false, deployHold: null };

  test("is neither waiting nor waiting on him: it waits on nothing", () => {
    expect(todoState(aside)).toBe("held");
    // Its approval is untouched; being set aside is what it is before anything else.
    expect(todoState(item(7, { approved: false, awaitingApproval: true, heldAt: 1_756_900_000 }))).toBe("held");
  });

  test("does not show under the all tab, which is what setting it aside is for", () => {
    const keys = todoSections(wording, board, { ...DEFAULT_VIEW, filter: "all" }).map((section) => section.key);

    expect(keys).not.toContain("held");
    expect(keys).toContain("queue");
  });

  test("shows under its own chip, so it is one press away rather than lost", () => {
    const sections = todoSections(wording, board, { ...DEFAULT_VIEW, filter: "held" });

    expect(sections.map((section) => section.key)).toEqual(["held"]);
    expect(sections[0]?.items.map((one) => one.id)).toEqual([7]);
  });

  test("shows while something is being searched for: a search that hid it would be lying", () => {
    const keys = todoSections(wording, board, { ...DEFAULT_VIEW, filter: "all" }, undefined, true).map((s) => s.key);

    expect(keys).toContain("held");
  });

  test("is counted in the header even though its rows are not shown", () => {
    expect(todoSummary(wording, board)).toContain(wording("todo.label.summary_held", { n: "1" }));
    expect(todoSummary(wording, { ...board, standing: { ...board.standing, held: 0, merged: 0 } })).not.toContain(wording("todo.label.summary_held", { n: "1" }));
  });

  test("is counted in what a search found, since a search reaches it", () => {
    expect(searchTally(wording, board)).toBe(wording("todo.message.search_found", { n: "3" }));
  });
});

// An item merged into another. Its work is carried by the item it names, so it stands apart from
// the queue and from what is set aside, under a chip of its own, and says where its work went.
describe("an item merged into another", () => {
  const merged = item(8, { mergedInto: 1, mergedAt: 1_756_900_000, mergedIntoTitle: "bundle", approved: true, awaitingApproval: false });
  const board: TodoBoard = {
    queue: [item(1, { mergedFrom: [{ id: 8, title: "original item", done: false }] })],
    pending: [],
    held: [],
    merged: [merged],
    done: [],
    doneTotal: 0,
    standingNotes: [],
    choices: CHOICES,
    standing: { queue: 1, running: 0, pending: 0, held: 0, merged: 1 },
    paused: false, deployHold: null
  };

  test("is merged, whatever its approval or hold says, and names the item carrying it", () => {
    expect(todoState(merged)).toBe("merged");
    expect(todoState({ ...merged, heldAt: 1_756_900_000 })).toBe("merged");
    expect(stateLabel(wording, merged)).toBe(wording("todo.label.merged_into", { id: "1" }));
    expect(stateIcon(merged)).toBe("i-material-symbols-merge");
    expect(stateColour(merged)).toBe("neutral");
  });

  test("once finished with its target it is finished, and still says where its work went", () => {
    const finished = { ...merged, done: true, doneAt: 1_756_950_000 };

    expect(todoState(finished)).toBe("done");
    expect(mergedLine(wording, finished, () => "9/17")).toBe(wording("todo.label.merged_done_since", { since: "9/17", target: "#1 bundle" }));
    expect(mergedLine(wording, merged, () => "9/17")).toBe(wording("todo.label.merged_open_since", { since: "9/17", target: "#1 bundle" }));
    expect(mergedLine(wording, item(3), () => "9/17")).toBeNull();
  });

  test("stays out of the way until its chip or a search asks for it", () => {
    expect(todoSections(wording, board).map((section) => section.key)).not.toContain("merged");
    expect(todoSections(wording, board, { ...DEFAULT_VIEW, filter: "merged" }).map((section) => section.key)).toEqual(["merged"]);
    expect(todoSections(wording, board, DEFAULT_VIEW, undefined, true).map((section) => section.key)).toContain("merged");
    expect(filterLabel(wording, "merged")).toBe(wording("todo.label.state_merged"));
    expect(isTodoFilter("merged")).toBe(true);
  });

  test("is counted apart from what is set aside, in the header and in a search", () => {
    expect(todoSummary(wording, board)).toBe([wording("todo.label.summary_queue", { n: "1" }), wording("todo.label.summary_merged", { n: "1" })].join(" · "));
    expect(searchTally(wording, board)).toBe(wording("todo.message.search_found", { n: "2" }));
  });
});

describe("how long an item's work took, in the block beside its account", () => {
  function span(kind: TodoSpan["kind"], name: string, seconds: number, over: Partial<TodoSpan> = {}): TodoSpan {
    return { kind, name, seconds, times: 1, tokens: null, ...over };
  }

  const phases = [
    span("phase", "agent run", 1969.8),
    span("phase", "wait", 30),
    span("phase", "ready", 0.2),
    span("phase", "finish", 0.1)
  ];

  function timeline(spans: TodoSpan[], over: Partial<TodoItem> = {}) {
    return todoTimeline(wording, item(1, { seconds: 2000, spans, ...over }));
  }

  // The total of the item below, 2000 seconds, as its block says it.
  const total = wording("todo.label.time_total", { time: wording("common.label.minutes_seconds", { m: "33", s: "20" }) });
  const PHASES = wording("todo.title.time_phases");
  const INSIDE = wording("todo.title.time_inside");

  function bar(spans: TodoSpan[], title: string) {
    return timeline(spans)?.bars.find((one) => one.title === title);
  }

  test("is the whole of it, and how many runs went into it once there is more than one", () => {
    expect(timeline([])?.total).toBe(total);
    expect(timeline([])?.attempts).toBeNull();
    expect(timeline([], { attempts: 3 })?.attempts).toBe(wording("todo.label.time_attempts", { n: "3" }));
  });

  test("names the run by who ran it and on which road, never by one program's name", () => {
    const ran = timeline([...phases, span("tool", "Bash", 10)], { worker: "worker-b", model: "auto", ranOn: { provider: "codex", model: "gpt-5.6-sol", changed: false } });
    const runner = wording("todo.label.runner", { worker: "worker-b", road: "codex/gpt-5.6-sol" });

    expect(ran?.bars[0]?.segments.map((one) => one.label)).toContain(wording("todo.label.phase_run_by", { runner }));
    expect(ran?.bars.map((one) => one.title)).toContain(wording("todo.title.time_inside_by", { runner }));

    const based = timeline(phases, { worker: null, ranOn: { provider: "claude-code", model: "claude-opus-5", changed: false } });

    expect(based?.bars[0]?.segments.map((one) => one.label)).toContain(
      wording("todo.label.phase_run_by", { runner: wording("todo.label.runner", { worker: wording("todo.label.base_worker"), road: "claude-code/claude-opus-5" }) })
    );
  });

  test("divides the item's time into the phases, in the order a job passes through them", () => {
    const bySection = bar(phases, PHASES);

    expect(bySection?.segments.map((one) => one.label)).toEqual([wording("todo.label.phase_wait"), wording("todo.label.phase_run")]);
    expect(bySection?.note).toBeNull();
  });

  test("counts a phase too short to read even though it draws none of it", () => {
    const bySection = bar(phases, PHASES);
    const listed = (bySection?.segments ?? []).reduce((sum, one) => sum + one.seconds, 0);

    // The two phases that round to nothing leave the legend and the bar together, and their
    // share stays in the max, so what is drawn is still each phase's share of the item's whole
    // time and the track is left that much short of full.
    expect(bySection?.max).toBeCloseTo(2000.1, 5);
    expect(bySection?.max ?? 0).toBeGreaterThan(listed);
  });

  test("stands no bar at all where there would be nothing in it to draw", () => {
    // Every phase under the length anybody can read, and every inside span answered the instant
    // it was called: two bars' worth of titles over two empty tracks.
    const nothing = [
      span("phase", "wait", 0.1),
      span("phase", "agent run", 0.2),
      span("tool", "Bash", 0)
    ];

    expect(timeline(nothing)?.bars).toEqual([]);
    expect(timeline(nothing)?.total).toBe(total);
  });

  test("gives the same phase the same colour whichever order the spans arrive in", () => {
    const colourOf = (spans: TodoSpan[], label: string) =>
      (bar(spans, PHASES)?.segments ?? []).find((one) => one.label === label)?.color;

    const run = wording("todo.label.phase_run");

    expect(colourOf(phases, run)).toBe(colourOf([...phases].reverse(), run));
    expect(colourOf(phases, run)).not.toBe(colourOf(phases, wording("todo.label.phase_wait")));
  });

  test("has no phase bar at all for an item whose runs left none", () => {
    expect(timeline([span("tool", "Bash", 10)])?.bars.map((one) => one.title)).toEqual([wording("todo.title.time_inside")]);
  });

  test("drops the wait on a Claude Workflow where the branches it waited on are listed", () => {
    const inside = bar(
      [span("tool", "TaskOutput", 1464, { times: 3 }), span("agent", "branch 1 · build · claude-opus-5", 881)],
      INSIDE
    );

    expect(inside?.segments.map((one) => one.label)).toEqual(["build · Opus 5"]);
    expect(inside?.max).toBe(881);
  });

  test("keeps that wait where there is no branch to stand in its place", () => {
    const inside = bar(
      [span("tool", "TaskOutput", 1464, { times: 3 }), span("tool", "Bash", 101, { times: 23 })],
      INSIDE
    );

    expect(inside?.segments.map((one) => one.label)).toEqual([wording("tool.label.task_output"), wording("tool.label.bash")]);
    expect(inside?.segments[0]?.detail).toBe(wording("todo.label.span_times", { n: "3" }));
  });

  test("says beside the inside bar that what ran side by side is counted twice over", () => {
    expect(bar([span("tool", "Bash", 10)], wording("todo.title.time_inside"))?.note).toBe(wording("todo.message.time_inside_note"));
  });

  test("folds the tail into one segment rather than colouring a dozen short spans", () => {
    const many = ["Bash", "Read", "Edit", "Write", "Grep", "Glob", "ToolSearch"].map((name, at) =>
      span("tool", name, 100 - at)
    );
    const inside = bar(many, INSIDE);

    expect(inside?.segments).toHaveLength(6);
    expect(inside?.segments[5]?.label).toBe(wording("todo.label.time_rest", { n: "2" }));
    // The file search's 95 seconds and the tool search's 94 seconds, added into the one segment that stands for them.
    expect(inside?.segments[5]?.seconds).toBe(189);
    expect(inside?.max).toBe(inside?.segments.reduce((sum, one) => sum + one.seconds, 0));
  });

  test("says the tokens where the span states them, which a Claude Workflow branch does", () => {
    const inside = bar([span("agent", "branch 1 · build · claude-opus-5", 881, { tokens: 143_553 })], INSIDE);

    expect(inside?.segments[0]?.detail).toBe(wording("todo.label.span_tokens", { tokens: "144K" }));
  });

  test("is nothing at all for an item no run has finished", () => {
    expect(todoTimeline(wording, item(1))).toBeNull();
  });

  test("is the total and no bar for an item whose runs are older than the keeping of spans", () => {
    expect(timeline([])?.total).toBe(total);
    expect(timeline([])?.bars).toEqual([]);
  });

  test("reads a length of time the way the script's own --show reads it", () => {
    // One item, one figure: an evening-long item that read 184 minutes 3 seconds here and 3 hours 4 minutes there
    // was two answers to the same question.
    expect(todoTimeline(wording, item(1, { seconds: 11_043, spans: [] }))?.total).toBe(wording("todo.label.time_total", { time: wording("common.label.hours_minutes", { h: "3", m: "4" }) }));
  });
});

// The four phases are bmo-job's own words, written into every span it gathers (its docs/jobs.md, "Where a
// job's time went"), and this module stands them in their order and gives each its colour and its word by them.
describe("the phases this bar draws and the phases bmo-job writes", () => {
  const words = ["wait", "ready", "agent run", "finish"];
  const said = ["phase_wait", "phase_ready", "phase_run", "phase_finish"].map((key) => wording(`todo.label.${key}`));

  test("are the same four words, in the order a job passes through them", () => {
    // Handed in the reverse of the order a job goes through them, so what comes back is this
    // module's own ordering and not the order of the list it was given.
    const spans: TodoSpan[] = [...words]
      .reverse()
      .map((name, at) => ({ kind: "phase", name, seconds: 10 + at, times: 1, tokens: null }));
    const bar = todoTimeline(wording, item(1, { seconds: 100, spans }))?.bars.find((one) => one.title === wording("todo.title.time_phases"));

    expect(bar?.segments.map((one) => one.label)).toEqual(said);
    expect(new Set(bar?.segments.map((one) => one.color)).size).toBe(words.length);
  });
});

// The dialog lays an item's instruction out part by part, so what it reads has to be what bmo-job writes (its
// docs/reading.md, "The blocks of an instruction"): labelled blocks, each fenced as `text`.
describe("the parts of an item's instruction", () => {
  const block = (label: string, source: string, text: string, fence = "```") => `${label} (${source}):\n${fence}text\n${text}\n${fence}`;
  const filed = [
    block("What the work is", "written by agent-a as it filed the row", "the work"),
    block("What to do", "written by agent-a as it filed the row", "to do\n```\ncode\n```", "````"),
    "The conversation, word for word:",
    block("Instruction as said", "Owner (42), 2026-09-12T20:45:59.000Z, message 5846", "please do it"),
    block("Reply as said", "agent-a, 2026-09-12T20:46:29.000Z", "filed it"),
    block("Conclusion", "written by agent-a as it filed the row", "the conclusion")
  ].join("\n\n");

  test("come in the one reading order, each under its own name", () => {
    expect(instructionParts(wording, filed).map((part) => (part.kind === "block" ? part.label : part.kind))).toEqual([
      "conversation",
      wording("todo.label.part_what"),
      wording("todo.label.part_conclusion"),
      wording("todo.label.part_to_do")
    ]);
  });

  test("keep a fence inside a part as the part's own words", () => {
    const toDo = instructionParts(wording, filed)[3];

    expect(toDo).toEqual({ kind: "block", label: wording("todo.label.part_to_do"), source: "written by agent-a as it filed the row", text: "to do\n```\ncode\n```" });
  });

  test("read the copied messages as one conversation under the line that heads them", () => {
    const talk = instructionParts(wording, filed)[0];

    expect(talk?.kind).toBe("conversation");
    expect(talk?.kind === "conversation" ? talk.title : null).toBe(wording("todo.title.conversation"));
    expect(talk?.kind === "conversation" ? talk.entries.map((entry) => [entry.text, entry.reply]) : null).toEqual([
      ["please do it", false],
      ["filed it", true]
    ]);
  });

  test("stand a block it does not name under its own label, after the named ones", () => {
    const raised = [block("Source unfinished note", "item #5 earlier work, strand 2", "what was left"), block("What the work is", "agent-a", "the work")].join("\n\n");

    expect(instructionParts(wording, raised).map((part) => (part.kind === "block" ? [part.label, part.source] : part.kind))).toEqual([
      [wording("todo.label.part_what"), "agent-a"],
      ["Source unfinished note", "item #5 earlier work, strand 2"]
    ]);
  });

  test("give the owner's own words a title of their own when nothing answered them", () => {
    const [said] = instructionParts(wording, block("Instruction as said", "Owner (42)", "carry on"));

    expect(said?.kind === "conversation" ? said.title : null).toBe(wording("todo.title.instruction_as_said"));
  });

  test("lose no word of an instruction that is not made of parts", () => {
    expect(instructionParts(wording, "an old instruction\n\na second paragraph")).toEqual([
      { kind: "loose", text: "an old instruction" },
      { kind: "loose", text: "a second paragraph" }
    ]);
  });

  test("draw the UTC stamp of a source line in the console's own time", () => {
    expect(readableSource("Owner (42), 2026-09-12T20:45:59.000Z, message 5846")).toBe("Owner (42), 2026-09-13 05:45:59, message 5846");
  });
});

describe("the head line and the job record of an opened item", () => {
  test("say whether it is approved", () => {
    expect(approvalLabel(wording, item(1))).toBe(wording("todo.label.approved"));
    expect(approvalLabel(wording, item(1, { approved: false, awaitingApproval: true }))).toBe(wording("todo.label.not_approved"));
  });

  test("say which run is going, that none has run, or nothing where the bars speak", () => {
    expect(jobRecordLine(wording, item(1, { running: true, attempts: 2 }))).toBe(wording("todo.status.running_attempt", { n: "2" }));
    expect(jobRecordLine(wording, item(1))).toBe(wording("todo.status.no_job_yet"));
    expect(jobRecordLine(wording, item(1, { attempts: 1, seconds: 90 }))).toBeNull();
  });
});

// A waiting row whose work order stopped (docs/web.md, the TODO panel's queue).
describe("a row whose work order stopped", () => {
  const stop = (place: { turn: "resume" | "passed" | "held"; why: string } | null) => ({ reason: "the run gave no proper answer", place, failures: 2 });

  test("wears the stopped word in the colour that asks to be looked at", () => {
    const stopped = item(4, { stopped: stop(null) });

    expect(stateLabel(wording, stopped)).toBe(wording("todo.label.state_stopped"));
    expect(stateColour(stopped)).toBe("warning");
    // A run going for it again is under way, whatever the order said a moment ago.
    expect(stateLabel(wording, item(4, { stopped: stop(null), running: true }))).toBe(wording("todo.label.state_running"));
  });

  test("says its turn alone on the card, only while it stands at the head of its queue", () => {
    expect(stoppedLine(wording, item(4, { stopped: stop({ turn: "resume", why: "Job #7 of the worker is still open" }) }))).toBe(wording("todo.label.queue_turn_resume"));
    expect(stoppedLine(wording, item(4, { stopped: stop({ turn: "held", why: "held" }) }))).toBe(wording("todo.label.queue_turn_held"));
    expect(stoppedLine(wording, item(4, { stopped: stop(null) }))).toBeNull();
    expect(stoppedLine(wording, item(4))).toBeNull();
  });

  test("stands whole in the item's detail: what stopped it, its turn with why, and the failures", () => {
    expect(stopDetail(wording, item(4, { stopped: stop({ turn: "resume", why: "Job #7 of the worker is still open" }) }))).toEqual({
      reason: "the run gave no proper answer",
      turn: wording("todo.label.queue_turn_resume"),
      why: "Job #7 of the worker is still open",
      failures: 2
    });
    expect(stopDetail(wording, item(4, { stopped: stop(null) }))).toBeNull();
  });

});

// A running row whose job marked a long wait, or that a deployment waits on (docs/web.md, the TODO
// panel's queue).
describe("a running row standing on a wait", () => {
  const now = 1_790_000_000;
  const waiting = (until: number, target: WaitTarget) =>
    item(5, { running: true, waiting: { what: "judgement round", target, until } });

  test("says what it waits on, the target and what is left of the time it gave", () => {
    expect(waitingLine(wording, waiting(now + 25 * 60, { kind: "unit", name: "bmo-judge-1" }), now))
      .toBe(wording("todo.label.waiting_unit", { what: "judgement round", name: "bmo-judge-1", left: wording("common.label.left_minutes", { n: "25" }) }));
    expect(waitingLine(wording, waiting(now + 3 * 3600, { kind: "pid", pid: 4242 }), now))
      .toBe(wording("todo.label.waiting_pid", { what: "judgement round", pid: "4242", left: wording("common.label.left_hours", { n: "3" }) }));
    expect(waitingOverdue(waiting(now + 60, { kind: "pid", pid: 4242 }), now)).toBe(false);
    expect(waitingLine(wording, item(5, { running: true }), now)).toBeNull();
  });

  test("says the time has passed once it has, in the colour that asks to be looked at", () => {
    const late = waiting(now - 60, { kind: "unit", name: "bmo-judge-1" });

    expect(waitingLine(wording, late, now)).toBe(wording("todo.label.waiting_unit", { what: "judgement round", name: "bmo-judge-1", left: wording("todo.label.waiting_overdue") }));
    expect(waitingOverdue(late, now)).toBe(true);
  });

  test("says a deployment waits on it, and both lines are found by a search", () => {
    const held = item(5, { running: true, deployWaits: true, waiting: { what: "judgement round", target: { kind: "unit", name: "bmo-judge-1" }, until: now + 600 } });
    const fields = todoSearchFields(wording, held, [], now);

    expect(deployWaitsLine(wording, held)).toBe(wording("todo.label.deploy_waits"));
    expect(deployWaitsLine(wording, item(5))).toBeNull();
    expect(fields.find((field) => field.text === wording("todo.label.deploy_waits"))?.shown).toBe(true);
    expect(fields.some((field) => field.text === waitingLine(wording, held, now))).toBe(true);
  });
});

describe("the state tabs' badges", () => {
  test("count each open state out of the whole table, and the all and done tabs carry none", () => {
    expect(filterCount(board, "waiting")).toBe(2);
    expect(filterCount(board, "running")).toBe(1);
    expect(filterCount(board, "pending")).toBe(1);
    expect(filterCount(board, "held")).toBe(0);
    expect(filterCount(board, "all")).toBeNull();
    expect(filterCount(board, "done")).toBeNull();
    // A search narrows the rows, never the badges.
    expect(filterCount({ ...board, queue: [], pending: [] }, "waiting")).toBe(2);
  });
});

describe("sending a row to the back", () => {
  test("is offered to every queue row but the last, and to nothing outside the queue", () => {
    expect(canBottom(board.queue, 1)).toBe(true);
    expect(canBottom(board.queue, 3)).toBe(false);
    expect(canBottom(board.queue, 9)).toBe(false);
  });
});
