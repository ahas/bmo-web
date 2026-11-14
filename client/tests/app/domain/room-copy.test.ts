import { describe, expect, test } from "bun:test";

import { wording } from "../../../apps/web/shared/wording";

import type { DraftRead } from "../../../apps/web/shared/drafting";
import type { Judgement } from "../../../apps/web/shared/types";

Object.assign(globalThis, { useAppConfig: () => ({ bmoUi: { zone: "Asia/Seoul", locale: "ko-KR", dateLocale: "ko" } }) });

const { copyBrain, copyCalls, reportOf } = await import("../../../apps/web/app/domain/room-copy");

// What a copy holds (docs/web.md, 「What a copy holds」): the chosen message and its own verdicts, and nothing of
// any other message — the answer it drew stands as its word alone.

const judgement = (id: number, stage: string, verdict: string, detail: string | null): Judgement => ({
  id, chatId: -7, messageId: "31", stage, verdict, detail, createdAt: 1_790_000_000 + id
});

// What a round's end names as read: one piece the index lists, one it does not, one the session already held.
const READS: DraftRead[] = [
  { path: "core/facts.md", holds: "core facts", how: "attached" },
  { path: "recent-notes.md", holds: null, how: "read" },
  { path: "people/index.md", holds: "people", how: "held" }
];

describe("a copied message", () => {
  test("holds its verdicts, and the answer it drew as its word alone", () => {
    const copied = reportOf(wording, "room-a", -7, [
      {
        senderName: "person-a",
        senderId: 11,
        messageId: "31",
        sentAt: 1_790_000_000,
        text: "the question",
        judgements: [
          judgement(1, "people-search", "SKIP: no candidates", null),
          judgement(2, "system-documents", "PICK: doc-a", "doc-a\ndoc-b"),
          judgement(3, "chat", "REPLY: the answer's first line…", "the answer's first line\nand all the rest of it")
        ]
      }
    ]);

    expect(copied).toContain("#31: the question");
    expect(copied).toContain("SKIP: no candidates");
    expect(copied).toContain("doc-b");
    expect(copied).toMatch(/: REPLY$/m);
    expect(copied).not.toContain("the answer's first line");
    expect(copied).not.toContain("and all the rest of it");
  });
});

// Every chip's content, in the chips' order: the verdicts, the draft process with each round row, the calls with
// their results' sizes, what the turn read from the brain, what it spent, and the send last.
describe("a copied answer", () => {
  const line = (id: number, kind: string, fields: Record<string, unknown>) => ({
    id, agent: "agent-a", run: "run-a", chatId: -7, at: 1_790_000_000, kind, name: null, tool: null, parent: null, ref: null, state: null,
    truncated: false, text: "", patches: [], patchesMore: 0, ...fields
  });
  const lines = [
    line(1, "context", { name: "doc-a", text: "doc-a", state: "attached" }),
    line(2, "tool", { name: "bash", tool: { name: "bash", icon: null }, ref: "call-a", text: "ls -la" }),
    line(3, "tool-result", { name: "bash", ref: "call-a", state: "succeeded", text: "x".repeat(1_234) }),
    line(4, "tool", { name: "web_fetch", tool: { name: "web_fetch", icon: null }, ref: "call-b", text: "https://example.invalid" }),
    line(5, "tool-result", { name: "web_fetch", ref: "call-b", state: "failed", text: "refused" })
  ] as Parameters<typeof copyCalls>[0];

  test("names each call with its result's size, or that it failed, and what the turn read", () => {
    expect(copyCalls(lines)).toEqual([
      { name: "bash", resultChars: 1_234, failed: false },
      { name: "web_fetch", resultChars: 7, failed: true }
    ]);
    expect(copyBrain(lines)).toEqual(["doc-a"]);
    expect(copyBrain(lines, READS)).toEqual([]);
  });

  test("holds every chip's content in the chips' order, the send last", () => {
    const copied = reportOf(wording, "room-a", -7, [
      {
        senderName: "agent-a",
        senderId: 21,
        messageId: "-52",
        sentAt: 1_790_000_000,
        text: "the answer",
        judgements: [
          judgement(1, "send", "SENT", null),
          judgement(2, "draft", "ROUND 0 supervisor", null),
          judgement(3, "output-format", "PASS", null)
        ],
        chips: {
          drafts: [
            { id: 1, number: 1, question: "final", kind: "question", answerChars: 70, changed: false, outcome: "answered", detail: null, ms: 10_939, at: 1, answer: null, reads: [] },
            { id: 2, number: 2, question: "", kind: "end", answerChars: 0, changed: false, outcome: "message", detail: null, ms: 0, at: 2, answer: null, reads: READS }
          ],
          calls: copyCalls(lines),
          reads: READS,
          brain: copyBrain(lines, READS),
          spend: null
        }
      }
    ]);
    const order = [
      "PASS",
      wording("room.label.chip_drafts"),
      "ROUND 0 supervisor",
      "final",
      "10,939ms",
      wording("room.label.draft_reads", { names: "core facts, recent-notes.md" }),
      wording("room.label.chip_tools"),
      `bash: ${wording("room.label.copy_result_chars", { n: "1,234" })}`,
      `web_fetch: ${wording("room.label.copy_call_failed")}`,
      wording("room.label.chip_brain"),
      `${wording("room.label.brain_read_attached")}: core facts (core/facts.md)`,
      `${wording("room.label.brain_read_read")}: recent-notes.md`,
      `${wording("room.label.brain_read_before")}: people (people/index.md)`,
      "SENT"
    ].map((part) => copied.indexOf(part));

    expect(order.every((at) => at >= 0)).toBe(true);
    expect([...order].sort((left, right) => left - right)).toEqual(order);
    expect(copied).not.toContain(wording("room.label.chip_tokens"));
    // The end names what was handed, so the log's own document does not stand a second time.
    expect(copied).not.toContain("doc-a");
  });
});
