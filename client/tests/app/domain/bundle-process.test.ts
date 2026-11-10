import { afterAll, describe, expect, test } from "bun:test";

import { browserProcess, standProcess } from "../../../apps/web/app/domain/bundle-process";

// The `process` a console bundle's module reads, stood where the page carries none (docs/web.md, 「Screens a unit
// brings」). Each case takes the run's own `process` away and gives it back at once, so the runner never goes on
// holding a page one test made.

const found = Reflect.get(globalThis, "process");

afterAll(() => {
  Reflect.set(globalThis, "process", found);
});

/** The build the `process` now on the page names, where a page holds one. */
function localeStoodOnPage(): unknown {
  const stood = Reflect.get(globalThis, "process");
  const env = typeof stood === "object" && stood !== null ? Reflect.get(stood, "env") : undefined;

  return typeof env === "object" && env !== null ? Reflect.get(env, "NODE_ENV") : undefined;
}

/** Hands the `process` the run found back to the page. */
function restore(): void {
  Reflect.deleteProperty(globalThis, "process");
  Reflect.set(globalThis, "process", found);
}

describe("the process a console bundle's module reads", () => {
  test("is what those reads ask and claims no Node runtime", () => {
    const stood = browserProcess();

    expect(stood.env.NODE_ENV).toBe("production");
    expect(stood.argv).toEqual([]);
    expect(Reflect.has(stood, "versions")).toBe(false);
    expect(Reflect.has(stood, "stdout")).toBe(false);
  });

  test("stands where the page carries no process at all", () => {
    Reflect.deleteProperty(globalThis, "process");
    standProcess();

    const locale = localeStoodOnPage();

    restore();
    expect(locale).toBe("production");
  });

  test("leaves the process the page already carries", () => {
    const held = { env: { NODE_ENV: "development" }, argv: [] };

    Reflect.set(globalThis, "process", held);
    standProcess();

    const kept = Object.is(Reflect.get(globalThis, "process"), held);

    restore();
    expect(kept).toBe(true);
  });

  test("stands where a tooling refuses every process it is handed", () => {
    let stood: unknown;

    Reflect.deleteProperty(globalThis, "process");
    Object.defineProperty(globalThis, "process", {
      configurable: true,
      get: () => stood,
      set: (value: { env?: { NODE_ENV?: string } }) => {
        if (value.env?.NODE_ENV !== "development") stood = value;
      }
    });

    Reflect.set(globalThis, "process", { env: { NODE_ENV: "development" }, versions: { node: "24" } });
    standProcess();

    const locale = localeStoodOnPage();

    restore();
    expect(locale).toBe("production");
  });
});
