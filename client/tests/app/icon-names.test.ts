import { describe, expect, test } from "bun:test";
import { Glob } from "bun";

// Every icon a screen names is one the set holds (docs/web.md, 「Fonts」): a Material Symbols name the set
// lacks draws nothing, an empty button with no word to say it failed. Every name the console's own code writes is
// read off the files that ship and looked up in the set the console installs.

const app = new URL("../../apps/web/", import.meta.url).pathname;
const SET = "@iconify-json/material-symbols/icons.json";

interface IconSet {
  icons: Record<string, unknown>;
  aliases?: Record<string, unknown>;
}

async function installed(): Promise<IconSet> {
  return (await import(Bun.resolveSync(SET, app), { with: { type: "json" } })).default as IconSet;
}

async function named(): Promise<Map<string, string>> {
  const names = new Map<string, string>();

  for (const folder of ["app", "shared"]) {
    for await (const file of new Glob("**/*.{vue,ts}").scan({ cwd: `${app}${folder}` })) {
      const text = await Bun.file(`${app}${folder}/${file}`).text();

      // A name ends where its letters end; one built from parts at run time ends in a dash and is not a whole name.
      for (const [, name] of text.matchAll(/i-material-symbols-([a-z0-9]+(?:-[a-z0-9]+)*)(?![a-z0-9-])/g)) {
        if (name !== undefined && !names.has(name)) names.set(name, `${folder}/${file}`);
      }
    }
  }

  return names;
}

describe("the icons the console names", () => {
  test("are all in the installed Material Symbols set", async () => {
    const set = await installed();
    const names = await named();
    const missing = [...names].filter(([name]) => !(name in set.icons) && !(name in (set.aliases ?? {}))).map(([name, file]) => `${name} (${file})`);

    expect(names.size).toBeGreaterThan(50);
    expect(missing).toEqual([]);
  });
});
