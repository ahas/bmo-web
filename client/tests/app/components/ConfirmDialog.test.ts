import { describe, expect, test } from "bun:test";
import { Glob } from "bun";

// The question asked before an action (docs/web.md, 「Messages」): the component library's dialog naming the item and
// the action, its way out first and its way through last under the action's own verb, and never the message pill.
// Read from the files that ship.

const app = new URL("../../../apps/web/app/", import.meta.url);
const read = async (name: string) => await Bun.file(new URL(name, app)).text();
const dialog = await read("components/ConfirmDialog.vue");
const confirm = await read("domain/confirm.ts");
const template = dialog.slice(0, dialog.indexOf("<script"));

describe("the confirmation dialog", () => {
  test("is the component library's dialog, its question the title and the item named under it", () => {
    expect(template).toContain("<UModal");
    expect(template).toContain(':title="props.title"');
    expect(template).toContain(':description="props.item ?? undefined"');
    expect(template).toContain("{{ props.effect }}");
  });

  test("holds the way out first and the way through last, under the action's own verb", () => {
    const out = template.indexOf("$t('common.action.cancel')");
    const through = template.indexOf(':label="props.confirm"');

    expect(out).toBeGreaterThan(-1);
    expect(through).toBeGreaterThan(out);
    expect(template).toContain("emit('close', false)");
    expect(template).toContain("emit('close', true)");
  });

  test("answers yes only for the way through, every other way out answering no", () => {
    expect(confirm).toContain("overlay.create(ConfirmDialog, { props: asked, destroyOnClose: true }).open()) === true");
    expect(template).toContain('@close="open = false"');
  });
});

describe("the message pill", () => {
  test("asks nothing anywhere in the console", async () => {
    const asking: string[] = [];
    let swept = 0;

    for await (const path of new Glob("**/*.{vue,ts}").scan({ cwd: app.pathname })) {
      swept += 1;
      if ((await read(path)).includes("island.ask(")) asking.push(path);
    }

    expect(swept).toBeGreaterThan(100);
    expect(asking).toEqual([]);
  });
});
