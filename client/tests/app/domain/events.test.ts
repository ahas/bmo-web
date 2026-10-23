import { describe, expect, spyOn, test } from "bun:test";
import { computed, createRenderer, defineComponent, nextTick, onMounted, onScopeDispose, readonly, ref, shallowRef, watch } from "vue";

import { ANSWER_WAIT_MS, companionOf, retryDelay, runKey, shouldRefresh, TURN_ENDED, useBotEvents, useRoomRun } from "../../../apps/web/app/domain/events";
import { listeningRuns } from "../../../apps/web/app/domain/room-window";

import type { BotEvent, BotEventType, ChatTurn, LiveSnapshot, RunProgress, TurnSpeaker } from "../../../apps/web/shared/types";
import type { BotStream, RefreshCause, RefreshQuestion, RoomOutcome, RoomRun, RunState } from "../../../apps/web/app/domain/events";
import KO from "../../fixtures/app/domain/events.test.ko.json";

const watched: readonly BotEventType[] = ["sent", "todo"];
const eventsSource = await Bun.file(new URL("../../../apps/web/app/domain/events.ts", import.meta.url)).text();

function question(cause: RefreshCause, over: Partial<RefreshQuestion> = {}): RefreshQuestion {
  return { cause, type: null, on: watched, connected: true, busy: false, ...over };
}

describe("what the news makes a screen do", () => {
  test("an event the screen reads back on is read back on", () => {
    expect(shouldRefresh(question("event", { type: "sent" }))).toBe(true);
    expect(shouldRefresh(question("event", { type: "todo" }))).toBe(true);
  });

  test("news about something else is not this screen's", () => {
    expect(shouldRefresh(question("event", { type: "run-progress" }))).toBe(false);
    expect(shouldRefresh(question("event", { type: "judgement" }))).toBe(false);
  });

  test("a screen that reads back on nothing reads on no event", () => {
    expect(shouldRefresh(question("event", { type: "sent", on: [] }))).toBe(false);
  });
});

describe("the stream coming back", () => {
  test("everything is read back once, since the gap announced nothing", () => {
    expect(shouldRefresh(question("reopen", { connected: true }))).toBe(true);
  });

  test("it is read back whether or not the open has been counted yet", () => {
    expect(shouldRefresh(question("reopen", { connected: false }))).toBe(true);
  });
});

describe("the screen's own clock", () => {
  test("it reads while the stream is down", () => {
    expect(shouldRefresh(question("clock", { connected: false }))).toBe(true);
  });

  test("it reads nothing while the stream is carrying the news", () => {
    expect(shouldRefresh(question("clock", { connected: true }))).toBe(false);
  });

  test("is not installed for an SSE-only screen", () => {
    expect(eventsSource).toContain("options.everyMs === undefined");
    expect(eventsSource).toContain("? null");
  });
});

describe("a screen with something in hand", () => {
  test("nothing is written over it, whatever asks", () => {
    for (const cause of ["event", "reopen", "clock"] as const) {
      expect(shouldRefresh(question(cause, { type: "sent", connected: false, busy: true }))).toBe(false);
    }
  });
});

describe("what ends a turn", () => {
  test("the endings are the whole of it, a stop among them", () => {
    expect([...TURN_ENDED].sort()).toEqual(["run-failed", "run-stopped", "sent", "skipped", "waited"]);
  });

  test("a downgraded model is not an ending: the run goes on to answer", () => {
    expect(TURN_ENDED).not.toContain("downgraded");
  });
});

describe("news that belongs to another screen", () => {
  test("a room speaking moves that room's archive and no screen watching turns", () => {
    expect(TURN_ENDED).not.toContain("message");
    expect(shouldRefresh(question("event", { type: "message", on: TURN_ENDED }))).toBe(false);
  });

  test("a room's own screen takes it, since nothing else tells that room a message landed", () => {
    expect(shouldRefresh(question("event", { type: "message", on: ["message"] }))).toBe(true);
  });
});

// What one room's screen shows while the chat agent is answering it. The composable that holds it is Nuxt's
// code — it makes refs, it hangs itself on a component's mount, and it opens the bot's stream —
// and none of those three is here: no Nuxt to auto-import from, no browser to mount into, no bot
// to stream from. So each is stood up: Vue's own reactivity under the names Nuxt would have
// given it, a renderer that draws to nothing, and a stream whose frames this file writes.
Object.assign(globalThis, {
  computed,
  onMounted,
  onScopeDispose,
  readonly,
  ref,
  shallowRef,
  watch,
  useRuntimeConfig: () => ({ app: { baseURL: "" } })
});

// The bot's stream as the control API writes it: the numbered events under one name, and the
// picture the stream opens with under another.
class FakeStream {
  static opened: FakeStream | null = null;

  private readonly handlers = new Map<string, (message: { data: string }) => void>();

  constructor(public readonly url: string) {
    FakeStream.opened = this;
  }

  addEventListener(name: string, handler: (message: { data: string }) => void): void {
    this.handlers.set(name, handler);
  }

  close(): void {
    // Nothing is held open, so there is nothing to let go of.
  }

  write(name: string, data: unknown): void {
    this.handlers.get(name)?.({ data: JSON.stringify(data) });
  }
}

Object.assign(globalThis, { EventSource: FakeStream });

const nothing = {} as never;
const { createApp } = createRenderer<object, object>({
  insert: () => undefined,
  remove: () => undefined,
  patchProp: () => undefined,
  createElement: () => nothing,
  createText: () => nothing,
  createComment: () => nothing,
  setText: () => undefined,
  setElementText: () => undefined,
  parentNode: () => null,
  nextSibling: () => null
});

// The bot's ids count one run of it and only ever go up; the screen throws away anything it has
// already seen, so a test's events carry on from where the last test's left off.
let lastEventId = 0;

function botEvent(over: Partial<BotEvent> & { type: BotEventType }): BotEvent {
  lastEventId += 1;

  if (over.type === "work-order" || over.type === "todo-talk") {
    throw new Error("Room event fixtures do not construct an item's events");
  }

  return { id: lastEventId, at: 1_788_490_000, chatId: -1003, messageId: null, ...over } as BotEvent;
}

function chatTurn(over: Partial<ChatTurn> = {}): ChatTurn {
  return { chatId: -1003, since: 1_788_489_900, messages: 2, instructions: 0, ...over };
}

function picture(turns: ChatTurn[]): LiveSnapshot {
  return { at: 1_788_490_000, runs: [], compacting: [], turns };
}

interface Screen {
  // The one block of a room only the chat agent answers in these tests.
  run: () => RunState | null;
  runs: () => RunState[];
  outcome: () => RoomOutcome | null;
  settled: () => number;
  // One frame of the stream, by the name the control API wrote it under.
  write: (name: string, data: unknown) => void;
  // The read a screen answers an ending with, which stands out until this is called. It is the
  // room's own read of the archive, and what the screen shows while it is out is the whole of
  // what an ending has to get right.
  finishRead: () => Promise<void>;
}

// A screen watching one room, mounted and taken down again the way a page is. It is taken down
// however the body ends: the stream is opened for the first screen that asks and closed when the
// last of them goes, so a screen left standing would take the next test's stream away.
function watching(chatId: number, body: (screen: Screen) => void | Promise<void>, answered?: (run: RunState) => boolean): void | Promise<void> {
  let held: RoomRun | null = null;
  let settled = 0;
  let finish: (() => void) | null = null;
  const app = createApp(
    defineComponent({
      setup() {
        held = useRoomRun(chatId, {
          onJudgement: () => undefined,
          onSettled: () => {
            settled += 1;

            return new Promise<void>((resolve) => {
              finish = resolve;
            });
          },
          ...(answered === undefined ? {} : { answered })
        });

        return () => null;
      }
    })
  );

  app.mount({});

  const stream = FakeStream.opened;

  if (held === null || stream === null) {
    throw new Error("the screen opened no stream");
  }

  const view = held as RoomRun;

  const screen: Screen = {
    run: () => view.runs.value.at(-1) ?? null,
    runs: () => view.runs.value,
    outcome: () => view.outcome.value,
    settled: () => settled,
    write: (name, data) => stream.write(name, data),
    finishRead: async () => {
      finish?.();
      finish = null;

      // Two turns of the microtask queue: one for the read itself, one for what was waiting on it.
      await Promise.resolve();
      await Promise.resolve();
    }
  };

  let done: void | Promise<void>;

  try {
    done = body(screen);
  } catch (error) {
    app.unmount();

    throw error;
  }

  if (done instanceof Promise) {
    return done.finally(() => app.unmount());
  }

  app.unmount();
}

describe("the block a room shows while the chat agent is answering it", () => {
  test("a screen arriving in the middle of a turn reads it off the picture alone", () => {
    watching(-1003, (screen) => {
      expect(screen.run()).toBeNull();

      screen.write("live", picture([chatTurn({ messages: 2, instructions: 1 })]));

      const run = screen.run();

      // No event began this turn as far as this screen is concerned: it was not there for it, so
      // the block stands from where the turn itself began.
      expect(run?.startedAt).toBe(1_788_489_900);
      expect(run?.received).toEqual({ messages: 2, instructions: 1 });
      expect(run?.progress).toBeNull();
    });
  });

  test("the picture reaches the screen the same whether it opened the stream or the bot sent it", () => {
    watching(-1003, (screen) => {
      screen.write("bot", botEvent({ type: "live", chatId: 0, live: picture([chatTurn({ messages: 3 })]) }));

      expect(screen.run()?.received).toEqual({ messages: 3, instructions: 0 });
    });
  });

  test("another room's turn is not this room's block", () => {
    watching(-1003, (screen) => {
      screen.write("live", picture([chatTurn({ chatId: -1009 })]));

      expect(screen.run()).toBeNull();
    });
  });

  test("the event that follows the picture fills that same block rather than opening a second", () => {
    watching(-1003, (screen) => {
      screen.write("live", picture([chatTurn({ messages: 2, instructions: 1 })]));
      screen.write("bot", botEvent({ type: "run-started", messageId: 41 }));

      const run = screen.run();

      // One block: the event fills the block the picture opened, and what the picture said the
      // turn was handed is still there, the event having said nothing of it.
      expect(run?.messageId).toBe(41);
      expect(run?.received).toEqual({ messages: 2, instructions: 1 });
    });
  });

  // The message a turn reads last is the one the verdict mark beats for (docs/web.md, the room screen's judgements). A
  // screen that missed the turn's start has it from the picture, and a message pushed into the round
  // moves it on with no event of its own; a picture from a bot that names none leaves it as it was.
  test("the message the turn reads last is the picture's, and a push moves it on", () => {
    watching(-1003, (screen) => {
      screen.write("live", picture([chatTurn({ messageId: 41 })]));

      expect(screen.run()?.messageId).toBe(41);

      screen.write("live", picture([chatTurn({ messages: 3, messageId: 42 })]));

      expect(screen.run()?.messageId).toBe(42);

      screen.write("live", picture([chatTurn({ messages: 3 })]));

      expect(screen.run()?.messageId).toBe(42);
    });
  });

  // A companion's turn names who answers (the agency's docs/companions.md), and its block wears that name rather
  // than the chat agent's; the chat agent's own turn names nobody. In a room both answer, each turn is a block of its own.
  test("a companion's turn and the chat agent's stand as two blocks, and each ending closes its own", async () => {
    const companion = { id: 1_000_000_007, name: KO.line_316 };

    await watching(-1003, async (screen) => {
      screen.write("bot", botEvent({ type: "run-started", messageId: 41, speaker: companion }));
      screen.write("bot", botEvent({ type: "run-started", messageId: 42 }));

      expect(screen.runs().map((run) => [run.messageId, run.speaker])).toEqual([[41, companion], [42, undefined]]);

      screen.write("bot", botEvent({ type: "sent", messageId: 43, speaker: companion }));
      await screen.finishRead();

      expect(screen.runs().map((run) => run.messageId)).toEqual([42]);
    });
  });

  test("a screen arriving in the middle of a companion's turn reads it off the picture beside the chat agent's", () => {
    const companion = { id: 1_000_000_007, name: KO.line_332 };

    watching(-1003, (screen) => {
      screen.write("live", picture([chatTurn({ messages: 1 }), chatTurn({ messages: 3, speaker: companion })]));

      expect(screen.runs().map((run) => [run.received?.messages, run.speaker])).toEqual([[1, undefined], [3, companion]]);

      // The picture lets the chat agent's turn go and keeps the companion's: only the agent's block comes down.
      screen.write("live", picture([chatTurn({ messages: 3, speaker: companion })]));

      expect(screen.runs().map((run) => run.speaker)).toEqual([companion]);
    });
  });

  // A companion's turn waiting for its engine stands in the picture with the Job it waits on, so a
  // screen opened in the middle of the wait reads it as waiting, and as waiting no longer once the
  // picture lets the wait go (the agency's docs/companions.md, 「The engine it shares」).
  test("a screen arriving while a companion's turn waits for its engine reads the wait off the picture", () => {
    const companion = { id: 1_000_000_007, name: KO.line_350 };

    watching(-1003, (screen) => {
      screen.write("live", picture([chatTurn({ messages: 1, speaker: companion, waiting: { jobId: 5, todoId: 1099 } })]));

      expect(screen.runs().map((run) => [run.progress?.phase, run.progress?.waitingFor])).toEqual([["waiting", { jobId: 5, todoId: 1099 }]]);

      screen.write("live", picture([chatTurn({ messages: 2, speaker: companion, waiting: null })]));

      expect(screen.runs().map((run) => [run.progress, run.received?.messages])).toEqual([[null, 2]]);
    });
  });

  test("what the turn has done arrives with the picture and replaces the one before it", () => {
    watching(-1003, (screen) => {
      const progress = (actions: { kind: "context" | "tool"; name: string; text: string }[], dropped = 0) => ({
        phase: "tool" as const,
        tool: "Bash",
        thinkingTokens: null,
        contextTokens: null,
        cacheReadTokens: null,
        requestId: null,
        spent: null,
        writtenTokens: null,
        actions: actions.map((action) => ({ ...action, state: null })),
        droppedActions: dropped,
        droppedContext: 0
      });

      screen.write("bot", botEvent({ type: "run-started", messageId: 41 }));
      screen.write("bot", botEvent({ type: "run-progress", progress: progress([{ kind: "context", name: "room", text: "chat -1003" }]) }));

      expect(screen.run()?.progress?.actions.map((action) => action.text)).toEqual(["chat -1003"]);

      // The next picture carries the whole list again, so the block is what the last event said
      // and never a screen's own running total.
      screen.write("bot", botEvent({
        type: "run-progress",
        progress: progress([{ kind: "tool", name: "Bash", text: '{"command":"ls"}' }], 3)
      }));

      expect(screen.run()?.progress?.actions.map((action) => action.name)).toEqual(["Bash"]);
      expect(screen.run()?.progress?.droppedActions).toBe(3);
    });
  });

  // Every event of a companion's turn names its speaker (the receiver's live picture, 「What a running turn
  // says of itself」), so its progress moves its own block and its ending settles that block alone.
  test("a companion's turn shows what it did and spent while it runs, and stands with it through its ending", async () => {
    const companion = { id: 11, name: "Companion" };
    const progress: RunProgress = {
      phase: "tool",
      tool: "Bash",
      thinkingTokens: 120,
      contextTokens: 4_000,
      cacheReadTokens: 3_000,
      requestId: "req-1",
      spent: { inputTokens: 1_000, cacheReadTokens: 3_000, cacheWriteTokens: 0 },
      writtenTokens: 40,
      actions: [
        { kind: "context", name: "knowledge", text: "knowledge/sample.md", state: "attached" },
        { kind: "tool", name: "Bash", text: '{"command":"ls"}', state: null }
      ],
      droppedActions: 0,
      droppedContext: 0
    };

    await watching(-1003, async (screen) => {
      screen.write("bot", botEvent({ type: "run-started", messageId: 41, speaker: companion }));
      screen.write("bot", botEvent({ type: "run-started", messageId: 42 }));
      screen.write("bot", botEvent({ type: "run-progress", messageId: 41, speaker: companion, progress }));

      const shown = (): unknown[] => screen.runs().map((run) => [run.speaker?.name, run.progress?.tool, run.progress?.writtenTokens, run.progress?.actions.map((action) => action.name)]);

      expect(shown()).toEqual([["Companion", "Bash", 40, ["knowledge", "Bash"]], [undefined, undefined, undefined, undefined]]);

      screen.write("bot", botEvent({ type: "sent", messageId: 43, speaker: companion }));

      expect(shown()[0]).toEqual(["Companion", "Bash", 40, ["knowledge", "Bash"]]);

      await screen.finishRead();

      expect(screen.runs().map((run) => run.messageId)).toEqual([42]);
    });
  });

  test("the picture that opens the stream carries no id, so the events after it are not thrown away", () => {
    watching(-1003, (screen) => {
      // The picture's own clock is a unix time, far past any id this run of the bot will reach.
      // Were it taken for one, every event after it would read as already seen and the screen
      // would sit there connected and deaf.
      screen.write("live", picture([chatTurn()]));
      screen.write("bot", botEvent({ type: "run-progress", progress: { phase: "writing", tool: null, thinkingTokens: null, contextTokens: null, cacheReadTokens: null, requestId: null, spent: null, writtenTokens: null, actions: [], droppedActions: 0, droppedContext: 0 } }));

      expect(screen.run()?.progress?.phase).toBe("writing");
    });
  });

  test("a picture that no longer holds the turn takes the block down with it", () => {
    watching(-1003, (screen) => {
      screen.write("bot", botEvent({ type: "run-started", messageId: 41 }));

      expect(screen.run()).not.toBeNull();

      screen.write("live", picture([]));

      expect(screen.run()).toBeNull();
    });
  });

  test("each of the four endings tells the screen to read the room again, and the block stands until that read is in", async () => {
    for (const ending of TURN_ENDED) {
      await watching(-1003, async (screen) => {
        screen.write("live", picture([chatTurn()]));

        expect(screen.run()).not.toBeNull();

        // An ending typed only as an event type is past the members a literal's union is checked across, so
        // it is named as the room event it is.
        screen.write("bot", botEvent({ type: ending, messageId: 41 } as BotEvent));

        // The block does not come down at the ending. Were it to, the conversation would be short
        // by its own height for as long as the read took and then grow again when the answer
        // landed — the row taken away and another one built, which is exactly what it is not.
        expect(screen.settled()).toBe(1);
        expect(screen.run()).not.toBeNull();

        await screen.finishRead();

        expect(screen.run()).toBeNull();
      });
    }
  });

  test("a picture that lets the turn go while the read is out does not take the block with it", async () => {
    await watching(-1003, async (screen) => {
      screen.write("live", picture([chatTurn()]));
      screen.write("bot", botEvent({ type: "sent", messageId: 41 }));

      // The bot drops the turn from its picture the moment it ends, which is the same ending the
      // block is already standing through rather than a second one.
      screen.write("live", picture([]));

      expect(screen.run()).not.toBeNull();

      await screen.finishRead();

      expect(screen.run()).toBeNull();
    });
  });

  test("a turn that starts while the last one's read is out owns the block from that moment", async () => {
    await watching(-1003, async (screen) => {
      screen.write("live", picture([chatTurn()]));
      screen.write("bot", botEvent({ type: "sent", messageId: 41 }));
      screen.write("bot", botEvent({ type: "run-started", messageId: 42 }));

      expect(screen.run()?.messageId).toBe(42);

      // The read that was out belongs to the turn before it and has no block left to clear.
      await screen.finishRead();

      expect(screen.run()?.messageId).toBe(42);
    });
  });

  test("a turn that ended in a wait says so, and one that answered says nothing", () => {
    watching(-1003, (screen) => {
      screen.write("bot", botEvent({ type: "waited", messageId: 41 }));

      expect(screen.outcome()).toEqual({ key: "room.status.outcome_waited" });

      screen.write("bot", botEvent({ type: "sent", messageId: 42 }));

      // The answer is its own word for how the turn went; nothing is written over the room.
      expect(screen.outcome()).toBeNull();
    });
  });

  // A skip over the room's words is kept as a line under the message it read, so saying it here
  // as well would say it twice; one that read nothing of the room has no such line.
  test("a skip says so only where it names no message", () => {
    watching(-1003, (screen) => {
      screen.write("bot", botEvent({ type: "skipped", messageId: 41 }));

      expect(screen.outcome()).toBeNull();

      screen.write("bot", botEvent({ type: "skipped", messageId: null }));

      expect(screen.outcome()).toEqual({ key: "room.status.outcome_skipped" });
    });
  });

  test("a companion's turn that failed says whose turn it was", () => {
    watching(-1003, (screen) => {
      screen.write("bot", botEvent({ type: "run-failed", messageId: 41, speaker: { id: 11, name: KO.line_545 } }));

      expect(screen.outcome()).toEqual({ key: "room.status.outcome_run_failed", speaker: { id: 11, name: KO.line_547 } });
    });
  });

  // The tab keeps one stream open across rooms, so a room's screen built afresh on coming back hears
  // no picture of its own; the turn that began while another room was on screen is still its block.
  test("a screen opened onto a room after its turn began, on a stream already open, stands the turn as it stood", () => {
    watching(-1009, (elsewhere) => {
      elsewhere.write("bot", botEvent({ type: "run-started", messageId: 41, received: { messages: 2, instructions: 0 } }));
      elsewhere.write("bot", botEvent({ type: "run-progress", progress: { phase: "writing", tool: null, thinkingTokens: null, contextTokens: null, cacheReadTokens: null, requestId: null, spent: null, writtenTokens: null, actions: [], droppedActions: 0, droppedContext: 0 } }));

      expect(elsewhere.run()).toBeNull();

      watching(-1003, (screen) => {
        expect(screen.run()?.messageId).toBe(41);
        expect(screen.run()?.progress?.phase).toBe("writing");
      });
    });
  });

  test("a bot that says nothing about its turns leaves the block to the events alone", () => {
    watching(-1003, (screen) => {
      screen.write("bot", botEvent({ type: "run-started", messageId: 41 }));
      // A picture from a bot that does not yet carry its turns. What it does not say about them
      // is not the same as saying there are none.
      screen.write("live", { at: 1_788_490_000, runs: [], compacting: [] });

      expect(screen.run()).not.toBeNull();
    });
  });
});

// The bot hands the chat agent's turn with the number its words stand under in the room and no name, and names no
// speaker on its sending or its draft rows (docs/boundary.md, 「Gaps the console meets」). The row standing for that
// turn is the chat agent's own, so its listening row never stands beside it, and it stands until the answer it sent
// is in the feed rather than until the picture lets the turn go (docs/web.md, the room screen's section on what is
// being done now).
describe("the chat agent's turn as the bot tags it", () => {
  const tagged: TurnSpeaker = { id: 8_000_000_001 };
  const open = { since: 1_788_489_000, closesAt: 1_788_491_000 };

  test("a speaker carrying no name is the chat agent's, and one carrying a name a companion's", () => {
    const companion = { id: 11, name: "Companion" };

    expect(companionOf(tagged)).toBeUndefined();
    expect(runKey(tagged)).toBe(runKey(undefined));
    expect(companionOf(companion)).toEqual(companion);
    expect(runKey(companion)).not.toBe(runKey(undefined));
  });

  test("its turn stands as the chat agent's own row, and the listening row gives way to it", () => {
    watching(-1003, (screen) => {
      screen.write("live", picture([]));

      expect(listeningRuns(screen.runs(), open)).toHaveLength(1);

      screen.write("bot", botEvent({ type: "run-started", messageId: 41, speaker: tagged }));

      expect(screen.runs().map((run) => run.speaker)).toEqual([undefined]);
      expect(listeningRuns(screen.runs(), open)).toEqual([]);

      // A screen arriving mid-turn reads the same turn off the picture, tagged the same way.
      screen.write("live", picture([chatTurn({ speaker: tagged })]));

      expect(screen.runs().map((run) => run.speaker)).toEqual([undefined]);
      expect(listeningRuns(screen.runs(), open)).toEqual([]);

      screen.write("live", picture([]));
    });
  });

  test("its draft process reaches it: a question's start puts it on that question and the end takes it off", () => {
    watching(-1003, (screen) => {
      screen.write("live", picture([]));
      screen.write("bot", botEvent({ type: "run-started", messageId: 41, speaker: tagged }));
      screen.write("bot", botEvent({ type: "draft", number: 1, count: 2, kind: "start", question: "intent" }));

      expect(screen.run()?.draft).toEqual({ number: 1, count: 2, question: "intent" });
      expect(listeningRuns(screen.runs(), open)).toEqual([]);

      screen.write("bot", botEvent({ type: "draft", number: 1, kind: "question", question: "intent", outcome: "answered" }));

      expect(screen.run()?.draft?.number).toBe(1);

      screen.write("bot", botEvent({ type: "draft", number: 3, kind: "end", outcome: "message" }));

      expect(screen.run()?.draft).toBeUndefined();

      screen.write("live", picture([]));
    });
  });

  test("a turn that sent stands past the ending's read until its answer is in the feed, and the listening row after", async () => {
    const answer = ref(false);

    await watching(-1003, async (screen) => {
      screen.write("live", picture([]));
      screen.write("bot", botEvent({ type: "run-started", messageId: 41, speaker: tagged }));
      screen.write("bot", botEvent({ type: "sent", messageId: 42, round: "round:a" }));
      // The picture lets the turn go once it sent, well before the answer is read into the room.
      screen.write("live", picture([]));

      expect(screen.runs()).toHaveLength(1);

      await screen.finishRead();

      expect(screen.runs()).toHaveLength(1);
      expect(listeningRuns(screen.runs(), open)).toEqual([]);

      answer.value = true;

      // The update the answer arrives in still holds the block, which the answer takes the place of there; the
      // listening row comes in the next.
      expect(screen.runs()).toHaveLength(1);

      await nextTick();

      expect(screen.runs()).toEqual([]);
      expect(listeningRuns(screen.runs(), open)).toHaveLength(1);
    }, () => answer.value);
  });

  test("a turn whose answer the feed holds already gives its place up without waiting on the read", async () => {
    await watching(-1003, async (screen) => {
      screen.write("live", picture([]));
      screen.write("bot", botEvent({ type: "run-started", messageId: 41, speaker: tagged }));
      screen.write("bot", botEvent({ type: "sent", messageId: 42 }));
      screen.write("live", picture([]));

      await nextTick();

      expect(screen.runs()).toEqual([]);

      await screen.finishRead();

      expect(screen.runs()).toEqual([]);
    }, () => true);
  });

  test("a turn that failed gives its place up at the ending's read, waiting on no answer", async () => {
    await watching(-1003, async (screen) => {
      screen.write("live", picture([]));
      screen.write("bot", botEvent({ type: "run-started", messageId: 41, speaker: tagged }));
      screen.write("bot", botEvent({ type: "run-failed", speaker: tagged }));
      screen.write("live", picture([]));

      expect(screen.runs()).toHaveLength(1);

      await screen.finishRead();

      expect(screen.runs()).toEqual([]);
    }, () => false);
  });

  test("a turn whose answer never reaches the feed gives its place up a while after the read", async () => {
    const clocks = spyOn(globalThis, "setTimeout");

    try {
      await watching(-1003, async (screen) => {
        screen.write("live", picture([]));
        screen.write("bot", botEvent({ type: "run-started", messageId: 41, speaker: tagged }));
        screen.write("bot", botEvent({ type: "sent", messageId: 42 }));
        screen.write("live", picture([]));
        await screen.finishRead();

        expect(screen.runs()).toHaveLength(1);

        const wait = clocks.mock.calls.find((call) => call[1] === ANSWER_WAIT_MS);

        expect(wait).toBeDefined();

        (wait?.[0] as () => void)();

        expect(screen.runs()).toEqual([]);
      }, () => false);
    } finally {
      clocks.mockRestore();
    }
  });

  test("a turn beginning while the last one waits on its answer owns the block from that moment", async () => {
    await watching(-1003, async (screen) => {
      screen.write("live", picture([]));
      screen.write("bot", botEvent({ type: "run-started", messageId: 41, speaker: tagged }));
      screen.write("bot", botEvent({ type: "sent", messageId: 42 }));
      screen.write("live", picture([]));
      await screen.finishRead();
      screen.write("bot", botEvent({ type: "run-started", messageId: 43, speaker: tagged }));

      expect(screen.runs().map((run) => run.messageId)).toEqual([43]);

      screen.write("live", picture([]));
      screen.write("bot", botEvent({ type: "run-failed" }));
      await screen.finishRead();

      expect(screen.runs()).toEqual([]);
    }, () => false);
  });
});

describe("how long a dropped stream waits before it tries again", () => {
  test("the first try comes after about a second, while a restarting bot is coming back", () => {
    expect(retryDelay(1)).toBe(1_000);
  });

  test("each try after it waits longer", () => {
    expect([2, 3, 4].map(retryDelay)).toEqual([5_000, 10_000, 15_000]);
  });

  test("and the wait never grows past fifteen seconds", () => {
    expect(retryDelay(5)).toBe(15_000);
    expect(retryDelay(1_000)).toBe(15_000);
  });
});

interface WatchedStream {
  state: BotStream;
  // The stream the screen holds right now, which is a new one after every reopen.
  current: () => FakeStream;
  // The waits the stream asked for, in order, and the way to let the last of them run out.
  waits: number[];
  elapse: () => void;
  // Lets the wait of this length run out, whichever was asked for last.
  elapseWait: (ms: number) => void;
  // One turn of every clock the stream keeps running rather than waits on once: its silence watch.
  tick: () => void;
}

// A screen holding the tab's one stream, with the clock taken in hand: every wait the stream asks
// for is written down rather than run, and a test lets it run out when it chooses.
function holdingStream(body: (held: WatchedStream) => void): void {
  const realSetTimeout = globalThis.setTimeout;
  const realClearTimeout = globalThis.clearTimeout;
  const realSetInterval = globalThis.setInterval;
  const realClearInterval = globalThis.clearInterval;
  const globals: Record<string, unknown> = globalThis;
  const waits: number[] = [];
  const pending = new Map<number, { ms: number; handler: () => void }>();
  const running = new Map<number, () => void>();
  let nextHandle = 1;
  let state: BotStream | null = null;

  globals.setTimeout = (handler: () => void, ms: number) => {
    const handle = nextHandle;

    nextHandle += 1;
    waits.push(ms);
    pending.set(handle, { ms, handler });

    return handle;
  };
  globals.clearTimeout = (handle: number) => {
    pending.delete(handle);
  };
  globals.setInterval = (handler: () => void) => {
    const handle = nextHandle;

    nextHandle += 1;
    running.set(handle, handler);

    return handle;
  };
  globals.clearInterval = (handle: number) => {
    running.delete(handle);
  };

  const runLast = (match: (ms: number) => boolean): void => {
    const found = [...pending.entries()].filter(([, wait]) => match(wait.ms)).at(-1);

    if (found !== undefined) {
      pending.delete(found[0]);
      found[1].handler();
    }
  };

  const app = createApp(
    defineComponent({
      setup() {
        state = useBotEvents(() => undefined);

        return () => null;
      }
    })
  );

  try {
    app.mount({});

    if (state === null || FakeStream.opened === null) {
      throw new Error("the screen opened no stream");
    }

    body({
      state,
      current: () => FakeStream.opened!,
      waits,
      elapse: () => runLast(() => true),
      elapseWait: (ms) => runLast((held) => held === ms),
      tick: () => {
        for (const handler of [...running.values()]) {
          handler();
        }
      }
    });
  } finally {
    app.unmount();
    globalThis.setTimeout = realSetTimeout;
    globalThis.clearTimeout = realClearTimeout;
    globalThis.setInterval = realSetInterval;
    globalThis.clearInterval = realClearInterval;
  }
}

describe("a stream that drops", () => {
  test("says so and tries again after a second, then after five", () => {
    holdingStream(({ state, current, waits, elapse }) => {
      current().write("run", { run: "run-a" });
      expect(state.connected.value).toBe(true);

      current().write("error", {});
      expect(state.dropped.value).toBe(true);
      expect(state.connected.value).toBe(false);
      expect(waits).toEqual([1_000]);

      elapse();
      current().write("error", {});
      expect(waits).toEqual([1_000, 5_000]);
    });
  });

  test("starts counting again once the bot speaks, and reopens where it left off", () => {
    holdingStream(({ state, current, waits, elapse }) => {
      current().write("run", { run: "run-b" });
      const event = botEvent({ type: "todo", chatId: 0 });

      current().write("bot", event);
      current().write("error", {});
      elapse();
      current().write("error", {});
      elapse();

      const reopened = current();

      expect(reopened.url).toContain(`after=${event.id}`);
      expect(reopened.url).toContain("run=run-b");

      reopened.write("run", { run: "run-b" });
      expect(state.dropped.value).toBe(false);

      reopened.write("error", {});
      expect(waits).toEqual([1_000, 5_000, 1_000]);
    });
  });
});

describe("a stream that goes quiet", () => {
  test("is taken for lost after four keepalives' worth of nothing, and opened again where it was", () => {
    const warned = spyOn(console, "warn").mockImplementation(() => undefined);

    try {
      holdingStream(({ state, current, waits, elapse, tick }) => {
        current().write("run", { run: "run-q" });
        const event = botEvent({ type: "todo", chatId: 0 });

        current().write("bot", event);
        tick();
        tick();
        tick();
        tick();
        expect(state.connected.value).toBe(true);

        tick();
        expect(state.connected.value).toBe(false);
        expect(state.dropped.value).toBe(true);
        expect(waits).toEqual([1_000]);
        expect(warned).toHaveBeenCalledTimes(1);

        const before = current();

        elapse();
        expect(current()).not.toBe(before);
        expect(current().url).toContain(`after=${event.id}`);
        expect(current().url).toContain("run=run-q");
      });
    } finally {
      warned.mockRestore();
    }
  });

  test("the keepalive alone keeps it, with no news from the bot at all", () => {
    holdingStream(({ state, current, waits, tick }) => {
      current().write("run", { run: "run-k" });

      for (let look = 0; look < 12; look += 1) {
        current().write("keep", {});
        tick();
      }

      expect(state.connected.value).toBe(true);
      expect(waits).toEqual([]);
    });
  });
});

describe("a break the bot announced", () => {
  test("reads as a restart, not a break, until the new run speaks", () => {
    holdingStream(({ state, current, elapseWait }) => {
      current().write("run", { run: "run-c" });
      current().write("stopping", {});

      // The word alone changes nothing: the stream is still carrying.
      expect(state.connected.value).toBe(true);
      expect(state.restarting.value).toBe(false);

      current().write("error", {});
      expect(state.restarting.value).toBe(true);
      expect(state.dropped.value).toBe(false);

      // A try that finds the bot still down is still the same restart.
      elapseWait(1_000);
      current().write("error", {});
      expect(state.restarting.value).toBe(true);
      expect(state.dropped.value).toBe(false);

      elapseWait(5_000);
      current().write("run", { run: "run-d" });
      expect(state.restarting.value).toBe(false);
      expect(state.dropped.value).toBe(false);
      expect(state.connected.value).toBe(true);

      // The restart is over, so the next unannounced break is a break.
      current().write("error", {});
      expect(state.dropped.value).toBe(true);
      expect(state.restarting.value).toBe(false);
    });
  });

  test("a stream that never spoke is not said to have dropped", () => {
    holdingStream(({ state, current }) => {
      current().write("error", {});

      expect(state.dropped.value).toBe(false);
      expect(state.restarting.value).toBe(false);
    });
  });

  test("a break with no word before it is a break at once", () => {
    holdingStream(({ state, current }) => {
      current().write("run", { run: "run-e" });
      current().write("error", {});

      expect(state.dropped.value).toBe(true);
      expect(state.restarting.value).toBe(false);
    });
  });

  test("a restart that never speaks reads as a break once its time is up", () => {
    holdingStream(({ state, current, waits, elapseWait }) => {
      current().write("run", { run: "run-f" });
      current().write("stopping", {});
      current().write("error", {});

      expect(waits).toContain(120_000);
      expect(state.restarting.value).toBe(true);

      elapseWait(120_000);
      expect(state.restarting.value).toBe(false);
      expect(state.dropped.value).toBe(true);
    });
  });
});
