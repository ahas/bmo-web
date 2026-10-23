import { describe, expect, test } from "bun:test";
import { join } from "node:path";

import ts from "typescript";
import { parse } from "vue/compiler-sfc";

import { WORDING_KEYS } from "bmo-ui/shared/wording-keys";
import { packEntries, wording } from "../../apps/web/shared/wording";

// The language pack holds the console's words, and this is what keeps it so (`docs/web.md`,
// "Wording and the language pack"): no word left standing in a screen, a server route, the shared
// code or a script; no key asked for that the pack does not hold; no key the pack holds that nothing
// asks for, the keys the bmo-ui layer reads counted as asked; and every value one the engine can
// read. A console bundle's words stand in the bundle's own pack, which the console merges and this
// test does not hold.

const clientRoot = join(import.meta.dir, "..", "..", "apps", "web");

// The roles a key's second part names. A key is `<domain>.<role>.<key>`.
const ROLES = ["title", "label", "action", "placeholder", "aria", "status", "message", "error"];
const KEY_SHAPE = new RegExp(`^[a-z][a-z0-9_]*\\.(${ROLES.join("|")})\\.[a-z0-9_.]+$`);
const KEY_HEAD = new RegExp(`^[a-z][a-z0-9_]*\\.(${ROLES.join("|")})\\.`);
const SEGMENT = /^[a-z][a-z0-9_]*$/;

// The names a key is asked of: a screen's `t` and `$t`, and the server's and the tests' `wording`.
const TRANSLATORS = new Set(["t", "$t", "wording"]);

// Any letter of the Korean script. Korean that is data — compared against, used as an id
// or a key, matched in what a unit writes — stands in the data file beside the pack, never in a code file.
const HANGUL = /\p{Script=Hangul}/u;


interface Found {
  path: string;
  line: number;
  text: string;
}

interface Scan {
  words: Found[];
  keys: Found[];
  builtKeys: Found[];
  wordingValues: Found[];
}

// Client app code takes nothing from the shared wording module but its types: a value taken from it
// pulls the pack itself into the browser's bundle, which the development server cannot serve.
const WORDING_MODULE = /(^#shared|\/shared)\/wording$/;

function takesWordingValue(node: ts.ImportDeclaration): boolean {
  const clause = node.importClause;

  if (clause === undefined) return true;
  if (clause.isTypeOnly) return false;
  if (clause.name !== undefined) return true;

  const bindings = clause.namedBindings;

  return bindings !== undefined && (ts.isNamespaceImport(bindings) || bindings.elements.some((one) => !one.isTypeOnly));
}

function lineAt(source: string, offset: number): number {
  let line = 1;

  for (let at = source.indexOf("\n"); at !== -1 && at < offset; at = source.indexOf("\n", at + 1)) {
    line++;
  }

  return line;
}

// Reads one piece of TypeScript — a whole file, a component's script, or one expression out of its
// template — standing at `base` in the file `source` it was cut from.
function scanScript(path: string, source: string, code: string, base: number, scan: Scan): void {
  const file = ts.createSourceFile(path, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);

  const found = (node: ts.Node, text: string): Found => {
    const start = node.getStart(file);
    const inside = code.slice(start, node.end).search(HANGUL);

    return { path, line: lineAt(source, base + start + Math.max(inside, 0)), text };
  };

  const visit = (node: ts.Node): void => {
    // A literal type is never shown to anyone; the value it types is, and is read where it stands.
    if (ts.isLiteralTypeNode(node)) {
      return;
    }

    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      if (KEY_SHAPE.test(node.text)) {
        scan.keys.push(found(node, node.text));
      }
    }

    if (
      ts.isStringLiteral(node) ||
      ts.isNoSubstitutionTemplateLiteral(node) ||
      ts.isTemplateHead(node) ||
      ts.isTemplateMiddle(node) ||
      ts.isTemplateTail(node)
    ) {
      if (HANGUL.test(node.text)) {
        scan.words.push(found(node, node.text));
      }
    }

    if (path.startsWith("app/")) {
      if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier) && WORDING_MODULE.test(node.moduleSpecifier.text) && takesWordingValue(node)) {
        scan.wordingValues.push(found(node, node.getText(file)));
      }

      if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
        const first = node.arguments[0];

        if (first !== undefined && ts.isStringLiteral(first) && WORDING_MODULE.test(first.text)) {
          scan.wordingValues.push(found(node, node.getText(file)));
        }
      }
    }

    if (ts.isTemplateExpression(node) && KEY_HEAD.test(node.head.text)) {
      scan.builtKeys.push(found(node, node.getText(file)));
    }

    if (ts.isCallExpression(node) && TRANSLATORS.has(node.expression.getText(file))) {
      const first = node.arguments[0];

      if (first !== undefined && ts.isTemplateExpression(first)) {
        scan.builtKeys.push(found(first, first.getText(file)));
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(file);
}

// What a component's template holds: its text, its attributes, and the expressions in its
// interpolations and directives, which are TypeScript and read as such. An expression the compiler
// has joined from parts carries no text of its own, and its parts may be bare strings; a parsed
// template holds neither, so what is not text or a node is passed over.
interface TemplateExpression {
  type: number;
  content?: unknown;
  loc: { start: { offset: number } };
}

interface TemplateNode {
  type: number;
  content?: unknown;
  loc: { start: { offset: number } };
  props?: { type: number; value?: { content: string; loc: { start: { offset: number } } }; exp?: TemplateExpression }[];
  children?: readonly (TemplateNode | string | symbol)[];
}

const TEXT = 2;
const INTERPOLATION = 5;
const ATTRIBUTE = 6;
const DIRECTIVE = 7;

function isExpression(content: unknown): content is TemplateExpression {
  return typeof content === "object" && content !== null && "loc" in content;
}

function scanTemplate(path: string, source: string, node: TemplateNode, scan: Scan): void {
  if (node.type === TEXT && typeof node.content === "string" && HANGUL.test(node.content)) {
    const inside = node.content.search(HANGUL);

    scan.words.push({ path, line: lineAt(source, node.loc.start.offset + inside), text: node.content.trim() });
  }

  if (node.type === INTERPOLATION && isExpression(node.content)) {
    scanScript(path, source, typeof node.content.content === "string" ? node.content.content : "", node.content.loc.start.offset, scan);
  }

  for (const prop of node.props ?? []) {
    if (prop.type === ATTRIBUTE && prop.value !== undefined && HANGUL.test(prop.value.content)) {
      const inside = prop.value.content.search(HANGUL);

      scan.words.push({ path, line: lineAt(source, prop.value.loc.start.offset + inside), text: prop.value.content });
    }

    if (prop.type === DIRECTIVE && prop.exp !== undefined && typeof prop.exp.content === "string") {
      scanScript(path, source, prop.exp.content, prop.exp.loc.start.offset, scan);
    }
  }

  for (const child of node.children ?? []) {
    if (typeof child === "object") scanTemplate(path, source, child, scan);
  }
}

// The console's own source, its scripts and the service worker: the one script the browser runs
// outside the app, which puts a notification on the screen.
async function* sourcePaths(): AsyncGenerator<[string, string]> {
  for (const pattern of ["{app,server,shared,scripts}/**/*.{ts,vue}", "public/**/*.js"]) {
    for await (const path of new Bun.Glob(pattern).scan({ cwd: clientRoot })) yield [clientRoot, path];
  }
}

async function scanSources(): Promise<{ paths: string[]; scan: Scan; lines: Map<string, string[]> }> {
  const scan: Scan = { words: [], keys: [], builtKeys: [], wordingValues: [] };
  const lines = new Map<string, string[]>();
  const paths: string[] = [];

  for await (const [root, path] of sourcePaths()) {
    if (/\.test\.ts$/.test(path)) {
      continue;
    }

    const source = await Bun.file(join(root, path.replace(/^bundle\//, ""))).text();

    paths.push(path);
    lines.set(path, source.split("\n"));

    if (path.endsWith(".vue")) {
      const { descriptor } = parse(source, { filename: path });

      if (descriptor.template?.ast !== undefined) {
        scanTemplate(path, source, descriptor.template.ast, scan);
      }

      for (const block of [descriptor.script, descriptor.scriptSetup]) {
        if (block !== null) {
          scanScript(path, source, block.content, block.loc.start.offset, scan);
        }
      }
    } else {
      scanScript(path, source, source, 0, scan);
    }
  }

  return { paths, scan, lines };
}

const { scan } = await scanSources();
const entries = packEntries();
const packKeys = new Set(entries.map(([key]) => key));

const where = (one: Found): string => `${one.path}:${one.line}: ${one.text}`;
const own = (one: Found): boolean => !one.path.startsWith("bundle/");

describe("the console's words", () => {
  test("stand in the language pack and nowhere in the screens, the server, the shared code, the scripts or the service worker", () => {
    expect(scan.words.filter(own).map(where)).toEqual([]);
  });

  test("every key asked for is one the pack holds", () => {
    const missing = scan.keys.filter((one) => !packKeys.has(one.text));

    expect(missing.map(where)).toEqual([]);
  });

  test("no key is built out of pieces, so every key asked for can be found by reading", () => {
    expect(scan.builtKeys.filter(own).map(where)).toEqual([]);
  });

  test("client app code takes nothing from the shared wording module but its types", () => {
    expect(scan.wordingValues.filter(own).map(where)).toEqual([]);
  });

  test("answers every key the bmo-ui layer reads", () => {
    expect(WORDING_KEYS.filter((key) => !packKeys.has(key))).toEqual([]);
  });
});

describe("the language pack", () => {
  test("holds no key that nothing asks for", () => {
    const asked = new Set<string>([...scan.keys.map((one) => one.text), ...WORDING_KEYS]);

    expect([...packKeys].filter((key) => !asked.has(key))).toEqual([]);
  });

  test("names every key `<domain>.<role>.<key>` in lower snake case", () => {
    const misnamed = [...packKeys].filter((key) => {
      const parts = key.split(".");

      return parts.length < 3 || !parts.every((part) => SEGMENT.test(part)) || !ROLES.includes(parts[1]!);
    });

    expect(misnamed).toEqual([]);
  });

  // A space or a separator at a value's edge joins it to what stands beside it on the screen, and the
  // template compiler drops the bare whitespace that would carry it, so it is written in the template.
  test("holds no value that begins or ends with a space or a separator", () => {
    const edged = entries.filter(([, value]) => /^[\s·]|[\s·]$/.test(value)).map(([key]) => key);

    expect(edged).toEqual([]);
  });

  test("holds only values the engine reads as they are written", () => {
    const broken: string[] = [];

    for (const [key, value] of entries) {
      // A bare `|` would be read as the choice between plural forms, which the pack never uses.
      if (value.replace(/\{'[^']*'\}/g, "").includes("|")) {
        broken.push(`${key}: a bare | splits the value into plural forms`);
        continue;
      }

      const params = Object.fromEntries([...value.matchAll(/\{(\w+)\}/g)].map(([, name]) => [name!, "x"]));

      try {
        wording(key, params);
      } catch (error) {
        broken.push(`${key}: ${(error as Error).message.split("\n")[0]}`);
      }
    }

    expect(broken).toEqual([]);
  });
});
