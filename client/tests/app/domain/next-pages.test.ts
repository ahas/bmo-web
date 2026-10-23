import { describe, expect, test } from "bun:test";

import { nextTick, ref, watch } from "vue";

import { useNextPages } from "../../../apps/web/app/domain/next-pages";

// A list's next pages read while its foot stands in view. What is pinned here is that the reads following one
// another because the foot is still in view are one wait — the foot's placeholder stands once across them — and
// that the run ends where the foot leaves the view, where nothing more is held, or where a page did not land.

interface Source {
  atFoot: ReturnType<typeof ref<boolean>>;
  // How many pages the source holds past the first, and how many have been read.
  held: number;
  read: number;
  busy: boolean;
  // What the placeholder did, as each change of it happened.
  shown: boolean[];
  // What happens as each page lands: the foot measured against it, or the read refused.
  onPage: (page: number) => { atFoot?: boolean; landed?: boolean };
}

function source(held: number, onPage: Source["onPage"] = () => ({})): Source & { adding: () => boolean } {
  const state: Source = { atFoot: ref(false), held, read: 0, busy: false, shown: [], onPage };
  const { adding } = useNextPages({
    atFoot: state.atFoot as never,
    more: () => state.read < state.held,
    busy: () => state.busy,
    next: async () => {
      const page = ++state.read;
      const after = state.onPage(page);

      if (after.atFoot !== undefined) state.atFoot.value = after.atFoot;

      return after.landed ?? true;
    },
    settled: async () => {
      await Promise.resolve();
    }
  });

  watch(adding, (now) => state.shown.push(now), { flush: "sync" });

  return Object.assign(state, { adding: () => adding.value });
}

async function settle(): Promise<void> {
  for (let turn = 0; turn < 20; turn++) {
    await nextTick();
    await Promise.resolve();
  }
}

describe("a list's next pages", () => {
  test("pages that leave the foot in view are read as one wait, until nothing more is held", async () => {
    const list = source(4);

    list.atFoot.value = true;
    await settle();

    expect(list.read).toBe(4);
    expect(list.shown).toEqual([true, false]);
    expect(list.adding()).toBe(false);
  });

  test("the run ends once a page pushes the foot out of view", async () => {
    const list = source(5, (page) => (page === 2 ? { atFoot: false } : {}));

    list.atFoot.value = true;
    await settle();

    expect(list.read).toBe(2);
    expect(list.shown).toEqual([true, false]);
  });

  test("a page that did not land ends the run rather than asking again", async () => {
    const list = source(5, (page) => (page === 1 ? { landed: false } : {}));

    list.atFoot.value = true;
    await settle();

    expect(list.read).toBe(1);
    expect(list.shown).toEqual([true, false]);
  });

  test("a read already going is waited out, and nothing is asked while it goes", async () => {
    const list = source(2, (page) => (page === 1 ? { atFoot: false } : {}));

    list.busy = true;
    list.atFoot.value = true;
    await settle();

    expect(list.read).toBe(0);
    expect(list.shown).toEqual([]);
  });
});
