import { init, parse } from "es-module-lexer";

// The text of a console bundle's module as the console rewrites it before the browser runs it (docs/web.md,
// 「Screens a unit brings」): where each import of a shared library points, how a dynamic import reaches the
// loader, and what the module's own `import.meta` holds. The loader (`bundle-loader.ts`) supplies the addresses.

// Where a rewritten module finds the console's copies and its own later imports. A module made from text has no
// scope of the console's, so the two stand on the global object under names no page code uses.
export const SHARED_KEY = "bmo.console.shared";
export const IMPORT_KEY = "bmo.console.import";

// Words a module cannot bind as a name of its own, which a library's export never takes.
const RESERVED = new Set(["break", "case", "catch", "class", "const", "continue", "debugger", "default", "delete", "do", "else", "enum", "export",
  "extends", "false", "finally", "for", "function", "if", "import", "in", "instanceof", "new", "null", "return", "super", "switch", "this", "throw",
  "true", "try", "typeof", "var", "void", "while", "with", "await", "let", "static", "yield"]);
const NAME = /^[A-Za-z_$][\w$]*$/;

/** Whether a module path is a library's own rather than a file beside the module. */
export function bare(specifier: string): boolean {
  return !/^(?:\.{0,2}\/|[a-z][a-z0-9+.-]*:)/i.test(specifier);
}

/** The source of the module standing for a shared library: every name its namespace exports, read off the copy. */
export function shimSource(specifier: string, names: readonly string[]): string {
  const bound = names.filter((name) => name !== "default" && NAME.test(name) && !RESERVED.has(name));

  return [
    `const m = globalThis[Symbol.for(${JSON.stringify(SHARED_KEY)})].get(${JSON.stringify(specifier)});`,
    "export default m.default;",
    `export const { ${bound.join(", ")} } = m;`,
    ""
  ].join("\n");
}

/** One change to a module's text: the stretch it replaces and what stands there instead. */
export interface Edit {
  start: number;
  end: number;
  text: string;
}

/** The text with every edit made, the edits standing apart from each other. */
export function edited(source: string, edits: readonly Edit[]): string {
  let text = source;

  for (const edit of [...edits].sort((one, other) => other.start - one.start)) {
    text = text.slice(0, edit.start) + edit.text + text.slice(edit.end);
  }

  return text;
}

/**
 * The edits a module's text takes: a static import's path becomes the address of the module standing for it, a
 * dynamic import goes through the loader with the module's own address to read a path against, and the module's
 * own `import.meta` is its address read off the relay and the plain fact that it runs in a browser.
 */
export async function editsOf(source: string, url: string, addressOf: (specifier: string) => Promise<string>): Promise<Edit[]> {
  await init;

  const [imports] = parse(source, url);
  const edits: Edit[] = [];

  for (const one of imports) {
    // `import.meta`, standing as the lexer reads it.
    if (one.d === -2) {
      edits.push({ start: one.s, end: one.e, text: `({ url: ${JSON.stringify(url)}, client: true, server: false, dev: false })` });

      continue;
    }

    // A dynamic import: the word `import` before its parenthesis becomes the loader, bound to the module's address.
    if (one.d > -1) {
      edits.push({ start: one.ss, end: one.d, text: `globalThis[Symbol.for(${JSON.stringify(IMPORT_KEY)})].bind(null, ${JSON.stringify(url)})` });

      continue;
    }

    if (one.n === undefined) continue;

    edits.push({ start: one.s, end: one.e, text: await addressOf(one.n) });
  }

  return edits;
}
