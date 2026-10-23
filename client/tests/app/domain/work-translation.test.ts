import { describe, expect, mock, test } from "bun:test";

import { wording } from "../../../apps/web/shared/wording";
import { computed, nextTick, ref, watch } from "vue";

import type { WorkTextTranslation } from "../../../apps/web/shared/types";
import KO from "../../fixtures/app/domain/work-translation.test.ko.json";

// One text of a work order read in the other language. What is pinned here is what the screen can
// never show by itself: that the translation is only ever asked for once the toggle is on, that what
// is still missing is handed over again rather than waited for, and that a reading of another text
// never lands on this one.

// The framework's own, which a test of the module alone does not bring with it.
const globals = globalThis as unknown as Record<string, unknown>;

globals.ref = ref;
globals.computed = computed;
globals.watch = watch;

interface Call {
  url: string;
  method: string;
  body: Record<string, unknown> | null;
  query: Record<string, unknown> | null;
}

const calls: Call[] = [];
let answer: WorkTextTranslation | null = null;
let refuse: unknown = null;

globals.$fetch = async (url: string, options?: { method?: string; body?: Record<string, unknown>; query?: Record<string, unknown> }) => {
  calls.push({ url, method: options?.method ?? "GET", body: options?.body ?? null, query: options?.query ?? null });

  if (refuse !== null) {
    throw refuse;
  }

  return options?.method === "POST" ? { ok: true, taken: 1 } : answer;
};

mock.module("../../../apps/web/app/domain/events", () => ({ useBotEvents: () => undefined, useLiveRefresh: () => undefined }));

const { useWorkTextTranslation } = await import("../../../apps/web/app/domain/work-translation");

const PLAN = JSON.stringify({ stages: [{ title: "Trace the screens", tasks: [] }] });

function standing(parts: Array<string | null>, extra: Partial<WorkTextTranslation> = {}): WorkTextTranslation {
  return {
    document: "work-order/571/plan/result",
    version: "a".repeat(64),
    language: "en",
    target: "ko",
    parts: parts.map((text, part) => ({ part, source: "Trace the screens", text, failed: false, failure: null })),
    pending: 0,
    failure: null,
    ...extra
  };
}

function reading(text = PLAN) {
  const on = ref(false);
  const held = useWorkTextTranslation(wording, () => ({ todoId: 571, task: "plan", field: "result", text }), () => on.value);

  return { on, held };
}

describe("asking for a translation", () => {
  test("asks for nothing at all while the toggle is off", async () => {
    calls.length = 0;
    answer = standing([null]);

    const { held } = reading();

    await nextTick();

    expect(calls).toEqual([]);
    expect(held.shown.value).toBe(PLAN);
    expect(held.translating.value).toBe(false);
  });

  test("reads what stands and hands the missing parts over the moment it is turned on", async () => {
    calls.length = 0;
    answer = standing([null]);

    const { on, held } = reading();

    on.value = true;
    await nextTick();
    await Promise.resolve();
    await Promise.resolve();

    expect(calls[0]).toMatchObject({ url: "/api/todos/571/work-order/translation", method: "GET", query: { task: "plan", field: "result" } });
    expect(calls[1]).toMatchObject({ method: "POST", body: { task: "plan", field: "result", retry: false } });
    expect(held.translating.value).toBe(true);
  });

  test("asks for nothing more once every part stands", async () => {
    calls.length = 0;
    answer = standing([KO.line_99]);

    const { on, held } = reading();

    on.value = true;
    await nextTick();
    await Promise.resolve();
    await Promise.resolve();

    expect(calls.filter((call) => call.method === "POST")).toEqual([]);
    expect(held.translating.value).toBe(false);
    expect(JSON.parse(held.shown.value).stages[0].title).toBe(KO.line_110);
  });
});

describe("what the screen draws", () => {
  test("is the original again the moment the toggle goes off", async () => {
    answer = standing([KO.line_116]);

    const { on, held } = reading();

    on.value = true;
    await nextTick();
    await Promise.resolve();
    await Promise.resolve();
    on.value = false;
    await nextTick();

    expect(held.shown.value).toBe(PLAN);
  });

  test("is the original where a reading was cut for another text than the one in hand", async () => {
    answer = standing([KO.line_131, KO.line_131_2, KO.line_131_3]);

    const { on, held } = reading();

    on.value = true;
    await nextTick();
    await Promise.resolve();
    await Promise.resolve();

    expect(held.shown.value).toBe(PLAN);
  });

  test("names the language the text would be put into before the bot has said anything", () => {
    const { held } = reading();

    expect(held.target.value).toBe("ko");
    expect(reading(KO.line_147).held.target.value).toBe("en");
  });
});

describe("when it cannot be read", () => {
  test("says so in the bot's own words rather than standing silent", async () => {
    answer = standing([null]);
    refuse = { data: { message: "The translator did not answer." } };

    const { on, held } = reading();

    on.value = true;
    await nextTick();
    await Promise.resolve();
    await Promise.resolve();
    refuse = null;

    expect(held.failure.value).toBe("The translator did not answer.");
  });

  test("says the bot is out of reach where it holds nothing and answers nothing", async () => {
    answer = standing([null], { pending: null });

    const { on, held } = reading();

    on.value = true;
    await nextTick();
    await Promise.resolve();
    await Promise.resolve();

    expect(held.failure.value).toBe(wording("todo.error.translation_unreachable"));
  });
});
