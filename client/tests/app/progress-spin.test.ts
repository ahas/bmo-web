import { describe, expect, test } from "bun:test";
import { Glob } from "bun";
import { babelParse, parse } from "vue/compiler-sfc";

// The work-in-progress mark turns only where the screen drawing it spins it: bmo-ui's stylesheet turns none of its
// own accord, so a mark the console names without its spin stands still while its work runs. Every file that ships
// is read, its templates by Vue's own compiler and its scripts by the parser that compiler uses.

const app = new URL("../../apps/web/", import.meta.url).pathname;
const MARK = "progress-activity";
const SPIN = "animate-spin";
// A look that hands the mark out with a flag saying it turns, for the component drawing it to spin.
const SPIN_FLAGS = new Set(["spin", "spins"]);
// The library's own loading icon, named by the app configuration and by a `loading` prop, which the library spins
// itself wherever it draws it.
const LIBRARY_SPUN = "loading";

// The node kinds of Vue's template tree that are read here, by the numbers its compiler gives them.
const ELEMENT = 1;
const ATTRIBUTE = 6;
const DIRECTIVE = 7;

// A directive's argument is a plain expression, or a joined one built from parts and carrying no content of its own.
interface TemplateExpression {
  type: number;
  content?: string;
}

interface TemplateProp {
  type: number;
  name: string;
  arg?: TemplateExpression;
  loc: { source: string };
}

interface TemplateNode {
  type: number;
  props?: TemplateProp[];
  children?: readonly (TemplateNode | string | symbol)[];
  loc: { start: { line: number } };
}

// What is read of a parsed script's nodes: the kind, the line it starts on, and the members these reads name. The
// parser's own nodes carry far more than this, and any one of them stands where this shape is read.
interface ScriptNode {
  type: string;
  loc?: { start: { line: number } } | null;
  name?: string;
  key?: ScriptNode | null;
  value?: unknown;
  properties?: ScriptNode[];
}

function propNamed(prop: TemplateProp, name: string): boolean {
  return (prop.type === ATTRIBUTE && prop.name === name) || (prop.type === DIRECTIVE && prop.name === "bind" && prop.arg?.content === name);
}

// A joined expression's parts stand beside its nodes as bare strings and symbols, and are passed over.
function isTemplateNode(node: TemplateNode | string | symbol): node is TemplateNode {
  return typeof node === "object";
}

function elements(node: TemplateNode): TemplateNode[] {
  const own = node.type === ELEMENT ? [node] : [];

  return [...own, ...(node.children ?? []).filter(isTemplateNode).flatMap(elements)];
}

function spinsOwn(element: TemplateNode): boolean {
  return (element.props ?? []).some((prop) => prop.loc.source.includes(SPIN));
}

// An element naming the mark carries its spin, or the library's loading state that spins it.
function stillInTemplate(root: TemplateNode): number[] {
  return elements(root)
    .filter((element) => (element.props ?? []).some((prop) => prop.loc.source.includes(MARK)))
    .filter((element) => !spinsOwn(element) && !(element.props ?? []).some((prop) => propNamed(prop, LIBRARY_SPUN)))
    .map((element) => element.loc.start.line);
}

function isNode(value: unknown): value is ScriptNode {
  return typeof value === "object" && value !== null && "type" in value && typeof value.type === "string";
}

// Every member a node carries is read for children, arrays of nodes among them, so no node kind is named here.
function childrenOf(node: ScriptNode): ScriptNode[] {
  const members: [string, unknown][] = Object.entries(node);

  return members
    .filter(([key]) => !key.endsWith("Comments"))
    .flatMap(([, value]) => (Array.isArray(value) ? value : [value]))
    .filter(isNode);
}

// A node standing in another node's member: the parser puts a property's key and value there.
function nodeOf(value: unknown): ScriptNode | null {
  return isNode(value) ? value : null;
}

function textOf(node: ScriptNode): string | null {
  if (node.type === "StringLiteral" && typeof node.value === "string") return node.value;
  if (node.type === "TemplateElement") return cookedOf(node.value);

  return null;
}

// A template piece's text is the cooked value beside its raw source, which the parser leaves null where an escape
// does not form; that value stands in the piece and is no node of its own.
function cookedOf(value: unknown): string | null {
  if (typeof value !== "object" || value === null || !("cooked" in value)) return null;

  return typeof value.cooked === "string" ? value.cooked : null;
}

function keyName(property: ScriptNode): string | null {
  const key = property.key;

  if (key?.type === "Identifier") return key.name ?? null;
  if (key?.type === "StringLiteral") return typeof key.value === "string" ? key.value : null;

  return null;
}

function holdsSpin(node: ScriptNode): boolean {
  return textOf(node)?.includes(SPIN) === true || childrenOf(node).some(holdsSpin);
}

// The object a mark stands in says it turns: by a spin flag set true, or by a spin class among its values.
function objectSpins(object: ScriptNode): boolean {
  return (object.properties ?? []).some((property) => {
    const value = nodeOf(property.value);
    const flagged = SPIN_FLAGS.has(keyName(property) ?? "") && value?.type === "BooleanLiteral" && value.value === true;

    return flagged || (value !== null && holdsSpin(value));
  });
}

// A mark a script names is handed out as the library's loading icon, or stands in an object that says it turns; a
// component whose own template spins it may name it bare. Each mark found otherwise is answered by its line.
function stillInScript(code: string, line: number, templateSpins: boolean): number[] {
  const still: number[] = [];

  function walk(node: ScriptNode, ancestors: ScriptNode[]): void {
    if (textOf(node)?.includes(MARK) === true) {
      const parent = ancestors.at(-1);
      const object = ancestors.findLast((one) => one.type === "ObjectExpression");
      const spun = (parent?.type === "ObjectProperty" && keyName(parent) === LIBRARY_SPUN) || (object !== undefined && objectSpins(object)) || templateSpins;

      if (!spun) still.push((node.loc?.start.line ?? 1) + line - 1);
    }

    for (const child of childrenOf(node)) walk(child, [...ancestors, node]);
  }

  walk(babelParse(code, { sourceType: "module", plugins: ["typescript"] }).program, []);

  return still;
}

function stillMarks(path: string, text: string): string[] {
  if (!path.endsWith(".vue")) return stillInScript(text, 1, false).map((line) => `${path}:${line}`);

  const { descriptor } = parse(text, { filename: path });
  const template = descriptor.template?.ast;
  const lines = template === undefined ? [] : stillInTemplate(template);
  const templateSpins = template !== undefined && elements(template).some(spinsOwn);

  for (const script of [descriptor.script, descriptor.scriptSetup]) {
    if (script !== null) lines.push(...stillInScript(script.content, script.loc.start.line, templateSpins));
  }

  return lines.map((line) => `${path}:${line}`);
}

async function named(): Promise<{ path: string; text: string }[]> {
  const files: { path: string; text: string }[] = [];

  for (const folder of ["app", "shared"]) {
    for await (const file of new Glob("**/*.{vue,ts}").scan({ cwd: `${app}${folder}` })) {
      const text = await Bun.file(`${app}${folder}/${file}`).text();

      if (text.includes(MARK)) files.push({ path: `${folder}/${file}`, text });
    }
  }

  return files;
}

describe("the work-in-progress mark", () => {
  test("is spun wherever the console names it", async () => {
    const files = await named();
    const still = files.flatMap((file) => stillMarks(file.path, file.text));

    expect(files.length).toBeGreaterThan(10);
    expect(still).toEqual([]);
  });

  test("is answered as still where the code names it with no spin", () => {
    const still = [
      ...stillMarks("Still.vue", `<template>\n  <UIcon name="i-material-symbols-${MARK}" class="size-4" />\n</template>\n`),
      ...stillMarks("looks.ts", `export const LOOK = { icon: "i-material-symbols-${MARK}", tone: "text-primary" };\n`)
    ];
    const spun = [
      ...stillMarks("Spun.vue", `<template>\n  <UIcon name="i-material-symbols-${MARK}" class="size-4 ${SPIN}" />\n  <UButton icon="i-material-symbols-${MARK}" loading />\n</template>\n`),
      ...stillMarks("flagged.ts", `export const LOOK = { icon: "i-material-symbols-${MARK}", spins: true };\nexport default { icons: { loading: "i-material-symbols-${MARK}" } };\n`)
    ];

    expect(still).toEqual(["Still.vue:2", "looks.ts:1"]);
    expect(spun).toEqual([]);
  });
});
