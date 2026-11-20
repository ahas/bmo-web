import { describe, expect, test } from "bun:test";

// The answers one turn of a round wrote, read from the file that ships and the pack its words stand in.

const source = await Bun.file(new URL("../../../apps/web/app/components/DraftVersions.vue", import.meta.url)).text();
const pack = await Bun.file(new URL("../../../apps/web/i18n/locales/ko.yaml", import.meta.url)).text();

describe("the answers a turn wrote", () => {
  test("stand only where the turn wrote more than one", () => {
    expect(source).toContain('v-if="props.versions.length > 1"');
  });

  test("name what opened each in the pack's words, never the receiver's", () => {
    for (const key of ["draft_versions", "draft_version_handed", "draft_version_program"]) {
      expect(source).toContain(`room.label.${key}`);
      expect(pack).toContain(`    ${key}:`);
    }
    expect(source).not.toContain('{{ version.opened }}');
  });
});
