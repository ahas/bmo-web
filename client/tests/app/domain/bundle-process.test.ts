import { afterAll, describe, expect, test } from "bun:test";

import { browserProcess, standProcess } from "../../../apps/web/app/domain/bundle-process";

// The `process` a console bundle's module reads, stood where the page carries none (docs/web.md, 「Screens a unit
// brings」). Each case takes the run's own `process` away, reads what stands in its place and gives it back at
// once, so the runner never goes on holding a page this test made.

const found = Reflect.get(globalThis, "process");

afterAll(() => {
  Reflect.set(globalThis, "process", found);
});

/** Reads the locale of the `process` the page holds now, and gives the one the run found back. */
function readAndRestore(): unknown {
  const stood = Reflect.get(globalThis, "process");
  const locale = stood === undefined ? undefined : Reflect.get(Reflect.get(stood, "env"), "NODE_ENV");

  Reflect.set(globalThis, "process", found);

  return locale;
}

describe("the process a console bundle's module reads", () => {
  test("is what those reads ask and claims no Node runtime", () => {
    const stood = browserProcess();

    expect(Reflect.get(Reflect.get(stood, "env"), "NODE_ENV")).toBe("production");
    expect(Reflect.get(stood, "argv")).toEqual([]);
    expect(Reflect.has(stood, "versions")).toBe(false);
    expect(Reflect.has(stood, "stdout")).toBe(false);
  });

  test("stands where the page carries no process at all", () => {
    Reflect.deleteProperty(globalThis, "process");
    standProcess();

    expect(readAndRestore()).toBe("production");
  });

  test("leaves the process the page already carries", () => {
    const held = { env: { NODE_ENV: "development" } };

    Reflect.set(globalThis, "process", held);
    standProcess();

    const kept = Reflect.get(globalThis, "process") === held;

    Reflect.set(globalThis, "process", found);

    expect(kept).toBe(true);
  });

  test("stands where a tooling leaves a process that is refused", () => {
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

    const locale = Reflect.get(Reflect.get(Reflect.get(globalThis, "process"), "env"), "NODE_ENV");

    Reflect.deleteProperty(globalThis, "process");
    Reflect.set(globalThis, "process", found);

    expect(locale).toBe("production");
  });
});
