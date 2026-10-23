import { describe, expect, test } from "bun:test";
import { Glob } from "bun";
import { parse } from "vue/compiler-sfc";

// No screen focuses an input on arrival; focus follows a user action (docs/web.md, 「Focus」). A screen is a page
// in its layout, so a box a page or a layout focuses as it mounts is one the screen focuses on arrival, unless it
// stands inside an overlay, which only opens on a press. The chat prompt focuses itself as it mounts unless told
// not to, wherever it is drawn. Both are read here off the files that ship, by the template compiler that reads
// them for the build.

const app = new URL("../../apps/web/app/", import.meta.url).pathname;

interface Node {
  type: number;
  tag?: string;
  props?: { type: number; name: string; arg?: { content?: string }; exp?: { content?: string } }[];
  children?: Node[];
}

const ELEMENT = 1;
const ATTRIBUTE = 6;
// The overlays a box may stand in and take the focus as it opens: each opens only on a press.
const OVERLAY = /(Modal|Slideover|Popover|Drawer|Dialog)$/;

async function templates(pattern: string): Promise<{ path: string; root: Node }[]> {
  const found: { path: string; root: Node }[] = [];

  for await (const path of new Glob(pattern).scan({ cwd: app })) {
    const { descriptor } = parse(await Bun.file(app + path).text(), { filename: path });

    if (descriptor.template?.ast) found.push({ path, root: descriptor.template.ast as unknown as Node });
  }

  return found;
}

// What the autofocus prop is given: `true` written bare or bound to anything but `false`.
function autofocus(node: Node): string | null {
  for (const one of node.props ?? []) {
    if (one.type === ATTRIBUTE && one.name === "autofocus") return "true";
    if (one.type !== ATTRIBUTE && one.name === "bind" && one.arg?.content === "autofocus") return one.exp?.content ?? "";
  }

  return null;
}

function walk(node: Node, inOverlay: boolean, visit: (node: Node, inOverlay: boolean) => void): void {
  const here = inOverlay || (node.type === ELEMENT && OVERLAY.test(node.tag ?? ""));

  if (node.type === ELEMENT) visit(node, here);
  for (const child of node.children ?? []) walk(child, here, visit);
}

describe("focus on arrival", () => {
  test("no page or layout focuses a box as it mounts outside an overlay", async () => {
    const focused: string[] = [];

    for (const { path, root } of await templates("{pages,layouts}/**/*.vue")) {
      walk(root, false, (node, inOverlay) => {
        const given = autofocus(node);

        if (!inOverlay && given !== null && given !== "false") focused.push(`${path} ${node.tag}`);
      });
    }

    expect(focused).toEqual([]);
  });

  test("every chat prompt is told not to focus itself", async () => {
    const left: string[] = [];
    let prompts = 0;

    for (const { path, root } of await templates("{pages,components,layouts}/**/*.vue")) {
      walk(root, false, (node) => {
        if (node.tag !== "UChatPrompt") return;

        prompts += 1;

        if (autofocus(node) !== "false") left.push(path);
      });
    }

    expect(prompts).toBeGreaterThan(0);
    expect(left).toEqual([]);
  });
});
