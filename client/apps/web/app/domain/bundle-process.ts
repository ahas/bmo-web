// The `process` a console bundle's module reads (docs/web.md, 「Screens a unit brings」): a library inside a unit's
// browser build can read `process.env` or `process.argv` where the built code stands, and the console's own browser
// build names no `process`, so on a page the console draws in the browser the module would end before its routes
// stand. What is stood holds only those reads and claims no Node runtime: a build telling Node from a browser looks
// at `process.versions` or `process.stdout` and finds neither, and takes the browser path it was built for.

/** What a bundle module may read of `process`: the build's own environment and nothing naming a Node runtime. */
export interface BundleProcess {
  env: { NODE_ENV: string };
  argv: string[];
}

/** The `process` stood for a bundle's module, of a production build. */
export function browserProcess(): BundleProcess {
  return { env: { NODE_ENV: "production" }, argv: [] };
}

/** Stands that `process` on the page where none stands, and leaves the one that stands alone. The page is read by
 * its value rather than by its property standing, so a `process` left as nothing is replaced. */
export function standProcess(): void {
  if (Reflect.get(globalThis, "process") !== undefined) return;

  Reflect.set(globalThis, "process", browserProcess());
}
