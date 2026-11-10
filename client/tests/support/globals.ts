import { afterAll } from "bun:test";

// A test file that puts stand-ins on the global object for the routes it loads puts them there for every file
// after it, in whatever order the machine running the suite walks the tree. A file names the globals it sets,
// once at its head before it sets them, and each goes back as the file ends: taken away where nothing stood
// there, given its earlier value where something did.
export function globalsRestoredAfter(names: string[]): void {
  const globals = globalThis as Record<string, unknown>;
  const held = names.map((name) => [name, name in globals, globals[name]] as const);

  afterAll(() => {
    for (const [name, stood, value] of held) {
      if (stood) globals[name] = value;
      else delete globals[name];
    }
  });
}
