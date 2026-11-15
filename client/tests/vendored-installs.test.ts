import { expect, test } from "bun:test";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

// Every package the console takes from a tarball under vendor/ runs as that tarball holds it. Bun installs a
// package's files as hard links to its shared install cache, so a file written in place inside any node_modules
// changes every checkout and build tree linked to the same entry, and a later install links the changed entry
// again (docs/checks.md, "The vendored packages as installed"). So every file the tarball holds is read against
// its installed copy. Only the tarball's files are read: the install writes markers of its own beside them, such
// as `.bun-tag`, which no tarball holds.

const CLIENT = join(import.meta.dir, "..");

interface Manifest {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  workspaces?: string[];
}

interface Vendored {
  name: string;
  tarball: string;
  installed: string;
}

function manifest(project: string): Manifest {
  return JSON.parse(readFileSync(join(project, "package.json"), "utf8")) as Manifest;
}

function projects(): string[] {
  const members = (manifest(CLIENT).workspaces ?? []).flatMap((pattern) =>
    [...new Bun.Glob(`${pattern}/package.json`).scanSync({ cwd: CLIENT })].map((file) => dirname(join(CLIENT, file)))
  );

  return [CLIENT, ...members];
}

function vendored(project: string): Vendored[] {
  const { dependencies, devDependencies } = manifest(project);

  return Object.entries({ ...dependencies, ...devDependencies })
    .filter(([, spec]) => spec.startsWith("file:") && spec.endsWith(".tgz"))
    .map(([name, spec]) => ({
      name,
      tarball: resolve(project, spec.slice("file:".length)),
      installed: realpathSync(join(project, "node_modules", name)),
    }));
}

// The tarball's entries stand under one top folder, `package/`, which the install drops.
async function packed(tarball: string): Promise<Map<string, Uint8Array>> {
  const files = await new Bun.Archive(await Bun.file(tarball).bytes()).files();
  const entries = await Promise.all(
    [...files].map(async ([path, file]) => [path.slice(path.indexOf("/") + 1), await file.bytes()] as const)
  );

  return new Map(entries);
}

async function findings(pkg: Vendored): Promise<string[]> {
  const expected = await packed(pkg.tarball);

  return [...expected]
    .filter(([path, bytes]) => {
      const installed = join(pkg.installed, path);

      return !existsSync(installed) || Buffer.compare(readFileSync(installed), bytes) !== 0;
    })
    .map(([path]) => `${pkg.name}: ${path} differs from ${relative(CLIENT, pkg.tarball)}`);
}

test("every vendored package stands installed as its tarball holds it", async () => {
  const packages = projects().flatMap(vendored);
  const found = (await Promise.all(packages.map(findings))).flat();

  expect(packages.length).toBeGreaterThan(0);
  expect(found).toEqual([]);
});
