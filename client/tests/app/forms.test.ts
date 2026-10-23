import { describe, expect, test } from "bun:test";
import { Glob } from "bun";
import { parse } from "vue/compiler-sfc";
import KO from "../fixtures/app/forms.test.ko.json";

// A form saves once, from its foot (docs/web.md, 「Forms」): one Save button to a screen or a dialog, a
// dialog's in its footer, on only while something differs, and every way of closing a dialog that
// holds changes asking first. The guard and the question are the dialog's own, so what a form can
// forget is to say it is one — to hand the dialog whether it holds changes — and to put its save
// anywhere but the foot or a second one beside a section. That is read here off the files that ship,
// by the template compiler that reads them for the build.

const here = new URL(".", import.meta.url).pathname;

// What is read of the compiler's nodes. An expression the compiler has joined from parts carries no content of its
// own, and its parts may be bare strings; a parsed template holds neither, so a part that is not a node is passed over.
interface Expression {
  type: number;
  content?: string;
}

interface Node {
  type: number;
  tag?: string;
  props?: { type: number; name: string; arg?: Expression; exp?: Expression; value?: { content?: string } }[];
  children?: readonly (Node | string | symbol)[];
}

function childrenOf(node: Node): Node[] {
  return (node.children ?? []).filter((child): child is Node => typeof child === "object");
}

interface Template {
  path: string;
  root: Node;
}

const ELEMENT = 1;
const ATTRIBUTE = 6;
const SAVE = "common.action.save";

function templateOf(path: string, text: string): Template[] {
  const { descriptor } = parse(text, { filename: path });

  return descriptor.template?.ast ? [{ path, root: descriptor.template.ast }] : [];
}

async function templates(): Promise<Template[]> {
  const found: Template[] = [];

  for await (const path of new Glob("{pages,components,layouts}/**/*.vue").scan({ cwd: here })) {
    found.push(...templateOf(path, await Bun.file(new URL(path, import.meta.url)).text()));
  }

  return found;
}

// What a prop says, written plainly or bound.
function propText(node: Node, name: string): string | null {
  for (const one of node.props ?? []) {
    if (one.type === ATTRIBUTE && one.name === name) return one.value?.content ?? "";
    if (one.type !== ATTRIBUTE && one.name === "bind" && one.arg?.content === name) return one.exp?.content ?? "";
  }

  return null;
}

// The slot a template stands for, where it is one (`#footer`, `v-slot:footer`).
function slotOf(node: Node): string | null {
  return node.tag === "template" ? node.props?.find((one) => one.type !== ATTRIBUTE && one.name === "slot")?.arg?.content ?? null : null;
}

function elements(node: Node, into: Node[] = []): Node[] {
  if (node.type === ELEMENT) into.push(node);
  for (const child of childrenOf(node)) elements(child, into);

  return into;
}

function isSave(node: Node): boolean {
  return node.tag === "UButton" && [propText(node, "label"), propText(node, "aria-label")].some((text) => text?.includes(SAVE));
}

function manySaves(files: readonly Template[]): string[] {
  return files.filter((one) => elements(one.root).filter(isSave).length > 1).map((one) => one.path);
}

function unguarded(files: readonly Template[]): string[] {
  const wrong: string[] = [];

  for (const file of files) {
    for (const dialog of elements(file.root).filter((one) => one.tag === "SettingsDialog")) {
      const saves = elements(dialog).filter(isSave);

      if (saves.length === 0) continue;

      const footer = childrenOf(dialog).find((one) => slotOf(one) === "footer");
      const dirty = propText(dialog, "dirty");

      if (footer === undefined || elements(footer).filter(isSave).length !== saves.length) wrong.push(`${file.path}${KO.line_88}`);
      if (dirty === null) wrong.push(`${file.path}: no dirty`);
      // Its save is off while what the dialog is told stays unchanged.
      else if (!saves.every((save) => propText(save, "disabled")?.includes(dirty))) wrong.push(`${file.path}${KO.line_91}`);
    }
  }

  return wrong;
}

function cancelBypassing(files: readonly Template[]): string[] {
  const bypass: string[] = [];

  for (const file of files) {
    for (const dialog of elements(file.root).filter((one) => one.tag === "SettingsDialog" && propText(one, "dirty") !== null)) {
      const cancels = elements(dialog).filter((one) => one.tag === "UButton" && propText(one, "label")?.includes("common.action.cancel"));
      const guarded = (button: Node): boolean => button.props?.some((prop) => prop.name === "on" && prop.arg?.content === "click" && prop.exp?.content?.includes("close()")) ?? false;

      if (!cancels.every(guarded)) bypass.push(file.path);
    }
  }

  return bypass;
}

const files = await templates();

describe("the console's forms", () => {
  test("a screen or a dialog carries one save, never one to a section", () => {
    expect(manySaves(files)).toEqual([]);
  });

  test("a dialog's save stands in its footer, and the dialog is told whether its form holds changes", () => {
    expect(unguarded(files)).toEqual([]);
  });

  test("a form dialog's own cancel goes through the same guard as its close", () => {
    expect(cancelBypassing(files)).toEqual([]);
  });

  // The checks read what they are meant to: a settings dialog saving section by section is found.
  test("a dialog with a save under each section is caught", () => {
    const sections = templateOf("Sections.vue", `<template>
      <SettingsDialog v-model:open="open" title="x">
        <section><UButton :label="$t('${SAVE}')" @click="one()" /></section>
        <section><UButton :label="$t('${SAVE}')" @click="two()" /></section>
      </SettingsDialog>
    </template>`);

    expect(manySaves(sections)).toEqual(["Sections.vue"]);
    expect(unguarded(sections)).toEqual([KO.line_138, "Sections.vue: no dirty"]);
  });

  test("a footer save left on with nothing changed, and a cancel closing past the guard, are caught", () => {
    const footer = templateOf("Footer.vue", `<template>
      <SettingsDialog v-model:open="open" title="x" :dirty="changed">
        <UInput v-model="name" />
        <template #footer>
          <UButton :label="$t('common.action.cancel')" @click="open = false" />
          <UButton :label="$t('${SAVE}')" :disabled="saving" @click="save()" />
        </template>
      </SettingsDialog>
    </template>`);

    expect(unguarded(footer)).toEqual([KO.line_152]);
    expect(cancelBypassing(footer)).toEqual(["Footer.vue"]);
  });
});
