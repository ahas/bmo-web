import { afterAll, beforeEach, describe, expect, test } from "bun:test";

import { catalogueEntry, catalogueRow } from "../../support/catalogue";

import { wording } from "../../../apps/web/shared/wording";

import { registerChatAgent } from "../../../apps/web/shared/agent-names";
import { holdCatalogue } from "../../../apps/web/app/domain/agents";
import {
  barHeight,
  causeText,
  emptyWatch,
  chatSessionLabel,
  eventTime,
  filterSiren,
  isLoud,
  kindLook,
  noteLabel,
  projectLabel,
  SIREN_ALL,
  SIREN_UNNAMED,
  sirenAgentChoices,
  sirenAgentLabel,
  sirenKindChoices,
  sirenModelChoices,
  sirenLink,
  standingOf,
  tokenText
} from "../../../apps/web/app/domain/siren";

import type { AgentSummary, RoomSummary, SirenEvent, SirenWatch } from "../../../apps/web/shared/types";
import KO from "../../fixtures/app/domain/siren.test.ko.json";

// The console's times are shown in the zone its app config names; a test standing outside Nuxt answers
// with the same one the console is built with.
Object.assign(globalThis, { useAppConfig: () => ({ bmoUi: { zone: "Asia/Seoul", locale: "ko-KR", dateLocale: "ko" } }) });

// The chat agent as the deployment names it, which the owner's own room is called by.
const OWNER_ROOM_TITLE = "Agent A";

registerChatAgent({ name: "agent-a", label: OWNER_ROOM_TITLE });
afterAll(() => registerChatAgent({ name: "", label: "" }));

// A room's own session, as the screen calls it.
const session = (title: string) => wording("siren.label.chat_session", { title, agent: OWNER_ROOM_TITLE });

// Every screen reads an agent's name out of the catalogue the archive answered with, so a test
// about a name puts that list in hand the way the app does.
function catalogued(name: string, kind: string, label: string): AgentSummary {
  const icon = "i-material-symbols-radio-button-checked-outline";

  if (kind === "chat" || kind === "room") return { ...catalogueRow(name, kind, label), icon };

  return catalogueEntry(name, kind === "worker" ? "repository" : "role", label, { icon });
}

beforeEach(() =>
  holdCatalogue([
    catalogued("content-judge", "gate", KO.line_74),
    catalogued("search", "runner", KO.line_75),
    catalogued("browse", "runner", KO.line_76),
    catalogued("digest", "editor", KO.line_77),
    catalogued("people-digest", "editor", KO.line_78),
    catalogued("worker", "worker", KO.line_79)
  ])
);


function event(overrides: Partial<SirenEvent> = {}): SirenEvent {
  return {
    mode: "claude-code",
    seq: 1,
    atSeconds: 1_788_600_285,
    project: "home-user-checkouts-web",
    session: "f62a18a8",
    agent: null,
    model: "O5",
    kind: "warm",
    level: "info",
    note: "",
    cause: null,
    newTokens: 648,
    readTokens: 814029,
    ...overrides
  };
}

describe("what one request reads as", () => {
  test("the watch's own kinds, in the words the screen uses", () => {
    expect(kindLook(wording, "warm")).toMatchObject({ label: wording("siren.label.kind_warm"), color: "success" });
    expect(kindLook(wording, "cold")).toMatchObject({ label: wording("siren.label.kind_cold"), color: "error" });
    expect(kindLook(wording, "burst").color).toBe("error");
    expect(kindLook(wording, "start").label).toBe(wording("siren.label.kind_start"));
    // Every kind wears a mark of its own beside its word.
    expect(kindLook(wording, "cold").icon).toStartWith("i-material-symbols-");
  });

  test("the watch's notice is not an error", () => {
    expect(kindLook(wording, "notice")).toMatchObject({ label: KO.line_115, color: "neutral" });
    expect(isLoud(event({ kind: "notice", level: "info" }))).toBe(false);
  });

  test("a plain repeat request is one of the watch's own kinds", () => {
    expect(kindLook(wording, "request")).toMatchObject({ label: KO.line_120, color: "neutral" });
    expect(isLoud(event({ kind: "request", level: "info" }))).toBe(false);
  });

  test("a kind the watch grows later still stands as a request", () => {
    expect(kindLook(wording, "something-new")).toMatchObject({ label: KO.line_125, color: "neutral" });
  });

  test("loud is what the watch called loud, not a threshold read twice", () => {
    expect(isLoud(event({ level: "red" }))).toBe(true);
    expect(isLoud(event({ level: "warn" }))).toBe(false);
    expect(isLoud(event())).toBe(false);
  });
});

describe("the numbers on the screen", () => {
  test("tokens read as a person counts them", () => {
    expect(tokenText(648)).toBe("648");
    expect(tokenText(1900)).toBe("1.9K");
    expect(tokenText(20000)).toBe("20K");
    expect(tokenText(814029)).toBe("814K");
    expect(tokenText(3_500_000)).toBe("3.5M");
  });

  test("a minute's bar stands against the threshold the watch calls red", () => {
    expect(barHeight(0, 100_000)).toBe(0);
    expect(barHeight(50_000, 100_000)).toBe(50);
    expect(barHeight(250_000, 100_000)).toBe(100);
  });

  test("a bar says nothing where there is no threshold to say it against", () => {
    expect(barHeight(50_000, 0)).toBe(0);
  });

  test("a session's project reads as the directory it was working in", () => {
    expect(projectLabel("home-user-checkouts-web")).toBe("web");
    expect(projectLabel("")).toBe("");
  });
});

const rooms: RoomSummary[] = [
  { chatId: 10000001, title: OWNER_ROOM_TITLE, messageCount: 1, lastMessageAt: 1, pinned: false },
  { chatId: -1000000000003, title: "Alpha Room", messageCount: 1, lastMessageAt: 1, pinned: false }
];

describe("what a request stands under", () => {
  test("a room's own session carries the chat agent's label without ever saying it twice", () => {
    expect(chatSessionLabel(wording, "Alpha Room")).toBe(session("Alpha Room"));
    expect(chatSessionLabel(wording, OWNER_ROOM_TITLE)).toBe(OWNER_ROOM_TITLE);
    expect(chatSessionLabel(wording, session("Alpha Room"))).toBe(session("Alpha Room"));
  });

  test("a chat session is named by its room, and every other agent by its own name", () => {
    expect(sirenAgentLabel(wording, event({ agent: "chat:-1000000000003" }), rooms)).toBe(session("Alpha Room"));
    expect(sirenAgentLabel(wording, event({ agent: "chat:10000001" }), rooms)).toBe(OWNER_ROOM_TITLE);
    expect(sirenAgentLabel(wording, event({ agent: "worker" }), rooms)).toBe(KO.line_175);
    expect(sirenAgentLabel(wording, event({ agent: "search" }), rooms)).toBe(KO.line_176);
  });

  test("a request with no agent keeps the directory it was written to", () => {
    expect(sirenAgentLabel(wording, event({ agent: null }), rooms)).toBe("web");
  });

  test("a burst names every project in its window, biggest first, a runner by its own name", () => {
    expect(
      sirenAgentLabel(wording, event({ agent: null, project: "-home-user-agents-search,-home-user-checkouts-web" }), rooms),
    ).toBe(KO.line_186);
  });
});

describe("what the two pickers offer", () => {
  const events = [
    event({ seq: 1, agent: "chat:-1000000000003", kind: "warm" }),
    event({ seq: 2, agent: "worker", kind: "cold" }),
    event({ seq: 3, agent: null, kind: "warm" }),
    event({ seq: 4, agent: "chat:10000001", kind: "warm" })
  ];

  test("the agents the list carries, rooms first and the unnamed last", () => {
    expect(sirenAgentChoices(wording, events, rooms, SIREN_ALL)).toEqual([
      { value: SIREN_ALL, label: KO.line_200 },
      { value: "chat:10000001", label: OWNER_ROOM_TITLE },
      { value: "chat:-1000000000003", label: session("Alpha Room") },
      { value: "worker", label: KO.line_203 },
      { value: SIREN_UNNAMED, label: KO.line_204 }
    ]);
  });

  test("a choice the list has gone quiet on is still offered", () => {
    const choices = sirenAgentChoices(wording, [event({ agent: "worker" })], rooms, "chat:10000001");

    expect(choices.map((choice) => choice.value)).toEqual([SIREN_ALL, "chat:10000001", "worker"]);
  });

  test("every kind the watch knows, in its fixed order and the words the screen uses, whatever the list carries", () => {
    const all = [
      { value: SIREN_ALL, label: KO.line_216 },
      { value: "warm", label: KO.line_217 },
      { value: "request", label: KO.line_218 },
      { value: "start", label: KO.line_219 },
      { value: "growth", label: KO.line_220 },
      { value: "cold", label: KO.line_221 },
      { value: "refusal", label: KO.line_222 },
      { value: "burst", label: KO.line_223 },
      { value: "quota", label: KO.line_224 },
      { value: "error", label: KO.line_225 },
      { value: "compact", label: KO.line_226 },
      { value: "cmd", label: KO.line_227 },
      { value: "notice", label: KO.line_228 }
    ];

    expect(sirenKindChoices(wording, events, SIREN_ALL)).toEqual(all);
    expect(sirenKindChoices(wording, [], SIREN_ALL)).toEqual(all);
  });

  test("a kind only the records name stands after the known ones", () => {
    const values = sirenKindChoices(wording, [event({ kind: "novel" })], SIREN_ALL).map((choice) => choice.value);

    expect(values.at(-1)).toBe("novel");
    expect(values).toHaveLength(14);
  });

  test("the models the list carries keep their canonical ids behind readable names", () => {
    expect(
      sirenModelChoices(
        wording,
        [event({ model: "claude-opus-5" }), event({ model: "claude-sonnet-5" })],
        SIREN_ALL,
      ),
    ).toEqual([
      { value: SIREN_ALL, label: KO.line_250 },
      { value: "claude-opus-5", label: "Opus 5" },
      { value: "claude-sonnet-5", label: "Sonnet 5" },
    ]);
  });
});

describe("what the pickers leave standing", () => {
  const events = [
    event({ seq: 1, agent: "chat:-1000000000003", kind: "warm" }),
    event({ seq: 2, agent: "worker", kind: "cold" }),
    event({ seq: 3, agent: null, kind: "warm" })
  ];

  test("everything, until something is picked", () => {
    expect(filterSiren(events, SIREN_ALL, SIREN_ALL)).toHaveLength(3);
  });

  test("one agent's requests, and the unnamed ones as their own group", () => {
    expect(filterSiren(events, "worker", SIREN_ALL).map((row) => row.seq)).toEqual([2]);
    expect(filterSiren(events, SIREN_UNNAMED, SIREN_ALL).map((row) => row.seq)).toEqual([3]);
  });

  test("one kind, and the two together", () => {
    expect(filterSiren(events, SIREN_ALL, "warm").map((row) => row.seq)).toEqual([1, 3]);
    expect(filterSiren(events, "worker", "warm")).toEqual([]);
  });

  test("one model without folding it together with another mode or model", () => {
    const mixed = [
      event({ seq: 1, model: "claude-opus-5" }),
      event({ seq: 2, model: "claude-sonnet-5" }),
    ];

    expect(filterSiren(mixed, SIREN_ALL, SIREN_ALL, "claude-sonnet-5").map((row) => row.seq)).toEqual([2]);
  });
});

// Where a press on a request goes. The rule is the live board's own — a row leads to the log of
// the agent whose run it was — and the second the watch saw carries it to the run itself rather
// than to the end of the log.
describe("where a request leads", () => {
  test("to the log of the agent that made it, opened at that request", () => {
    expect(sirenLink(event({ agent: "browse" }))).toBe("/agents/browse?at=1788600285");
    expect(sirenLink(event({ agent: "worker", atSeconds: 1_788_690_914 }))).toBe("/agents/worker?at=1788690914");
  });

  test("a room's own session leads to that session's log, not to the room", () => {
    // What stands in the room is what was said; what this screen is about is what the session
    // spent saying it, and that is written in the log alone.
    expect(sirenLink(event({ agent: "chat:10000001" }))).toBe("/agents/chat%3A10000001?at=1788600285");
  });

  test("a request the watch could name but did not time leads to the end of that log", () => {
    expect(sirenLink(event({ agent: "search", atSeconds: null }))).toBe("/agents/search");
  });

  test("a request nobody could put a name to leads nowhere, so its row is not pressable", () => {
    expect(sirenLink(event({ agent: null }))).toBeNull();
    expect(sirenLink(event({ agent: null, atSeconds: 1_788_600_285 }))).toBeNull();
  });
});

// The words the screen puts on what the watch said and on what the bot knows. The watch writes
// its own short names and the bot writes three of its own; neither is what a person reads, and a
// name either of them grows later stands as it is rather than disappearing behind a guess.
describe("the words for why a prefix went", () => {
  test("the watch's own reasons read in the language the rest of the screen speaks", () => {
    expect(noteLabel(wording, "prefix_changed")).toBe(wording("siren.label.note_prefix_changed"));
    expect(noteLabel(wording, "ttl_expired")).toBe(wording("siren.label.note_ttl_expired"));
    expect(noteLabel(wording, "session_start")).toBe(wording("siren.label.note_session_start"));
    expect(noteLabel(wording, "119 req in 60s")).toBe(wording("siren.label.note_burst", { seconds: "60", count: "119" }));
  });

  test("and a reason nobody has taught it stands as the watch wrote it", () => {
    expect(noteLabel(wording, "something_new")).toBe("something_new");
  });

  test("the bot's three causes, each with what actually moved beside it", () => {
    expect(causeText(wording, { why: "reload", detail: "prompts/rules/answer-shape.md", at: 1 })).toBe(
      KO.line_330
    );
    expect(causeText(wording, { why: "deploy", detail: KO.line_332, at: 1 })).toBe(KO.line_332_2);
    expect(causeText(wording, { why: "launch", detail: "CLAUDE.md", at: 1 })).toBe(KO.line_333);
  });

  test("and a cause with nothing to name is just the cause", () => {
    expect(causeText(wording, { why: "deploy", detail: "", at: 1 })).toBe(KO.line_337);
  });
});

// What the title bar says about the watch rather than about any one request. It reads as one line
// where the bar has room and as rows behind a mark where it has not, and both are made here at
// once so the two shapes cannot come to say different things.

function watching(over: Partial<SirenWatch>): SirenWatch {
  return { ...emptyWatch(), reachable: true, ...over };
}

describe("what the bar says about the watch itself", () => {
  test("is nothing at all while the watch does not answer", () => {
    // The body of the screen already says the watch is unreachable in its own words; a mark
    // opening onto two blanks would say it worse.
    expect(standingOf(wording, emptyWatch())).toBeNull();
    expect(standingOf(wording, { ...emptyWatch(), since: 1_792_594_617_000, events: [event()] })).toBeNull();
  });

  test("is when its window began and the clock of the last request", () => {
    const standing = standingOf(wording, watching({ since: 1_792_594_617_000, events: [event({ seq: 2, atSeconds: 1_792_594_623 })] }));

    expect(standing?.facts).toEqual([
      { label: wording("siren.label.window_since"), value: "23:56:57" },
      { label: wording("siren.label.last_request"), value: "23:57:03" }
    ]);
    expect(standing?.line).toBe(`${wording("siren.label.window_since")} 23:56:57 · ${wording("siren.label.last_request")} 23:57:03`);
  });

  test("says only the window where the watch has seen no request yet", () => {
    const standing = standingOf(wording, watching({ since: 1_792_594_617_000, events: [] }));

    expect(standing?.facts).toEqual([{ label: wording("siren.label.window_since"), value: "23:56:57" }]);
    // No trailing separator hanging off the end of a line with nothing after it.
    expect(standing?.line).toBe(`${wording("siren.label.window_since")} 23:56:57`);
  });

  test("is nothing where the watch keeps no window and has seen nothing", () => {
    expect(standingOf(wording, watching({ since: null, events: [] }))).toBeNull();
  });

  test("and the line is the rows read out, so folding the bar cannot change what it says", () => {
    const standing = standingOf(wording, watching({ since: 1_792_594_617_000, events: [event({ atSeconds: 1_792_594_623 })] }));

    expect(standing?.line).toBe(standing?.facts.map((fact) => `${fact.label} ${fact.value}`).join(" · "));
  });
});

// A request's clock is the moment the siren recorded, written in the console's own zone and shape
// rather than as a string the siren handed over.
describe("the clock a request reads as", () => {
  test("is the second it was made at, in the console's zone", () => {
    expect(eventTime(event({ atSeconds: 1_792_594_623 }))).toBe("23:57:03");
  });

  test("and nothing where the siren carried no second", () => {
    expect(eventTime(event({ atSeconds: null }))).toBe("");
  });
});
