import { describe, expect, test } from "bun:test";

import { wording } from "../../../apps/web/shared/wording";

import type { Judgement } from "../../../apps/web/shared/types";

Object.assign(globalThis, { useAppConfig: () => ({ bmoUi: { zone: "Asia/Seoul", locale: "ko-KR", dateLocale: "ko" } }) });

const { reportOf } = await import("../../../apps/web/app/domain/room-copy");

// What a copy holds (docs/web.md, 「What a copy holds」): the chosen message and its own verdicts, and nothing of
// any other message — the answer it drew stands as its word alone.

const judgement = (id: number, stage: string, verdict: string, detail: string | null): Judgement => ({
  id, chatId: -7, messageId: 31, stage, verdict, detail, createdAt: 1_790_000_000 + id
});

describe("a copied message", () => {
  test("holds its verdicts, and the answer it drew as its word alone", () => {
    const copied = reportOf(wording, "room-a", -7, [
      {
        senderName: "person-a",
        senderId: 11,
        messageId: 31,
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
