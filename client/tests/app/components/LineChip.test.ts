import { describe, expect, test } from "bun:test";

import { readTurnActionsFolds } from "../../../apps/web/app/domain/turn-actions-fold";

// The one chip every chip of a row's thin line is, and the fold behind the lists two of them
// spread. Both are read off the files that ship: what a rendered screen would not name is that every
// chip wears the one look out of the one component, and that the browser keeps where a running
// turn's lists start, one sort at a time.

const chip = await Bun.file(new URL("../../../apps/web/app/components/LineChip.vue", import.meta.url)).text();
const token = await Bun.file(new URL("../../../apps/web/app/components/TokenChip.vue", import.meta.url)).text();
const settings = await Bun.file(new URL("../../../apps/web/app/domain/turn-actions-fold.ts", import.meta.url)).text();

describe("a chip of the thin line", () => {
  test("is a mark named by its tooltip, and says which way it goes for a reader who cannot see it", () => {
    // Its name is said by the console's one tooltip, which a finger reaches by holding it.
    expect(chip).toMatch(/<HintTip\s+:text="props\.label"\s+press\s+as="button"/);
    expect(chip).toContain('<UIcon v-if="props.icon !== ''" :name="props.icon" class="size-4 shrink-0" :class="props.iconClass" />');
    expect(chip).toContain("`${props.label} ${props.open ? $t('common.action.collapse') : $t('common.action.expand')}`");
    expect(chip).toContain(':aria-expanded="props.open"');
  });

  test("keeps a fixed width while the figure it carries climbs", () => {
    expect(chip).toContain("tabular-nums");
  });

  test("answers to a pointer the way every other chip of the row does", () => {
    expect(chip).toContain(':class="chipLook(props.open, props.over)"');
    // It stands on the meta line, at that line's height.
    expect(chip).toContain('h-(--chat-meta-line)');
  });

  test("the figure a run spent is one of them, carrying its one figure and no letters", () => {
    expect(token).toContain('<LineChip :icon="CHIP_ICONS.tokens" :label="$t(CHIP_LABELS.tokens)"');
    expect(token).toContain('<RollingNumber v-if="props.chip.figure !== null" :value="props.chip.figure" :text="props.chip.text" />');
    expect(token).toContain("<span v-else>{{ props.chip.text }}</span>");
    expect(token).not.toContain("ShortKinds");
  });
});

describe("the fold the console keeps", () => {
  test("is a choice per sort in the browser it was made in, both folded until one is spread", () => {
    expect(settings).toContain('const TURN_ACTIONS_KEY = "bmo-web.turn-actions";');
    expect(settings).toContain('useState<TurnActionsFolds>("bmo-turn-actions", () => ({ context: true, tool: true }))');
    expect(settings).toContain("folded.value = { ...folded.value, [kind]: next };");
    expect(settings).toContain("window.localStorage.setItem(TURN_ACTIONS_KEY, JSON.stringify(folded.value))");
  });

  test("reads back one sort at a time, and anything not kept for a sort stands it folded", () => {
    expect(readTurnActionsFolds({ context: true, tool: false })).toEqual({ context: true, tool: false });
    expect(readTurnActionsFolds({ tool: false })).toEqual({ context: true, tool: false });
    expect(readTurnActionsFolds("folded")).toEqual({ context: true, tool: true });
    expect(readTurnActionsFolds(null)).toEqual({ context: true, tool: true });
    expect(readTurnActionsFolds({ context: "yes", tool: 1 })).toEqual({ context: true, tool: true });
  });

  test("is put back after the mount, the way every other kept choice is", () => {
    const opened = settings.indexOf("export function useTurnActionsFold");
    const body = settings.slice(opened, settings.indexOf("\nfunction readTurnActionsFold", opened));

    expect(body).toContain("afterMount(");
    expect(body).toContain("import.meta.client && !restoredTurnActions");
  });

  test("a browser that refuses storage still folds for this visit", () => {
    const opened = settings.indexOf("export function useTurnActionsFold");
    const body = settings.slice(opened, settings.indexOf("\nfunction readTurnActionsFold", opened));

    expect(body).toContain("try {");
    expect(body).toContain("} catch {");
  });
});
